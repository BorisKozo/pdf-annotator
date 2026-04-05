import { FONT_CATALOG } from './fonts'
import { openPdfFromBuffer, renderPdfPage, getPdfJsDocument } from './pdfSession'
import {
  drawAnnotationOverlay,
  findAnnotationAtCanvasPoint,
  penBoundsPdf,
  textAnnotationTopLeftPdf,
  type PenDrawPreview,
} from './overlay'
import { buildAnnotatedPdfBytes } from './exportPdf'
import type { Annotation, PdfPoint } from './types'
import { isPenAnnotation, isTextAnnotation } from './types'
import { getFontEntry } from './fonts'

const PALETTE = [
  '#000000',
  '#f8fafc',
  '#0f172a',
  '#5b8cff',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#a78bfa',
  '#22d3ee',
  '#fb7185',
  '#94a3b8',
]

let pdfSourceBytes: ArrayBuffer | null = null
let sourceFilePath: string | null = null
let currentPage = 1
let totalPages = 0
let scale = 1
let annotations: Annotation[] = []
let selectedId: number | null = null
let nextAnnId = 1

let currentColor = { r: 0, g: 0, b: 0, hex: '#000000' }
let currentBold = false

type EditorMode = 'text' | 'pen'
let editorMode: EditorMode = 'text'
let penStrokeWidthPdf = 2

type ActivePenStroke = {
  page: number
  points: PdfPoint[]
  strokeWidth: number
  r: number
  g: number
  b: number
  hex: string
}

/** Single click-drag stroke (no Shift). */
let activePenStroke: ActivePenStroke | null = null

/** Shift held: multiple strokes committed together when Shift is released. */
type ShiftPenCompose = {
  page: number
  segments: PdfPoint[][]
  current: PdfPoint[]
  strokeWidth: number
  r: number
  g: number
  b: number
  hex: string
}
let shiftPenCompose: ShiftPenCompose | null = null

/** In-app clipboard: deep copy of last copied annotation (id ignored on paste). */
let copiedAnnotationTemplate: Annotation | null = null
/** Last pointer position over the overlay in PDF coordinates (for paste placement). */
let lastPointerPdf: PdfPoint | null = null

const MIN_PEN_SEGMENT_PDF = 0.2

function penHasDrawableSegments(segments: PdfPoint[][]): boolean {
  return segments.some((s) => s.length >= 2)
}

function penPointsFarEnough(a: PdfPoint, b: PdfPoint): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return dx * dx + dy * dy >= MIN_PEN_SEGMENT_PDF * MIN_PEN_SEGMENT_PDF
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  }
}

