import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { flushSync } from 'react-dom'
import { buildAnnotatedPdfBytes } from '../exportPdf'
import { getFontEntry } from '../fonts'
import { drawAnnotationOverlay, findAnnotationAtCanvasPoint } from '../overlay'
import { openPdfFromBuffer, renderPdfPage, getPdfJsDocument } from '../pdfSession'
import type { Annotation, PdfPoint } from '../types'
import { isPenAnnotation, isTextAnnotation } from '../types'
import { annotationPastedAtTopLeft, cloneAnnotationForClipboard } from '../lib/clipboardAnnotation'
import {
  parseAnnotationsFile,
  pdfPathsMatch,
  serializeAnnotationsToJson,
  type ParsedAnnotationsFile,
} from '../lib/annotationJson'
import { deleteAutosave, readAutosave, writeAutosave } from '../lib/autosaveStorage'
import type { ConfirmResult } from '../components/ConfirmDialog'
import { hexIsNearWhite, inkColorFromHex } from '../lib/color'
import { penHasDrawableSegments, penPointsFarEnough } from '../lib/penGeometry'
import { editorReducer, initialEditorState, type EditorAction, type EditorState } from './editorState'
import { getActivePenPreviewForOverlay } from './penPreview'
import type { ActivePenStroke, ShiftPenCompose } from './penSession'

function isFormFieldTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const t = target.tagName
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT'
}

export type ConfirmSpec = {
  title: string
  message: string
  yesLabel?: string
  noLabel?: string
}

export type EditorContextValue = {
  state: EditorState
  dispatch: React.Dispatch<EditorAction>
  pdfCanvasRef: RefObject<HTMLCanvasElement | null>
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>
  inlineInputRef: RefObject<HTMLInputElement | null>
  canvasStackRef: RefObject<HTMLDivElement | null>
  applyColor: (hex: string) => void
  syncColorUi: (hex: string) => void
  openPdfFlow: () => Promise<void>
  savePdfFlow: () => Promise<void>
  saveAnnotationsFlow: () => Promise<void>
  openAnnotationsFlow: () => Promise<void>
  changePage: (delta: number) => Promise<void>
  setZoom: (next: number) => void
  setEditorMode: (mode: 'text' | 'pen') => void
  selectAnnotationById: (id: number) => Promise<void>
  deleteAnnotationById: (id: number) => void
  toggleBold: () => void
  bindCanvasListeners: () => () => void
  bindGlobalKeys: () => () => void
  bindShiftPenFinalize: () => () => void
  onPdfFileSelected: (file: File) => void
  onAnnotationsFileSelected: (file: File) => void
  onDropPdfFile: (file: File) => void
  setDragTarget: (on: boolean) => void
  confirmSpec: ConfirmSpec | null
  resolveConfirm: (result: ConfirmResult) => void
}

const EditorContext = createContext<EditorContextValue | null>(null)

