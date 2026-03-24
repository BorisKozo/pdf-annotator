import type { Annotation, PdfPoint } from './types'
import { isPenAnnotation, isTextAnnotation } from './types'
import { getTextDirection } from './bidi'
import { getFontEntry } from './fonts'

export type PenDrawPreview = {
  page: number
  strokeWidth: number
  hex: string
  /** Single-stroke preview (normal pen). */
  points?: PdfPoint[]
  /** Multi-stroke preview while Shift is held: finished strokes plus `current`. */
  segments?: PdfPoint[][]
  current?: PdfPoint[]
}

function pdfPointToCanvas(
  p: PdfPoint,
  canvasHeight: number,
  scale: number,
): { cx: number; cy: number } {
  return { cx: p.x * scale, cy: canvasHeight - p.y * scale }
}

function penBoundsPdf(ann: Extract<Annotation, { kind: 'pen' }>): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const seg of ann.segments) {
    for (const p of seg) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  if (minX === Infinity) return null
  const pad = ann.strokeWidth / 2 + 2
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
}

function drawPenPolyline(
  ctx: CanvasRenderingContext2D,
  canvasHeight: number,
  scale: number,
  points: PdfPoint[],
  strokeWidthPdf: number,
  hex: string,
): void {
  if (points.length < 2) return
  ctx.save()
  ctx.strokeStyle = hex
  ctx.lineWidth = Math.max(1, strokeWidthPdf * scale)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const first = pdfPointToCanvas(points[0]!, canvasHeight, scale)
  ctx.moveTo(first.cx, first.cy)
  for (let i = 1; i < points.length; i++) {
    const { cx, cy } = pdfPointToCanvas(points[i]!, canvasHeight, scale)
    ctx.lineTo(cx, cy)
  }
  ctx.stroke()
  ctx.restore()
}

export function drawAnnotationOverlay(
  ctx: CanvasRenderingContext2D,
  canvasHeight: number,
  scale: number,
  pageOneBased: number,
  annotations: Annotation[],
  selectedId: number | null,
  penPreview?: PenDrawPreview | null,
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  const list = annotations.filter((a) => a.page === pageOneBased)
  for (const ann of list) {
    if (isPenAnnotation(ann)) {
      for (const seg of ann.segments) {
        drawPenPolyline(ctx, canvasHeight, scale, seg, ann.strokeWidth, ann.hex)
      }
      if (ann.id === selectedId) {
        const b = penBoundsPdf(ann)
        if (!b) continue
        const c1 = pdfPointToCanvas({ x: b.minX, y: b.minY }, canvasHeight, scale)
        const c2 = pdfPointToCanvas({ x: b.maxX, y: b.maxY }, canvasHeight, scale)
        const left = Math.min(c1.cx, c2.cx)
        const right = Math.max(c1.cx, c2.cx)
        const top = Math.min(c1.cy, c2.cy)
        const bottom = Math.max(c1.cy, c2.cy)
        ctx.save()
        ctx.strokeStyle = 'rgba(233, 69, 96, 0.85)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.strokeRect(left - 1, top - 1, right - left + 2, bottom - top + 2)
        ctx.setLineDash([])
        ctx.restore()
      }
      continue
    }

    if (!isTextAnnotation(ann)) continue

    const cx = ann.x * scale
    const cy = canvasHeight - ann.y * scale
    const dir = getTextDirection(ann.text)
    const family = getFontEntry(ann.fontId).cssFamily
    const rtl = dir === 'rtl'
    ctx.save()
    ctx.direction = dir
    ctx.textAlign = rtl ? 'right' : 'left'
    ctx.font = `${ann.bold === true ? 'bold ' : ''}${ann.size * scale}px ${family}`
    ctx.fillStyle = ann.hex
    ctx.fillText(ann.text, cx, cy)
    if (ann.id === selectedId) {
      const w = ctx.measureText(ann.text).width
      const h = ann.size * scale
      const left = rtl ? cx - w : cx
      ctx.strokeStyle = 'rgba(233, 69, 96, 0.85)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.strokeRect(left - 2, cy - h - 2, w + 4, h + 6)
      ctx.setLineDash([])
    }
    ctx.restore()
  }

  if (penPreview && penPreview.page === pageOneBased) {
    if (penPreview.segments !== undefined) {
      for (const seg of penPreview.segments) {
        drawPenPolyline(ctx, canvasHeight, scale, seg, penPreview.strokeWidth, penPreview.hex)
      }
      if (penPreview.current && penPreview.current.length >= 2) {
        drawPenPolyline(
          ctx,
          canvasHeight,
          scale,
          penPreview.current,
          penPreview.strokeWidth,
          penPreview.hex,
        )
      }
    } else if (penPreview.points && penPreview.points.length >= 2) {
      drawPenPolyline(
        ctx,
        canvasHeight,
        scale,
        penPreview.points,
        penPreview.strokeWidth,
        penPreview.hex,
      )
    }
  }
}

export function findAnnotationAtCanvasPoint(
  ctx: CanvasRenderingContext2D,
  canvasHeight: number,
  scale: number,
  pageOneBased: number,
  px: number,
  py: number,
  annotations: Annotation[],
): Annotation | null {
  const list = annotations.filter((a) => a.page === pageOneBased)
  for (let i = list.length - 1; i >= 0; i--) {
    const ann = list[i]!
    if (isTextAnnotation(ann) && hitTestAnnotation(ctx, canvasHeight, scale, px, py, ann))
      return ann
  }
  return null
}

function hitTestAnnotation(
  ctx: CanvasRenderingContext2D,
  canvasHeight: number,
  scale: number,
  px: number,
  py: number,
  ann: Extract<Annotation, { kind: 'text' }>,
): boolean {
  const cx = ann.x * scale
  const cy = canvasHeight - ann.y * scale
  const dir = getTextDirection(ann.text)
  const family = getFontEntry(ann.fontId).cssFamily
  const rtl = dir === 'rtl'
  ctx.save()
  ctx.direction = dir
  ctx.textAlign = rtl ? 'right' : 'left'
  ctx.font = `${ann.bold === true ? 'bold ' : ''}${ann.size * scale}px ${family}`
  const w = ctx.measureText(ann.text).width
  const h = ann.size * scale
  const left = rtl ? cx - w : cx
  const right = left + w
  ctx.restore()
  const pad = 6
  return px >= left - pad && px <= right + pad && py >= cy - h - pad && py <= cy + pad
}