/** True when the ink color is white or very light (needs a dark input field for contrast). */
function hexIsNearWhite(hex: string): boolean {
  let full = hex.replace('#', '').toLowerCase()
  if (full.length === 3) {
    full = full
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (full.length !== 6) return false
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if (![r, g, b].every((n) => Number.isFinite(n))) return false
  const lum = (r * 299 + g * 587 + b * 114) / 1000
  return lum >= 230
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing #${id}`)
  return el
}

function pdfCanvasEl(): HTMLCanvasElement {
  return document.getElementById('pdf-canvas') as HTMLCanvasElement
}

function overlayCanvasEl(): HTMLCanvasElement {
  return document.getElementById('overlay-canvas') as HTMLCanvasElement
}

function syncOverlaySize(): void {
  const pdf = pdfCanvasEl()
  const overlay = overlayCanvasEl()
  overlay.width = pdf.width
  overlay.height = pdf.height
}

function getCurrentFontId(): string {
  return (document.getElementById('font-select') as HTMLSelectElement).value
}

function getCurrentFontSize(): number {
  const n = parseInt((document.getElementById('font-size-num') as HTMLInputElement).value, 10)
  return Number.isFinite(n) ? Math.min(200, Math.max(6, n)) : 14
}

function getActivePenPreviewForOverlay(): PenDrawPreview | null {
  if (activePenStroke) {
    const { page, points, strokeWidth, hex } = activePenStroke
    return { page, points, strokeWidth, hex }
  }
  if (shiftPenCompose) {
    return {
      page: shiftPenCompose.page,
      strokeWidth: shiftPenCompose.strokeWidth,
      hex: shiftPenCompose.hex,
      segments: shiftPenCompose.segments,
      current: shiftPenCompose.current,
    }
  }
  return null
}

/** Drop shift-compose session without saving (new PDF, etc.). */
function discardShiftPenCompose(): void {
  shiftPenCompose = null
}

function flushShiftCurrentIntoSegments(): void {
  if (!shiftPenCompose) return
  const cur = shiftPenCompose.current
  if (cur.length >= 2) {
    shiftPenCompose.segments.push([...cur])
  }
  shiftPenCompose.current = []
}

/** Commits when Shift is released (or leaving pen / page / zoom). */
function finalizeShiftPenCompose(): void {
  if (!shiftPenCompose) return
  flushShiftCurrentIntoSegments()
  const segs = shiftPenCompose.segments.map((s) => s.slice())
  const cap = shiftPenCompose
  shiftPenCompose = null
  activePenStroke = null
  if (!penHasDrawableSegments(segs)) {
    void refreshPage()
    renderAnnotationsList()
    return
  }
  const newId = nextAnnId++
  annotations.push({
    kind: 'pen',
    id: newId,
    page: cap.page,
    segments: segs,
    strokeWidth: cap.strokeWidth,
    r: cap.r,
    g: cap.g,
    b: cap.b,
    hex: cap.hex,
  })
  selectedId = newId
  void refreshPage()
  renderAnnotationsList()
}

function redrawOverlayOnly(): void {
  if (!getPdfJsDocument()) return
  const overlay = overlayCanvasEl()
  const ctx = overlay.getContext('2d')
  if (!ctx) return
  drawAnnotationOverlay(
    ctx,
    overlay.height,
    scale,
    currentPage,
    annotations,
    selectedId,
    getActivePenPreviewForOverlay(),
  )
}

async function refreshPage(): Promise<void> {
  if (!getPdfJsDocument()) return
  const pdfCanvas = pdfCanvasEl()
  await renderPdfPage(currentPage, scale, pdfCanvas)
  syncOverlaySize()
  const overlay = overlayCanvasEl()
  const ctx = overlay.getContext('2d')
  if (!ctx) return
  drawAnnotationOverlay(
    ctx,
    overlay.height,
    scale,
    currentPage,
    annotations,
    selectedId,
    getActivePenPreviewForOverlay(),
  )
  updatePageUi()
}

function updatePageUi(): void {
  const info = totalPages > 0 ? `${currentPage} / ${totalPages}` : '—'
  $('page-info').textContent = info
  ;(document.getElementById('btn-prev') as HTMLButtonElement).disabled =
    totalPages === 0 || currentPage <= 1
  ;(document.getElementById('btn-next') as HTMLButtonElement).disabled =
    totalPages === 0 || currentPage >= totalPages
}

function updateZoomLabel(): void {
  const pct = Math.round(scale * 100)
  $('zoom-pct').textContent = `${pct}%`
}

function updateSaveButtonState(): void {
  ;(document.getElementById('btn-save') as HTMLButtonElement).disabled = pdfSourceBytes === null
}

function updateBoldButton(): void {
  const btn = $('btn-bold') as HTMLButtonElement
  btn.classList.toggle('active', currentBold)
  btn.setAttribute('aria-pressed', String(currentBold))
}

function updateModeUi(): void {
  const textMode = editorMode === 'text'
  $('section-text-style').classList.toggle('hidden', !textMode)
  $('section-pen-style').classList.toggle('hidden', textMode)
  ;(document.getElementById('mode-text') as HTMLButtonElement).classList.toggle('active', textMode)
  ;(document.getElementById('mode-pen') as HTMLButtonElement).classList.toggle('active', !textMode)
}

function getPenStrokeWidthFromUi(): number {
  const num = document.getElementById('pen-width-num') as HTMLInputElement
  let v = parseInt(num.value, 10)
  if (!Number.isFinite(v)) v = 2
  return Math.min(48, Math.max(1, v))
}

function syncPenWidthInputs(v: number): void {
  const num = document.getElementById('pen-width-num') as HTMLInputElement
  const range = document.getElementById('pen-width-range') as HTMLInputElement
  num.value = String(v)
  range.value = String(Math.min(24, v))
}

function syncColorUi(hex: string): void {
  const rgb = hexToRgb(hex)
  currentColor = { r: rgb.r, g: rgb.g, b: rgb.b, hex }
  ;(document.getElementById('color-picker') as HTMLInputElement).value = hex
  $('hex-label').textContent = hex.toUpperCase()
  document.querySelectorAll('.swatch').forEach((el) => {
    el.classList.toggle('selected', (el as HTMLElement).dataset.hex === hex)
  })
}

function applyColor(hex: string): void {
  const rgb = hexToRgb(hex)
  syncColorUi(hex)
  const sel = selectedId !== null ? annotations.find((a) => a.id === selectedId) : null
  if (sel && isTextAnnotation(sel)) {
    sel.hex = hex
    sel.r = rgb.r
    sel.g = rgb.g
    sel.b = rgb.b
    void refreshPage()
    renderAnnotationsList()
  }
}

function initFontSelect(): void {
  const sel = document.getElementById('font-select') as HTMLSelectElement
  sel.innerHTML = ''
  for (const f of FONT_CATALOG) {
    const opt = document.createElement('option')
    opt.value = f.id
    opt.textContent = f.label
    sel.appendChild(opt)
  }
}

function initPalette(): void {
  const root = $('palette')
  root.innerHTML = ''
  for (const hex of PALETTE) {
    const sw = document.createElement('button')
    sw.type = 'button'
    sw.className = 'swatch'
    sw.dataset.hex = hex
    sw.style.background = hex
    sw.style.borderColor =
      hex === '#f8fafc' || hex === '#000000'
        ? 'rgba(255,255,255,0.25)'
        : 'transparent'
    sw.title = hex
    sw.addEventListener('click', () => applyColor(hex))
    root.appendChild(sw)
  }
}

/** Same order as the sidebar list: page ascending, then id ascending. */
function annotationsSortedLikeList(list: Annotation[] = annotations): Annotation[] {
  return [...list].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page
    return a.id - b.id
  })
}