export function useEditor(): EditorContextValue {
  const v = useContext(EditorContext)
  if (!v) throw new Error('useEditor outside EditorProvider')
  return v
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState)
  const stateRef = useRef(state)
  stateRef.current = state

  const pdfCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const inlineInputRef = useRef<HTMLInputElement>(null)
  const canvasStackRef = useRef<HTMLDivElement>(null)

  const activePenStrokeRef = useRef<ActivePenStroke | null>(null)
  const shiftPenComposeRef = useRef<ShiftPenCompose | null>(null)
  const copiedAnnotationTemplateRef = useRef<Annotation | null>(null)
  const lastPointerPdfRef = useRef<PdfPoint | null>(null)
  const pendingAnnotationImportModeRef = useRef<'replace' | 'append'>('replace')
  const lastAutosavedJsonRef = useRef<string | null>(null)

  const [confirmSpec, setConfirmSpec] = useState<ConfirmSpec | null>(null)
  const confirmResolverRef = useRef<((r: ConfirmResult) => void) | null>(null)

  const requestConfirm = useCallback((spec: ConfirmSpec): Promise<ConfirmResult> => {
    return new Promise<ConfirmResult>((resolve) => {
      const prior = confirmResolverRef.current
      if (prior) prior('cancel')
      confirmResolverRef.current = resolve
      setConfirmSpec(spec)
    })
  }, [])

  const resolveConfirm = useCallback((result: ConfirmResult) => {
    const resolver = confirmResolverRef.current
    confirmResolverRef.current = null
    setConfirmSpec(null)
    resolver?.(result)
  }, [])

  const redrawOverlayOnly = useCallback(() => {
    if (!getPdfJsDocument()) return
    const pdfCanvas = pdfCanvasRef.current
    const overlay = overlayCanvasRef.current
    const ctx = overlay?.getContext('2d')
    if (!ctx || !overlay || !pdfCanvas) return
    if (overlay.width !== pdfCanvas.width || overlay.height !== pdfCanvas.height) {
      overlay.width = pdfCanvas.width
      overlay.height = pdfCanvas.height
    }
    const s = stateRef.current
    drawAnnotationOverlay(
      ctx,
      overlay.height,
      s.scale,
      s.currentPage,
      s.annotations,
      s.selectedId,
      getActivePenPreviewForOverlay(activePenStrokeRef.current, shiftPenComposeRef.current),
    )
  }, [])

  const discardShiftPenCompose = useCallback(() => {
    shiftPenComposeRef.current = null
  }, [])

  const flushShiftCurrentIntoSegments = useCallback(() => {
    const c = shiftPenComposeRef.current
    if (!c) return
    const cur = c.current
    if (cur.length >= 2) {
      c.segments.push([...cur])
    }
    c.current = []
  }, [])

  const finalizeShiftPenCompose = useCallback(() => {
    const compose = shiftPenComposeRef.current
    if (!compose) return
    flushShiftCurrentIntoSegments()
    const segs = compose.segments.map((s) => s.slice())
    const cap = compose
    shiftPenComposeRef.current = null
    activePenStrokeRef.current = null
    if (!penHasDrawableSegments(segs)) {
      redrawOverlayOnly()
      return
    }
    const newId = stateRef.current.nextAnnId
    const ann: Annotation = {
      kind: 'pen',
      id: newId,
      page: cap.page,
      segments: segs,
      strokeWidth: cap.strokeWidth,
      r: cap.r,
      g: cap.g,
      b: cap.b,
      hex: cap.hex,
    }
    dispatch({ type: 'ADD_ANNOTATION', ann })
  }, [flushShiftCurrentIntoSegments, redrawOverlayOnly])

  const commitActivePenIfAny = useCallback(() => {
    const cap = activePenStrokeRef.current
    if (!cap) return
    const pts = cap.points
    activePenStrokeRef.current = null
    if (pts.length < 2) {
      redrawOverlayOnly()
      return
    }
    const newId = stateRef.current.nextAnnId
    const ann: Annotation = {
      kind: 'pen',
      id: newId,
      page: cap.page,
      segments: [[...pts]],
      strokeWidth: cap.strokeWidth,
      r: cap.r,
      g: cap.g,
      b: cap.b,
      hex: cap.hex,
    }
    dispatch({ type: 'ADD_ANNOTATION', ann })
  }, [redrawOverlayOnly])

  useLayoutEffect(() => {
    if (!state.pdfDocumentLoaded) return
    if (!getPdfJsDocument()) return
    const pdfCanvas = pdfCanvasRef.current
    const overlay = overlayCanvasRef.current
    if (!pdfCanvas || !overlay) return

    let cancelled = false
    void (async () => {
      await renderPdfPage(state.currentPage, state.scale, pdfCanvas)
      if (cancelled) return
      overlay.width = pdfCanvas.width
      overlay.height = pdfCanvas.height
      const ctx = overlay.getContext('2d')
      if (!ctx) return
      drawAnnotationOverlay(
        ctx,
        overlay.height,
        state.scale,
        state.currentPage,
        state.annotations,
        state.selectedId,
        getActivePenPreviewForOverlay(activePenStrokeRef.current, shiftPenComposeRef.current),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [
    state.pdfDocumentLoaded,
    state.currentPage,
    state.scale,
    state.annotations,
    state.selectedId,
    state.editorMode,
  ])

  const syncColorUi = useCallback((hex: string) => {
    dispatch({ type: 'SYNC_COLOR_UI', color: inkColorFromHex(hex) })
  }, [])

  const applyColor = useCallback(
    (hex: string) => {
      dispatch({ type: 'APPLY_COLOR_TO_SELECTED_TEXT', color: inkColorFromHex(hex) })
    },
    [],
  )

  const applyOpenedPdf = useCallback(async (buffer: ArrayBuffer, pathOrName: string) => {
    activePenStrokeRef.current = null
    discardShiftPenCompose()
    const totalPages = await openPdfFromBuffer(buffer.slice(0))
    lastAutosavedJsonRef.current = null
    dispatch({
      type: 'PDF_OPENED',
      buffer,
      pathOrName,
      totalPages,
    })
  }, [discardShiftPenCompose])

  const tryOpenPdfByPath = useCallback(
    async (filePath: string): Promise<boolean> => {
      const api = window.electronAPI
      if (!api?.openPDFByPath) return false
      const res = await api.openPDFByPath(filePath)
      if (!res.ok) return false
      await applyOpenedPdf(res.data, res.filePath)
      return true
    },
    [applyOpenedPdf],
  )

  const openPdfFlow = useCallback(async () => {
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.openPDFFile()
        if (res.canceled) return
        await applyOpenedPdf(res.data, res.filePath)
        return
      }
      const input = document.getElementById('pdf-file-input') as HTMLInputElement | null
      if (input) {
        input.value = ''
        input.click()
      }
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : String(e)
      window.alert(`Could not open PDF: ${msg}`)
    }
  }, [applyOpenedPdf])

  const savePdfFlow = useCallback(async () => {
    const s = stateRef.current
    if (!s.pdfSourceBytes) return
    try {
      const bytes = await buildAnnotatedPdfBytes(s.pdfSourceBytes, s.annotations)
      const suggested =
        s.sourceFilePath != null
          ? s.sourceFilePath.replace(/\.pdf$/i, '') + '_annotated.pdf'
          : 'annotated.pdf'
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

      if (window.electronAPI) {
        const out = await window.electronAPI.savePDFBytes(data, suggested)
        if (!out.canceled) {
          dispatch({
            type: 'SET_STATUS_FILE',
            label: out.filePath.replace(/\\/g, '/').split('/').pop() ?? 'saved.pdf',
          })
        }
        return
      }

      const filename = suggested.replace(/\\/g, '/').split('/').pop() ?? 'annotated.pdf'
      const blob = new Blob([data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      dispatch({ type: 'SET_STATUS_FILE', label: filename })
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : String(e)
      window.alert(`Save failed: ${msg}`)
    }
  }, [])

  const annotationsDefaultSavePath = useCallback((sourceFilePath: string | null) => {
    if (sourceFilePath != null) {
      return sourceFilePath.replace(/\.pdf$/i, '') + '_annotations.json'
    }
    return 'annotations.json'
  }, [])

  const saveAnnotationsFlow = useCallback(async () => {
    const s = stateRef.current
    if (!s.pdfSourceBytes) return
    try {
      const json = serializeAnnotationsToJson(s.annotations, s.sourceFilePath)
      const suggested = annotationsDefaultSavePath(s.sourceFilePath)

      if (window.electronAPI?.saveAnnotationsJson) {
        const out = await window.electronAPI.saveAnnotationsJson(json, suggested)
        if (!out.canceled) {
          dispatch({
            type: 'SET_STATUS_FILE',
            label: out.filePath.replace(/\\/g, '/').split('/').pop() ?? 'annotations.json',
          })
        }
        return
      }

      const filename = suggested.replace(/\\/g, '/').split('/').pop() ?? 'annotations.json'
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      dispatch({ type: 'SET_STATUS_FILE', label: filename })
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : String(e)
      window.alert(`Could not save annotations: ${msg}`)
    }
  }, [annotationsDefaultSavePath])

  /**
   * Apply annotations loaded from a file into the current session.
   * If the file's pdfPath doesn't match the open PDF, prompt to open the saved
   * PDF instead. Dialog outcomes: yes → open saved PDF then load; no → load
   * into current PDF; cancel → abort.
   */
  const applyLoadedAnnotations = useCallback(
    async (parsed: ParsedAnnotationsFile, mode: 'replace' | 'append') => {
      const s = stateRef.current
      const loadedPath = parsed.pdfPath
      const currentPath = s.sourceFilePath
      const mismatch =
        loadedPath != null &&
        currentPath != null &&
        !pdfPathsMatch(loadedPath, currentPath)

      if (mismatch) {
        const result = await requestConfirm({
          title: 'PDF mismatch',
          message:
            'The open document does not match the annotation file.\n\n' +
            `Saved PDF: ${loadedPath ?? '(unknown)'}\n` +
            `Open PDF: ${currentPath ?? '(none)'}\n\n` +
            'Do you want to open the correct document?',
        })
        if (result === 'cancel') return
        if (result === 'yes') {
          const ok = await tryOpenPdfByPath(loadedPath!)
          if (!ok) {
            window.alert(`Could not open PDF:\n${loadedPath}`)
            return
          }
          dispatch({
            type: 'IMPORT_ANNOTATIONS',
            imported: parsed.annotations,
            mode: 'replace',
          })
          return
        }
        // 'no' falls through — load into currently open PDF
      }

      dispatch({ type: 'IMPORT_ANNOTATIONS', imported: parsed.annotations, mode })
    },
    [requestConfirm, tryOpenPdfByPath],
  )

  const openAnnotationsFlow = useCallback(async () => {
    const s = stateRef.current
    if (!s.pdfSourceBytes) {
      window.alert('Open a PDF first before loading annotations.')
      return
    }

    let mode: 'replace' | 'append' = 'replace'
    if (s.annotations.length > 0) {
      const replace = window.confirm(
        'You already have annotations on this PDF.\n\n' +
          'Click OK to remove existing annotations before load, or Cancel to proceed with the load without deleting.',
      )
      mode = replace ? 'replace' : 'append'
    }

    try {
      if (window.electronAPI?.openAnnotationsFile) {
        const res = await window.electronAPI.openAnnotationsFile()
        if (res.canceled) return
        finalizeShiftPenCompose()
        activePenStrokeRef.current = null
        const parsed = parseAnnotationsFile(res.text)
        await applyLoadedAnnotations(parsed, mode)
        return
      }

      finalizeShiftPenCompose()
      activePenStrokeRef.current = null
      pendingAnnotationImportModeRef.current = mode
      const input = document.getElementById('annotations-file-input') as HTMLInputElement | null
      if (input) {
        input.value = ''
        input.click()
      }
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : String(e)
      window.alert(`Could not load annotations: ${msg}`)
    }
  }, [applyLoadedAnnotations, finalizeShiftPenCompose])

  const onAnnotationsFileSelected = useCallback(
    (file: File) => {
      const ok =
        file.type === 'application/json' ||
        file.name.toLowerCase().endsWith('.json')
      if (!ok) return
      const mode = pendingAnnotationImportModeRef.current
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const text = reader.result as string
          const parsed = parseAnnotationsFile(text)
          void applyLoadedAnnotations(parsed, mode)
        } catch (e) {
          console.error(e)
          const msg = e instanceof Error ? e.message : String(e)
          window.alert(`Could not load annotations: ${msg}`)
        }
      }
      reader.onerror = () => {
        console.error(reader.error)
        const msg = reader.error?.message ?? 'File read failed'
        window.alert(`Could not read file: ${msg}`)
      }
      reader.readAsText(file, 'UTF-8')
    },
    [applyLoadedAnnotations],
  )

  const changePage = useCallback(
    async (delta: number) => {
      const s = stateRef.current
      const next = s.currentPage + delta
      if (next < 1 || next > s.totalPages) return
      finalizeShiftPenCompose()
      activePenStrokeRef.current = null
      dispatch({ type: 'SET_PAGE_NAV', page: next })
    },
    [finalizeShiftPenCompose],
  )

  const setZoom = useCallback(
    (next: number) => {
      finalizeShiftPenCompose()
      activePenStrokeRef.current = null
      dispatch({ type: 'SET_ZOOM', scale: Math.max(0.35, Math.min(4, next)) })
    },
    [finalizeShiftPenCompose],
  )

  const setEditorMode = useCallback(
    (mode: 'text' | 'pen') => {
      if (stateRef.current.editorMode === mode) return
      finalizeShiftPenCompose()
      activePenStrokeRef.current = null
      dispatch({ type: 'SET_MODE', mode })
    },
    [finalizeShiftPenCompose],
  )

  const selectAnnotationById = useCallback(
    async (id: number) => {
      finalizeShiftPenCompose()
      const ann = stateRef.current.annotations.find((a) => a.id === id)
      if (!ann) return
      if (ann.page !== stateRef.current.currentPage) {
        activePenStrokeRef.current = null
        dispatch({ type: 'SET_PAGE_AND_SELECT', page: ann.page, selectedId: id })
      } else {
        dispatch({ type: 'SELECT_ID', id })
        redrawOverlayOnly()
      }
      if (isTextAnnotation(ann)) {
        dispatch({
          type: 'LOAD_TEXT_STYLE_FROM_ANN',
          fontId: ann.fontId,
          size: ann.size,
          bold: ann.bold === true,
          color: inkColorFromHex(ann.hex),
        })
      } else if (isPenAnnotation(ann)) {
        dispatch({ type: 'SYNC_COLOR_UI', color: inkColorFromHex(ann.hex) })
        dispatch({ type: 'SET_PEN_WIDTH', width: ann.strokeWidth })
      }
    },
    [finalizeShiftPenCompose, redrawOverlayOnly],
  )

  const deleteAnnotationById = useCallback(
    (id: number) => {
      const prevSel = stateRef.current.selectedId
      flushSync(() => {
        dispatch({ type: 'DELETE_ANNOTATION', id })
      })
      const nextSel = stateRef.current.selectedId
      if (prevSel === id && nextSel !== null) {
        void selectAnnotationById(nextSel)
      }
    },
    [selectAnnotationById],
  )

  const toggleBold = useCallback(() => {
    dispatch({ type: 'TOGGLE_BOLD_TO_SELECTION' })
  }, [])

  const showInlineInput = useCallback(
    (clientX: number, clientY: number, pdfX: number, pdfY: number) => {
      const overlay = overlayCanvasRef.current
      const stack = canvasStackRef.current
      const input = inlineInputRef.current
      if (!overlay || !stack || !input) return
      const stackRect = stack.getBoundingClientRect()
      const s = stateRef.current
      const size = s.styleFontSize
      const family = getFontEntry(s.styleFontId).cssFamily
      const inkHex = s.currentColor.hex
      const lightField = hexIsNearWhite(inkHex)
      input.style.display = 'block'
      input.style.left = `${clientX - stackRect.left}px`
      input.style.top = `${clientY - stackRect.top - size * s.scale}px`
      input.style.fontSize = `${size * s.scale}px`
      input.style.fontFamily = family
      input.style.fontWeight = s.currentBold ? 'bold' : '400'
      input.style.backgroundColor = lightField ? '#000000' : '#ffffff'
      input.style.color = inkHex
      input.style.caretColor = inkHex
      input.style.borderBottom = '2px solid #5b8cff'
      input.style.boxShadow = lightField
        ? '0 0 0 1px rgba(255,255,255,0.2), 0 4px 20px rgba(0,0,0,0.45)'
        : '0 0 0 1px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.2)'
      input.value = ''
      input.focus()

      let finished = false
      const commit = (text: string) => {
        if (finished) return
        finished = true
        input.onblur = null
        const t = text.trim()
        if (t) {
          const cur = stateRef.current
          const newId = cur.nextAnnId
          const ann: Annotation = {
            kind: 'text',
            id: newId,
            page: cur.currentPage,
            x: pdfX,
            y: pdfY,
            text: t,
            fontId: cur.styleFontId,
            size: cur.styleFontSize,
            r: cur.currentColor.r,
            g: cur.currentColor.g,
            b: cur.currentColor.b,
            hex: cur.currentColor.hex,
            bold: cur.currentBold,
          }
          dispatch({ type: 'ADD_ANNOTATION', ann })
        }
        input.style.display = 'none'
        input.value = ''
      }

      input.onkeydown = (e) => {
        if (e.key === 'Escape') {
          finished = true
          input.onblur = null
          input.style.display = 'none'
          input.value = ''
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(input.value)
        }
      }

      input.onblur = () => {
        if (input.style.display === 'none') return
        commit(input.value)
      }
    },
    [],
  )

  const bindCanvasListeners = useCallback(() => {
    const stack = canvasStackRef.current
    const pdfCanvas = pdfCanvasRef.current
    const overlay = overlayCanvasRef.current
    if (!stack || !pdfCanvas || !overlay) return () => {}

    /** Map client position to PDF canvas bitmap pixels (overlay is kept matching this bitmap). */
    const bitmapFromClient = (clientX: number, clientY: number) => {
      const pr = pdfCanvas.getBoundingClientRect()
      const bw = pdfCanvas.width
      const bh = pdfCanvas.height
      if (bw <= 0 || bh <= 0 || pr.width <= 0 || pr.height <= 0) return null
      const px = ((clientX - pr.left) / pr.width) * bw
      const py = ((clientY - pr.top) / pr.height) * bh
      return { px, py, bh }
    }

    const pdfPointFromClient = (clientX: number, clientY: number, scale: number): PdfPoint | null => {
      const bm = bitmapFromClient(clientX, clientY)
      if (!bm) return null
      return { x: bm.px / scale, y: (bm.bh - bm.py) / scale }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (!getPdfJsDocument()) return
      if (stateRef.current.editorMode !== 'pen') return
      if (e.button !== 0) return
      if (isFormFieldTarget(e.target)) return
      if (e.target !== pdfCanvas && e.target !== overlay) return
      e.preventDefault()
      stack.setPointerCapture(e.pointerId)
      const s = stateRef.current
      const sw = s.penStrokeWidthPdf
      const p0 = pdfPointFromClient(e.clientX, e.clientY, s.scale)
      if (!p0) return
      dispatch({ type: 'SELECT_ID', id: null })

      if (e.shiftKey) {
        activePenStrokeRef.current = null
        const compose = shiftPenComposeRef.current
        if (compose && compose.page !== s.currentPage) {
          finalizeShiftPenCompose()
        }
        if (!shiftPenComposeRef.current) {
          shiftPenComposeRef.current = {
            page: s.currentPage,
            segments: [],
            current: [p0],
            strokeWidth: sw,
            hex: s.currentColor.hex,
            r: s.currentColor.r,
            g: s.currentColor.g,
            b: s.currentColor.b,
          }
        } else {
          const cur = shiftPenComposeRef.current.current
          if (cur.length >= 2) {
            shiftPenComposeRef.current.segments.push([...cur])
          }
          shiftPenComposeRef.current.current = [p0]
        }
      } else {
        if (shiftPenComposeRef.current) {
          finalizeShiftPenCompose()
        }
        activePenStrokeRef.current = {
          page: s.currentPage,
          points: [p0],
          strokeWidth: sw,
          hex: s.currentColor.hex,
          r: s.currentColor.r,
          g: s.currentColor.g,
          b: s.currentColor.b,
        }
      }
      redrawOverlayOnly()
    }

    const endPen = (e: PointerEvent) => {
      if (stateRef.current.editorMode !== 'pen') return
      try {
        stack.releasePointerCapture(e.pointerId)
      } catch {
        /* no capture */
      }
      if (shiftPenComposeRef.current) {
        flushShiftCurrentIntoSegments()
        redrawOverlayOnly()
        return
      }
      if (activePenStrokeRef.current) {
        commitActivePenIfAny()
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!getPdfJsDocument()) return
      const s = stateRef.current
      const bm = bitmapFromClient(e.clientX, e.clientY)
      if (bm) {
        const x = Math.round(bm.px / s.scale)
        const y = Math.round((bm.bh - bm.py) / s.scale)
        dispatch({ type: 'SET_COORDS', label: `${x}, ${y}` })
        lastPointerPdfRef.current = { x: bm.px / s.scale, y: (bm.bh - bm.py) / s.scale }
      }

      const compose = shiftPenComposeRef.current
      if (
        s.editorMode === 'pen' &&
        compose &&
        compose.page === s.currentPage &&
        compose.current.length > 0
      ) {
        e.preventDefault()
        const p = pdfPointFromClient(e.clientX, e.clientY, s.scale)
        if (!p) return
        const last = compose.current[compose.current.length - 1]!
        if (penPointsFarEnough(last, p)) compose.current.push(p)
        redrawOverlayOnly()
      } else if (
        s.editorMode === 'pen' &&
        activePenStrokeRef.current &&
        activePenStrokeRef.current.page === s.currentPage
      ) {
        e.preventDefault()
        const p = pdfPointFromClient(e.clientX, e.clientY, s.scale)
        if (!p) return
        const pts = activePenStrokeRef.current.points
        const last = pts[pts.length - 1]!
        if (penPointsFarEnough(last, p)) pts.push(p)
        redrawOverlayOnly()
      }
    }

    const onStackClick = (e: MouseEvent) => {
      if (!getPdfJsDocument()) return
      if (stateRef.current.editorMode === 'pen') return
      if (isFormFieldTarget(e.target)) return
      if (e.target !== pdfCanvas && e.target !== overlay) return
      const s = stateRef.current
      if (overlay.width !== pdfCanvas.width || overlay.height !== pdfCanvas.height) {
        overlay.width = pdfCanvas.width
        overlay.height = pdfCanvas.height
        redrawOverlayOnly()
      }
      const bm = bitmapFromClient(e.clientX, e.clientY)
      if (!bm) return
      const ctx = overlay.getContext('2d')
      if (!ctx) return
      const hit = findAnnotationAtCanvasPoint(
        ctx,
        bm.bh,
        s.scale,
        s.currentPage,
        bm.px,
        bm.py,
        s.annotations,
      )
      if (hit) {
        void selectAnnotationById(hit.id)
        return
      }
      dispatch({ type: 'SELECT_ID', id: null })
      const pdfX = bm.px / s.scale
      const pdfY = (bm.bh - bm.py) / s.scale
      showInlineInput(e.clientX, e.clientY, pdfX, pdfY)
    }

    stack.addEventListener('pointerdown', onPointerDown)
    stack.addEventListener('pointerup', endPen)
    stack.addEventListener('pointercancel', endPen)
    stack.addEventListener('pointermove', onPointerMove)
    stack.addEventListener('click', onStackClick)

    return () => {
      stack.removeEventListener('pointerdown', onPointerDown)
      stack.removeEventListener('pointerup', endPen)
      stack.removeEventListener('pointercancel', endPen)
      stack.removeEventListener('pointermove', onPointerMove)
      stack.removeEventListener('click', onStackClick)
    }
  }, [
    commitActivePenIfAny,
    finalizeShiftPenCompose,
    flushShiftCurrentIntoSegments,
    redrawOverlayOnly,
    selectAnnotationById,
    showInlineInput,
  ])

  const bindGlobalKeys = useCallback(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!getPdfJsDocument()) return
      if (isFormFieldTarget(e.target)) return

      if (e.code === 'Delete') {
        const sid = stateRef.current.selectedId
        if (sid === null) return
        e.preventDefault()
        deleteAnnotationById(sid)
        return
      }

      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      if (e.code === 'KeyC') {
        const sid = stateRef.current.selectedId
        if (sid === null) return
        const ann = stateRef.current.annotations.find((a) => a.id === sid)
        if (!ann) return
        e.preventDefault()
        copiedAnnotationTemplateRef.current = cloneAnnotationForClipboard(ann)
        return
      }

      if (e.code === 'KeyX') {
        const sid = stateRef.current.selectedId
        if (sid === null) return
        const ann = stateRef.current.annotations.find((a) => a.id === sid)
        if (!ann) return
        e.preventDefault()
        copiedAnnotationTemplateRef.current = cloneAnnotationForClipboard(ann)
        deleteAnnotationById(sid)
        return
      }

      if (e.code === 'KeyV') {
        const tpl = copiedAnnotationTemplateRef.current
        if (!tpl) return
        e.preventDefault()
        if (shiftPenComposeRef.current) finalizeShiftPenCompose()
        if (activePenStrokeRef.current) commitActivePenIfAny()
        const ov = overlayCanvasRef.current
        if (!ov) return
        const s = stateRef.current
        const at = lastPointerPdfRef.current ?? {
          x: ov.width / 2 / s.scale,
          y: ov.height / 2 / s.scale,
        }
        const newAnn = annotationPastedAtTopLeft(tpl, s.currentPage, at, ov, s.scale)
        newAnn.id = s.nextAnnId
        dispatch({ type: 'ADD_ANNOTATION', ann: newAnn })
      }
    }

    const onArrow = (e: KeyboardEvent) => {
      const sid = stateRef.current.selectedId
      if (sid === null || !getPdfJsDocument()) return
      if (isFormFieldTarget(e.target)) return
      const step = e.shiftKey ? 1 : 10
      let dx = 0
      let dy = 0
      switch (e.key) {
        case 'ArrowLeft':
          dx = -step
          break
        case 'ArrowRight':
          dx = step
          break
        case 'ArrowUp':
          dy = -step
          break
        case 'ArrowDown':
          dy = step
          break
        default:
          return
      }
      const s = stateRef.current
      const ann = s.annotations.find((a) => a.id === sid)
      if (!ann || ann.page !== s.currentPage) return
      e.preventDefault()
      const dPdfX = dx / s.scale
      const dPdfY = -dy / s.scale
      if (isTextAnnotation(ann)) {
        dispatch({
          type: 'PATCH_ANNOTATIONS',
          updater: (list) =>
            list.map((a) =>
              a.id === sid && a.kind === 'text'
                ? { ...a, x: a.x + dPdfX, y: a.y + dPdfY }
                : a,
            ),
        })
      } else {
        dispatch({
          type: 'PATCH_ANNOTATIONS',
          updater: (list) =>
            list.map((a) => {
              if (a.id !== sid || a.kind !== 'pen') return a
              return {
                ...a,
                segments: a.segments.map((seg) =>
                  seg.map((p) => ({ x: p.x + dPdfX, y: p.y + dPdfY })),
                ),
              }
            }),
        })
      }
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onArrow)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', onArrow)
    }
  }, [commitActivePenIfAny, deleteAnnotationById, finalizeShiftPenCompose])

  const bindShiftPenFinalize = useCallback(() => {
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey) return
      if (stateRef.current.editorMode !== 'pen') return
      finalizeShiftPenCompose()
    }
    window.addEventListener('keyup', onKeyUp)
    return () => window.removeEventListener('keyup', onKeyUp)
  }, [finalizeShiftPenCompose])

  const onPdfFileSelected = useCallback(
    (file: File) => {
      const ok = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      if (!ok) return
      const fullPath = window.electronAPI?.getPathForFile?.(file) ?? ''
      const pathOrName = fullPath || file.name
      const reader = new FileReader()
      reader.onload = () => {
        void applyOpenedPdf(reader.result as ArrayBuffer, pathOrName).catch((err) => {
          console.error(err)
          const msg = err instanceof Error ? err.message : String(err)
          window.alert(`Could not open PDF: ${msg}`)
        })
      }
      reader.readAsArrayBuffer(file)
    },
    [applyOpenedPdf],
  )

  const onDropPdfFile = useCallback(
    (file: File) => {
      onPdfFileSelected(file)
    },
    [onPdfFileSelected],
  )

  const setDragTarget = useCallback((on: boolean) => {
    document.body.classList.toggle('drag-target', on)
  }, [])

  /** Autosave every 60 s while a PDF is open, skipping if the payload hasn't changed. */
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = stateRef.current
      if (!s.pdfSourceBytes) return
      const json = serializeAnnotationsToJson(s.annotations, s.sourceFilePath)
      if (json === lastAutosavedJsonRef.current) return
      lastAutosavedJsonRef.current = json
      void writeAutosave(json).then(() => {
        dispatch({ type: 'SET_LAST_AUTOSAVE', at: Date.now() })
      })
    }, 60_000)
    return () => window.clearInterval(id)
  }, [])

  /** Startup recovery: if an autosave exists, prompt to restore it. */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const text = await readAutosave()
      if (cancelled || !text) return
      let parsed: ParsedAnnotationsFile
      try {
        parsed = parseAnnotationsFile(text)
      } catch {
        return
      }
      if (parsed.annotations.length === 0) return

      const savedPath = parsed.pdfPath ?? '(unknown PDF)'
      const result = await requestConfirm({
        title: 'Restore autosaved annotations?',
        message:
          'Unsaved annotations were found from a previous session.\n\n' +
          `Saved PDF: ${savedPath}\n\n` +
          'Do you want to open the correct document and restore these annotations?',
      })
      if (cancelled) return
      if (result !== 'yes') return

      if (!parsed.pdfPath) {
        window.alert('The autosave does not contain a PDF path.')
        return
      }
      const ok = await tryOpenPdfByPath(parsed.pdfPath)
      if (!ok) {
        window.alert(`Could not open PDF:\n${parsed.pdfPath}`)
        return
      }
      dispatch({
        type: 'IMPORT_ANNOTATIONS',
        imported: parsed.annotations,
        mode: 'replace',
      })
    })()

    return () => {
      cancelled = true
    }
  }, [requestConfirm, tryOpenPdfByPath])

  const value: EditorContextValue = {
    state,
    dispatch,
    pdfCanvasRef,
    overlayCanvasRef,
    inlineInputRef,
    canvasStackRef,
    applyColor,
    syncColorUi,
    openPdfFlow,
    savePdfFlow,
    saveAnnotationsFlow,
    openAnnotationsFlow,
    changePage,
    setZoom,
    setEditorMode,
    selectAnnotationById,
    deleteAnnotationById,
    toggleBold,
    bindCanvasListeners,
    bindGlobalKeys,
    bindShiftPenFinalize,
    onPdfFileSelected,
    onAnnotationsFileSelected,
    onDropPdfFile,
    setDragTarget,
    confirmSpec,
    resolveConfirm,
  }

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
}
