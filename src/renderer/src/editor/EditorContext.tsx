import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useReducer,
  useRef,
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
import { canvasPointFromClient } from '../lib/canvasCoords'
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
  onDropPdfFile: (file: File) => void
  setDragTarget: (on: boolean) => void
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

  const redrawOverlayOnly = useCallback(() => {
    if (!getPdfJsDocument()) return
    const overlay = overlayCanvasRef.current
    const ctx = overlay?.getContext('2d')
    if (!ctx || !overlay) return
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
    dispatch({
      type: 'PDF_OPENED',
      buffer,
      pathOrName,
      totalPages,
    })
  }, [discardShiftPenCompose])

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
    const overlay = overlayCanvasRef.current
    if (!overlay) return () => {}

    const onPointerDown = (e: PointerEvent) => {
      if (!getPdfJsDocument()) return
      if (stateRef.current.editorMode !== 'pen') return
      if (e.button !== 0) return
      if (isFormFieldTarget(e.target)) return
      e.preventDefault()
      overlay.setPointerCapture(e.pointerId)
      const s = stateRef.current
      const sw = s.penStrokeWidthPdf
      const p0 = canvasPointFromClient(overlay, e.clientX, e.clientY, s.scale)
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
        overlay.releasePointerCapture(e.pointerId)
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
      const rect = overlay.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const x = Math.round(px / s.scale)
      const y = Math.round((overlay.height - py) / s.scale)
      dispatch({ type: 'SET_COORDS', label: `${x}, ${y}` })
      lastPointerPdfRef.current = { x: px / s.scale, y: (overlay.height - py) / s.scale }

      const compose = shiftPenComposeRef.current
      if (
        s.editorMode === 'pen' &&
        compose &&
        compose.page === s.currentPage &&
        compose.current.length > 0
      ) {
        e.preventDefault()
        const p = canvasPointFromClient(overlay, e.clientX, e.clientY, s.scale)
        const last = compose.current[compose.current.length - 1]!
        if (penPointsFarEnough(last, p)) compose.current.push(p)
        redrawOverlayOnly()
      } else if (
        s.editorMode === 'pen' &&
        activePenStrokeRef.current &&
        activePenStrokeRef.current.page === s.currentPage
      ) {
        e.preventDefault()
        const p = canvasPointFromClient(overlay, e.clientX, e.clientY, s.scale)
        const pts = activePenStrokeRef.current.points
        const last = pts[pts.length - 1]!
        if (penPointsFarEnough(last, p)) pts.push(p)
        redrawOverlayOnly()
      }
    }

    const onClick = (e: MouseEvent) => {
      if (!getPdfJsDocument()) return
      if (stateRef.current.editorMode === 'pen') return
      const s = stateRef.current
      const rect = overlay.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const ctx = overlay.getContext('2d')
      if (!ctx) return
      const hit = findAnnotationAtCanvasPoint(
        ctx,
        overlay.height,
        s.scale,
        s.currentPage,
        px,
        py,
        s.annotations,
      )
      if (hit) {
        void selectAnnotationById(hit.id)
        return
      }
      dispatch({ type: 'SELECT_ID', id: null })
      const pdfX = px / s.scale
      const pdfY = (overlay.height - py) / s.scale
      showInlineInput(e.clientX, e.clientY, pdfX, pdfY)
    }

    overlay.addEventListener('pointerdown', onPointerDown)
    overlay.addEventListener('pointerup', endPen)
    overlay.addEventListener('pointercancel', endPen)
    overlay.addEventListener('pointermove', onPointerMove)
    overlay.addEventListener('click', onClick)

    return () => {
      overlay.removeEventListener('pointerdown', onPointerDown)
      overlay.removeEventListener('pointerup', endPen)
      overlay.removeEventListener('pointercancel', endPen)
      overlay.removeEventListener('pointermove', onPointerMove)
      overlay.removeEventListener('click', onClick)
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
      const reader = new FileReader()
      reader.onload = () => {
        void applyOpenedPdf(reader.result as ArrayBuffer, file.name).catch((err) => {
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
    onDropPdfFile,
    setDragTarget,
  }

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
}