function renderAnnotationsList(): void {
  const list = $('annotations-list')
  const countEl = $('ann-count')
  countEl.textContent = String(annotations.length)
  list.innerHTML = ''
  if (annotations.length === 0) {
    const empty = document.createElement('div')
    empty.style.cssText =
      'font-size:12px;color:var(--muted);padding:10px;text-align:center'
    empty.textContent = 'No annotations yet'
    list.appendChild(empty)
    return
  }
  const sorted = annotationsSortedLikeList()
  for (const ann of sorted) {
    const row = document.createElement('div')
    row.className = 'ann-row' + (ann.id === selectedId ? ' active' : '')
    const label =
      isTextAnnotation(ann)
        ? `${ann.bold === true ? '<strong style="opacity:.85">B</strong> ' : ''}p${ann.page}: Text · ${escapeHtml(ann.text)}`
        : `p${ann.page}: Pen · ${ann.segments.length} line(s) · ${ann.segments.reduce((n, s) => n + s.length, 0)} pts`
    const title = isTextAnnotation(ann)
      ? `Text: ${escapeAttr(ann.text)}`
      : `Pen (${ann.segments.length} line(s))`
    row.innerHTML = `
      <span class="ann-dot" style="background:${ann.hex}"></span>
      <span class="ann-label" title="${title}">${label}</span>
      <button type="button" class="ann-del" data-id="${ann.id}" title="Delete">✕</button>
    `
    row.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('.ann-del')) return
      void selectAnnotationById(ann.id)
    })
    row.querySelector('.ann-del')?.addEventListener('click', (ev) => {
      ev.stopPropagation()
      deleteAnnotationById(ann.id)
    })
    list.appendChild(row)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}

