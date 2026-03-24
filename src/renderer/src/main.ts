import { FONT_CATALOG } from './fonts'
import { openPdfFromBuffer, renderPdfPage, getPdfJsDocument } from './pdfSession'
import { drawAnnotationOverlay, findAnnotationAtCanvasPoint } from './overlay'
import { buildAnnotatedPdfBytes } from './exportPdf'
import type { Annotation } from './types'
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

async function refreshPage(): Promise<void> {
  if (!getPdfJsDocument()) return
  const pdfCanvas = pdfCanvasEl()
  await renderPdfPage(currentPage, scale, pdfCanvas)
  syncOverlaySize()
  const overlay = overlayCanvasEl()
  const ctx = overlay.getContext('2d')
  if (!ctx) return
  drawAnnotationOverlay(ctx, overlay.height, scale, currentPage, annotations, selectedId)
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

function applyColor(hex: string): void {
  const rgb = hexToRgb(hex)
  currentColor = { r: rgb.r, g: rgb.g, b: rgb.b, hex }
  ;(document.getElementById('color-picker') as HTMLInputElement).value = hex
  $('hex-label').textContent = hex.toUpperCase()
  document.querySelectorAll('.swatch').forEach((el) => {
    el.classList.toggle('selected', (el as HTMLElement).dataset.hex === hex)
  })
  const sel = selectedId !== null ? annotations.find((a) => a.id === selectedId) : null
  if (sel) {
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
  const sorted = [...annotations].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page
    return a.id - b.id
  })
  for (const ann of sorted) {
    const row = document.createElement('div')
    row.className = 'ann-row' + (ann.id === selectedId ? ' active' : '')
    row.innerHTML = `
      <span class="ann-dot" style="background:${ann.hex}"></span>
      <span class="ann-label" title="${escapeAttr(ann.text)}">${ann.bold === true ? '<strong style="opacity:.85">B</strong> ' : ''}p${ann.page}: ${escapeHtml(ann.text)}</span>
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
  selectedId = id
  const ann = annotations.find((a) => a.id === id)
  if (!ann) return
  if (ann.page !== currentPage) {
    currentPage = ann.page
    await refreshPage()
  } else {
    const overlay = overlayCanvasEl()
    const ctx = overlay.getContext('2d')
    if (ctx) {
      drawAnnotationOverlay(ctx, overlay.height, scale, currentPage, annotations, selectedId)
    }
  }
  ;(document.getElementById('font-select') as HTMLSelectElement).value = ann.fontId
  ;(document.getElementById('font-size-num') as HTMLInputElement).value = String(ann.size)
  ;(document.getElementById('font-size-range') as HTMLInputElement).value = String(
    Math.min(72, ann.size),
  )
  currentBold = ann.bold === true
  updateBoldButton()
  applyColor(ann.hex)
  renderAnnotationsList()
}

function deleteAnnotationById(id: number): void {
  annotations = annotations.filter((a) => a.id !== id)
  if (selectedId === id) selectedId = null
  void refreshPage()
  renderAnnotationsList()
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
  currentPage = 1
  scale = 1
  currentBold = false
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
  currentPage = next
  selectedId = null
  await refreshPage()
  renderAnnotationsList()
}

function setZoom(next: number): void {
  scale = Math.max(0.35, Math.min(4, next))
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
    if (target) {
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
    if (target) {
      target.bold = currentBold
      void refreshPage()
      renderAnnotationsList()
    }
  })
}

function bindCanvas(): void {
  const overlay = overlayCanvasEl()
  overlay.addEventListener('click', (e) => {
    if (!getPdfJsDocument()) return
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

  overlay.addEventListener('mousemove', (e) => {
    if (!getPdfJsDocument()) return
    const rect = overlay.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const x = Math.round(px / scale)
    const y = Math.round((overlay.height - py) / scale)
    $('st-coords').textContent = `${x}, ${y}`
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
bindToolbar()
bindPdfFileInput()
bindStyleControls()
bindCanvas()
bindZoom()
bindDragDrop()
updatePageUi()
updateZoomLabel()