async function selectAnnotationById(id: number): Promise<void> {
  if (shiftPenCompose) finalizeShiftPenCompose()
  selectedId = id
  const ann = annotations.find((a) => a.id === id)
  if (!ann) return
  if (ann.page !== currentPage) {
    activePenStroke = null
    currentPage = ann.page
    await refreshPage()
  } else {
    redrawOverlayOnly()
  }
  if (isTextAnnotation(ann)) {
    ;(document.getElementById('font-select') as HTMLSelectElement).value = ann.fontId
    ;(document.getElementById('font-size-num') as HTMLInputElement).value = String(ann.size)
    ;(document.getElementById('font-size-range') as HTMLInputElement).value = String(
      Math.min(72, ann.size),
    )
    currentBold = ann.bold === true
    updateBoldButton()
    applyColor(ann.hex)
  } else if (isPenAnnotation(ann)) {
    syncColorUi(ann.hex)
    penStrokeWidthPdf = ann.strokeWidth
    syncPenWidthInputs(ann.strokeWidth)
  }
  renderAnnotationsList()
}

function deleteAnnotationById(id: number): void {
  const sortedBefore = annotationsSortedLikeList()
  const idx = sortedBefore.findIndex((a) => a.id === id)
  if (idx === -1) return

  const wasSelected = selectedId === id
  let selectAfter: number | null = null
  if (wasSelected) {
    if (idx > 0) selectAfter = sortedBefore[idx - 1]!.id
  }

  annotations = annotations.filter((a) => a.id !== id)
  if (wasSelected) {
    selectedId = null
    if (selectAfter === null && annotations.length > 0) {
      selectAfter = annotationsSortedLikeList()[0]!.id
    }
  }

  void refreshPage()
  renderAnnotationsList()

  if (wasSelected && selectAfter !== null) {
    void selectAnnotationById(selectAfter)
  }
}

function showInlineInput(clientX: number, clientY: number, pdfX: number, pdfY: number): void {
  const overlay = overlayCanvasEl()
  const stack = $('canvas-stack')
  const input = document.getElementById('inline-input') as HTMLInputElement
  const stackRect = stack.getBoundingClientRect()
  const size = getCurrentFontSize()
  const family = getFontEntry(getCurrentFontId()).cssFamily
  const inkHex = currentColor.hex
  const lightField = hexIsNearWhite(inkHex)
  input.style.display = 'block'
  input.style.left = `${clientX - stackRect.left}px`
  input.style.top = `${clientY - stackRect.top - size * scale}px`
  input.style.fontSize = `${size * scale}px`
  input.style.fontFamily = family
  input.style.fontWeight = currentBold ? 'bold' : '400'
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
      const ann: Annotation = {
        kind: 'text',
        id: nextAnnId++,
        page: currentPage,
        x: pdfX,
        y: pdfY,
        text: t,
        fontId: getCurrentFontId(),
        size: getCurrentFontSize(),
        r: currentColor.r,
        g: currentColor.g,
        b: currentColor.b,
        hex: currentColor.hex,
        bold: currentBold,
      }
      annotations.push(ann)
      selectedId = ann.id
    }
    input.style.display = 'none'
    input.value = ''
    void refreshPage()
    renderAnnotationsList()
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
}

async function applyOpenedPdf(buffer: ArrayBuffer, pathOrName: string): Promise<void> {
  pdfSourceBytes = buffer.slice(0)
  sourceFilePath = pathOrName
  annotations = []
  selectedId = null
  nextAnnId = 1
  activePenStroke = null
  discardShiftPenCompose()
  currentPage = 1
  scale = 1
  currentBold = false
  editorMode = 'text'
  updateModeUi()
  updateBoldButton()
  updateZoomLabel()
  const base = pathOrName.replace(/\\/g, '/').split('/').pop() ?? 'document.pdf'
  $('st-file').textContent = base
  totalPages = await openPdfFromBuffer(pdfSourceBytes)
  $('drop-hint').classList.add('hidden')
  $('canvas-stack').classList.add('visible')
  updateSaveButtonState()
  await refreshPage()
  renderAnnotationsList()
}

async function openPdfFlow(): Promise<void> {
  try {
    if (window.electronAPI) {
      const res = await window.electronAPI.openPDFFile()
      if (res.canceled) return
      await applyOpenedPdf(res.data, res.filePath)
      return
    }
    const input = document.getElementById('pdf-file-input') as HTMLInputElement
    input.value = ''
    input.click()
  } catch (e) {
    console.error(e)
    const msg = e instanceof Error ? e.message : String(e)
    window.alert(`Could not open PDF: ${msg}`)
  }
}

async function savePdfFlow(): Promise<void> {
  if (!pdfSourceBytes) return
  try {
    const bytes = await buildAnnotatedPdfBytes(pdfSourceBytes, annotations)
    const suggested =
      sourceFilePath != null
        ? sourceFilePath.replace(/\.pdf$/i, '') + '_annotated.pdf'
        : 'annotated.pdf'
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

    if (window.electronAPI) {
      const out = await window.electronAPI.savePDFBytes(data, suggested)
      if (!out.canceled) {
        $('st-file').textContent =
          out.filePath.replace(/\\/g, '/').split('/').pop() ?? 'saved.pdf'
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
    $('st-file').textContent = filename
  } catch (e) {
    console.error(e)
    const msg = e instanceof Error ? e.message : String(e)
    window.alert(`Save failed: ${msg}`)
  }
}

async function changePage(delta: number): Promise<void> {
  const next = currentPage + delta
  if (next < 1 || next > totalPages) return
  finalizeShiftPenCompose()
  currentPage = next
  selectedId = null
  activePenStroke = null
  await refreshPage()
  renderAnnotationsList()
}

function setZoom(next: number): void {
  scale = Math.max(0.35, Math.min(4, next))
  finalizeShiftPenCompose()
  activePenStroke = null
  updateZoomLabel()
  void refreshPage()
}

function bindPdfFileInput(): void {
  const input = document.getElementById('pdf-file-input') as HTMLInputElement
  input.addEventListener('change', () => {
    const f = input.files?.[0]
    input.value = ''
    if (!f) return
    const ok =
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    if (!ok) return
    const reader = new FileReader()
    reader.onload = () => {
      void applyOpenedPdf(reader.result as ArrayBuffer, f.name).catch((e) => {
        console.error(e)
        const msg = e instanceof Error ? e.message : String(e)
        window.alert(`Could not open PDF: ${msg}`)
      })
    }
    reader.readAsArrayBuffer(f)
  })
}

function bindToolbar(): void {
  $('btn-open').addEventListener('click', () => void openPdfFlow())
  $('btn-save').addEventListener('click', () => void savePdfFlow())
  $('btn-prev').addEventListener('click', () => void changePage(-1))
  $('btn-next').addEventListener('click', () => void changePage(1))
}

function bindStyleControls(): void {
  const num = document.getElementById('font-size-num') as HTMLInputElement
  const range = document.getElementById('font-size-range') as HTMLInputElement
  const sel = document.getElementById('font-select') as HTMLSelectElement

  const sync = () => {
    let v = parseInt(num.value, 10)
    if (!Number.isFinite(v)) v = 14
    v = Math.min(200, Math.max(6, v))
    num.value = String(v)
    range.value = String(Math.min(72, v))
    const target = selectedId !== null ? annotations.find((a) => a.id === selectedId) : null
    if (target && isTextAnnotation(target)) {
      target.size = v
      target.fontId = sel.value
      void refreshPage()
      renderAnnotationsList()
    }
  }

  num.addEventListener('change', sync)
  range.addEventListener('input', () => {
    num.value = range.value
    sync()
  })
  sel.addEventListener('change', sync)

  const cp = document.getElementById('color-picker') as HTMLInputElement
  cp.addEventListener('input', (e) => applyColor((e.target as HTMLInputElement).value))

  $('btn-bold').addEventListener('click', () => {
    currentBold = !currentBold
    updateBoldButton()
    const target = selectedId !== null ? annotations.find((a) => a.id === selectedId) : null
    if (target && isTextAnnotation(target)) {
      target.bold = currentBold
      void refreshPage()
      renderAnnotationsList()
    }
  })
}

function isFormFieldTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const t = target.tagName
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT'
}

function cloneAnnotationForClipboard(ann: Annotation): Annotation {
  if (isTextAnnotation(ann)) {
    return {
      kind: 'text',
      id: 0,
      page: ann.page,
      x: ann.x,
      y: ann.y,
      text: ann.text,
      fontId: ann.fontId,
      size: ann.size,
      bold: ann.bold,
      r: ann.r,
      g: ann.g,
      b: ann.b,
      hex: ann.hex,
    }
  }
  return {
    kind: 'pen',
    id: 0,
    page: ann.page,
    segments: ann.segments.map((seg) => seg.map((p) => ({ x: p.x, y: p.y }))),
    strokeWidth: ann.strokeWidth,
    r: ann.r,
    g: ann.g,
    b: ann.b,
    hex: ann.hex,
  }
}

function fallbackPastePointPdf(): PdfPoint {
  const overlay = overlayCanvasEl()
  return {
    x: overlay.width / 2 / scale,
    y: overlay.height / 2 / scale,
  }
}

/** Places a clone so its visual top-left (PDF space, y up) matches `at`. */
function annotationPastedAtTopLeft(template: Annotation, page: number, at: PdfPoint): Annotation {
  const overlay = overlayCanvasEl()
  const ctx = overlay.getContext('2d')
  if (isTextAnnotation(template)) {
    if (!ctx) {
      return {
        ...cloneAnnotationForClipboard(template),
        id: 0,
        page,
        x: at.x,
        y: at.y - template.size,
      }
    }
    const tl = textAnnotationTopLeftPdf(ctx, overlay.height, scale, template)
    return {
      ...cloneAnnotationForClipboard(template),
      id: 0,
      page,
      x: at.x + (template.x - tl.x),
      y: at.y + (template.y - tl.y),
    }
  }
  const b = penBoundsPdf(template)
  if (!b) {
    return {
      ...cloneAnnotationForClipboard(template),
      id: 0,
      page,
    }
  }
  const dX = at.x - b.minX
  const dY = at.y - b.maxY
  const cloned = cloneAnnotationForClipboard(template) as Extract<Annotation, { kind: 'pen' }>
  return {
    ...cloned,
    id: 0,
    page,
    segments: cloned.segments.map((seg) => seg.map((p) => ({ x: p.x + dX, y: p.y + dY }))),
  }
}

function bindAnnotationCopyPaste(): void {
  window.addEventListener('keydown', (e) => {
    if (!getPdfJsDocument()) return
    if (isFormFieldTarget(e.target)) return

    if (e.code === 'Delete') {
      if (selectedId === null) return
      e.preventDefault()
      deleteAnnotationById(selectedId)
      return
    }

    const mod = e.ctrlKey || e.metaKey
    if (!mod) return

    if (e.code === 'KeyC') {
      if (selectedId === null) return
      const ann = annotations.find((a) => a.id === selectedId)
      if (!ann) return
      e.preventDefault()
      copiedAnnotationTemplate = cloneAnnotationForClipboard(ann)
      return
    }

    if (e.code === 'KeyX') {
      if (selectedId === null) return
      const id = selectedId
      const ann = annotations.find((a) => a.id === id)
      if (!ann) return
      e.preventDefault()
      copiedAnnotationTemplate = cloneAnnotationForClipboard(ann)
      deleteAnnotationById(id)
      return
    }

    if (e.code === 'KeyV') {
      if (!copiedAnnotationTemplate) return
      e.preventDefault()
      if (shiftPenCompose) finalizeShiftPenCompose()
      if (activePenStroke) commitActivePenIfAny()
      const at = lastPointerPdf ?? fallbackPastePointPdf()
      const newAnn = annotationPastedAtTopLeft(
        copiedAnnotationTemplate,
        currentPage,
        at,
      )
      newAnn.id = nextAnnId++
      annotations.push(newAnn)
      selectedId = newAnn.id
      void refreshPage()
      renderAnnotationsList()
    }
  })
}

/** Nudge selected annotation in overlay/canvas pixels (Shift = 1px, else 10px). */
function bindAnnotationArrowNudge(): void {
  window.addEventListener('keydown', (e) => {
    if (selectedId === null || !getPdfJsDocument()) return
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
    const ann = annotations.find((a) => a.id === selectedId)
    if (!ann || ann.page !== currentPage) return
    e.preventDefault()
    const dPdfX = dx / scale
    const dPdfY = -dy / scale
    if (isTextAnnotation(ann)) {
      ann.x += dPdfX
      ann.y += dPdfY
    } else {
      for (const seg of ann.segments) {
        for (const p of seg) {
          p.x += dPdfX
          p.y += dPdfY
        }
      }
    }
    void refreshPage()
    renderAnnotationsList()
  })
}

function canvasPointFromClient(
  overlay: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): PdfPoint {
  const rect = overlay.getBoundingClientRect()
  const px = clientX - rect.left
  const py = clientY - rect.top
  return {
    x: px / scale,
    y: (overlay.height - py) / scale,
  }
}

function commitActivePenIfAny(): void {
  if (!activePenStroke) return
  const cap = activePenStroke
  const pts = cap.points
  activePenStroke = null
  if (pts.length < 2) {
    redrawOverlayOnly()
    return
  }
  const newId = nextAnnId++
  annotations.push({
    kind: 'pen',
    id: newId,
    page: cap.page,
    segments: [[...pts]],
    strokeWidth: cap.strokeWidth,
    r: cap.r,
    g: cap.g,
    b: cap.b,
    hex: cap.hex,
  })
  selectedId = newId
  void refreshPage()
  renderAnnotationsList()
}

function bindModeAndPen(): void {
  $('mode-text').addEventListener('click', () => {
    if (editorMode === 'text') return
    finalizeShiftPenCompose()
    activePenStroke = null
    editorMode = 'text'
    updateModeUi()
    void refreshPage()
  })
  $('mode-pen').addEventListener('click', () => {
    if (editorMode === 'pen') return
    finalizeShiftPenCompose()
    activePenStroke = null
    editorMode = 'pen'
    updateModeUi()
    void refreshPage()
  })
  const num = document.getElementById('pen-width-num') as HTMLInputElement
  const range = document.getElementById('pen-width-range') as HTMLInputElement
  const syncPen = () => {
    let v = parseInt(num.value, 10)
    if (!Number.isFinite(v)) v = 2
    v = Math.min(48, Math.max(1, v))
    num.value = String(v)
    range.value = String(Math.min(24, v))
    penStrokeWidthPdf = v
  }
  num.addEventListener('change', syncPen)
  range.addEventListener('input', () => {
    num.value = range.value
    syncPen()
  })
  syncPen()
}

function bindShiftPenFinalize(): void {
  window.addEventListener('keyup', (e) => {
    if (e.shiftKey) return
    if (editorMode !== 'pen') return
    finalizeShiftPenCompose()
  })
}

function bindCanvas(): void {
  const overlay = overlayCanvasEl()

  overlay.addEventListener('pointerdown', (e) => {
    if (!getPdfJsDocument()) return
    if (editorMode !== 'pen') return
    if (e.button !== 0) return
    if (isFormFieldTarget(e.target)) return
    e.preventDefault()
    overlay.setPointerCapture(e.pointerId)
    penStrokeWidthPdf = getPenStrokeWidthFromUi()
    const p0 = canvasPointFromClient(overlay, e.clientX, e.clientY)
    selectedId = null

    if (e.shiftKey) {
      activePenStroke = null
      if (shiftPenCompose && shiftPenCompose.page !== currentPage) {
        finalizeShiftPenCompose()
      }
      if (!shiftPenCompose) {
        shiftPenCompose = {
          page: currentPage,
          segments: [],
          current: [p0],
          strokeWidth: penStrokeWidthPdf,
          hex: currentColor.hex,
          r: currentColor.r,
          g: currentColor.g,
          b: currentColor.b,
        }
      } else {
        const cur = shiftPenCompose.current
        if (cur.length >= 2) {
          shiftPenCompose.segments.push([...cur])
        }
        shiftPenCompose.current = [p0]
      }
    } else {
      if (shiftPenCompose) {
        finalizeShiftPenCompose()
      }
      activePenStroke = {
        page: currentPage,
        points: [p0],
        strokeWidth: penStrokeWidthPdf,
        hex: currentColor.hex,
        r: currentColor.r,
        g: currentColor.g,
        b: currentColor.b,
      }
    }
    renderAnnotationsList()
    redrawOverlayOnly()
  })

  const endPen = (e: PointerEvent) => {
    if (editorMode !== 'pen') return
    try {
      overlay.releasePointerCapture(e.pointerId)
    } catch {
      /* no capture */
    }
    if (shiftPenCompose) {
      flushShiftCurrentIntoSegments()
      redrawOverlayOnly()
      renderAnnotationsList()
      return
    }
    if (activePenStroke) {
      commitActivePenIfAny()
    }
  }
  overlay.addEventListener('pointerup', endPen)
  overlay.addEventListener('pointercancel', endPen)

  overlay.addEventListener('pointermove', (e) => {
    if (!getPdfJsDocument()) return
    const rect = overlay.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const x = Math.round(px / scale)
    const y = Math.round((overlay.height - py) / scale)
    $('st-coords').textContent = `${x}, ${y}`
    lastPointerPdf = { x: px / scale, y: (overlay.height - py) / scale }

    if (
      editorMode === 'pen' &&
      shiftPenCompose &&
      shiftPenCompose.page === currentPage &&
      shiftPenCompose.current.length > 0
    ) {
      e.preventDefault()
      const p = canvasPointFromClient(overlay, e.clientX, e.clientY)
      const last = shiftPenCompose.current[shiftPenCompose.current.length - 1]!
      if (penPointsFarEnough(last, p)) shiftPenCompose.current.push(p)
      redrawOverlayOnly()
    } else if (
      editorMode === 'pen' &&
      activePenStroke &&
      activePenStroke.page === currentPage
    ) {
      e.preventDefault()
      const p = canvasPointFromClient(overlay, e.clientX, e.clientY)
      const last = activePenStroke.points[activePenStroke.points.length - 1]!
      if (penPointsFarEnough(last, p)) activePenStroke.points.push(p)
      redrawOverlayOnly()
    }
  })

  overlay.addEventListener('click', (e) => {
    if (!getPdfJsDocument()) return
    if (editorMode === 'pen') return
    const rect = overlay.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const ctx = overlay.getContext('2d')
    if (!ctx) return
    const hit = findAnnotationAtCanvasPoint(
      ctx,
      overlay.height,
      scale,
      currentPage,
      px,
      py,
      annotations,
    )
    if (hit) {
      void selectAnnotationById(hit.id)
      return
    }
    selectedId = null
    void refreshPage()
    renderAnnotationsList()
    const pdfX = px / scale
    const pdfY = (overlay.height - py) / scale
    showInlineInput(e.clientX, e.clientY, pdfX, pdfY)
  })
}

function bindZoom(): void {
  $('zoom-in').addEventListener('click', () => setZoom(scale + 0.15))
  $('zoom-out').addEventListener('click', () => setZoom(scale - 0.15))
  $('zoom-reset').addEventListener('click', () => setZoom(1))

  $('canvas-area').addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.08 : -0.08
      setZoom(scale + delta)
    },
    { passive: false },
  )
}

function bindDragDrop(): void {
  const zone = $('canvas-area')
  ;['dragenter', 'dragover'].forEach((ev) => {
    zone.addEventListener(ev, (e) => {
      e.preventDefault()
      document.body.classList.add('drag-target')
    })
  })
  zone.addEventListener('dragleave', () => {
    document.body.classList.remove('drag-target')
  })
  zone.addEventListener('drop', (e) => {
    e.preventDefault()
    document.body.classList.remove('drag-target')
    const f = e.dataTransfer?.files?.[0]
    if (!f) return
    const ok =
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    if (!ok) return
    const reader = new FileReader()
    reader.onload = () => {
      void applyOpenedPdf(reader.result as ArrayBuffer, f.name).catch((e) => {
        console.error(e)
        const msg = e instanceof Error ? e.message : String(e)
        window.alert(`Could not open PDF: ${msg}`)
      })
    }
    reader.readAsArrayBuffer(f)
  })
}

initFontSelect()
initPalette()
applyColor(PALETTE[0]!)
updateBoldButton()
updateModeUi()
bindToolbar()
bindPdfFileInput()
bindModeAndPen()
bindStyleControls()
bindCanvas()
bindShiftPenFinalize()
bindAnnotationArrowNudge()
bindAnnotationCopyPaste()
bindZoom()
bindDragDrop()
updatePageUi()
updateZoomLabel()
