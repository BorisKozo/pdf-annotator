import type { Annotation, PdfPoint } from './types'
import { isPenAnnotation, isTextAnnotation } from './types'
import { getTextDirection } from './bidi'
import { getFontEntry } from './fonts'

export type PenDrawPreview = {
  page: number
  strokeWidth: number
  hex: string
  opacity?: number
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

/** Padded bounds of pen strokes in PDF space; dashed selection uses this rect. */
export function penBoundsPdf(ann: Extract<Annotation, { kind: 'pen' }>): {
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
  opacity?: number,
): void {
  if (points.length < 2) return
  ctx.save()
  if (opacity !== undefined) ctx.globalAlpha = opacity
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
  hoveredId: number | null = null,
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  const list = annotations.filter((a) => a.page === pageOneBased)
  for (const ann of list) {
    if (isPenAnnotation(ann)) {
      for (const seg of ann.segments) {
        drawPenPolyline(ctx, canvasHeight, scale, seg, ann.strokeWidth, ann.hex, ann.opacity)
      }
      const penHighlightId = ann.id === selectedId ? selectedId : ann.id === hoveredId ? hoveredId : null
      if (penHighlightId !== null) {
        const b = penBoundsPdf(ann)
        if (!b) continue
        const c1 = pdfPointToCanvas({ x: b.minX, y: b.minY }, canvasHeight, scale)
        const c2 = pdfPointToCanvas({ x: b.maxX, y: b.maxY }, canvasHeight, scale)
        const left = Math.min(c1.cx, c2.cx)
        const right = Math.max(c1.cx, c2.cx)
        const top = Math.min(c1.cy, c2.cy)
        const bottom = Math.max(c1.cy, c2.cy)
        ctx.save()
        ctx.strokeStyle =
          ann.id === selectedId ? 'rgba(233, 69, 96, 0.85)' : 'rgba(91, 140, 255, 0.55)'
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
    if (ann.letterSpacing) ctx.letterSpacing = `${ann.letterSpacing * scale}px`
    ctx.fillStyle = ann.hex
    ctx.fillText(ann.text, cx, cy)
    if (ann.id === selectedId || (ann.id === hoveredId && ann.id !== selectedId)) {
      const w = ctx.measureText(ann.text).width
      const h = ann.size * scale
      const left = rtl ? cx - w : cx
      ctx.strokeStyle =
        ann.id === selectedId ? 'rgba(233, 69, 96, 0.85)' : 'rgba(91, 140, 255, 0.55)'
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
        drawPenPolyline(
          ctx,
          canvasHeight,
          scale,
          seg,
          penPreview.strokeWidth,
          penPreview.hex,
          penPreview.opacity,
        )
      }
      if (penPreview.current && penPreview.current.length >= 2) {
        drawPenPolyline(
          ctx,
          canvasHeight,
          scale,
          penPreview.current,
          penPreview.strokeWidth,
          penPreview.hex,
          penPreview.opacity,
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
        penPreview.opacity,
      )
    }
  }
}

/** Top-left of the text selection box in PDF space (y increases upward). */
export function textAnnotationTopLeftPdf(
  ctx: CanvasRenderingContext2D,
  canvasHeight: number,
  scale: number,
  ann: Extract<Annotation, { kind: 'text' }>,
): { x: number; y: number } {
  const cx = ann.x * scale
  const cy = canvasHeight - ann.y * scale
  const dir = getTextDirection(ann.text)
  const family = getFontEntry(ann.fontId).cssFamily
  const rtl = dir === 'rtl'
  ctx.save()
  ctx.direction = dir
  ctx.textAlign = rtl ? 'right' : 'left'
  ctx.font = `${ann.bold === true ? 'bold ' : ''}${ann.size * scale}px ${family}`
  if (ann.letterSpacing) ctx.letterSpacing = `${ann.letterSpacing * scale}px`
  const w = ctx.measureText(ann.text).width
  const h = ann.size * scale
  const left = rtl ? cx - w : cx
  ctx.restore()
  const topCanvas = cy - h
  return { x: left / scale, y: (canvasHeight - topCanvas) / scale }
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

/** All annotations on the page whose ink/box covers the point, in the input array's order. */
export function findAllAnnotationsAtCanvasPoint(
  ctx: CanvasRenderingContext2D,
  canvasHeight: number,
  scale: number,
  pageOneBased: number,
  px: number,
  py: number,
  annotations: Annotation[],
): Annotation[] {
  const list = annotations.filter((a) => a.page === pageOneBased)
  return list.filter((ann) => {
    if (isTextAnnotation(ann)) return hitTestAnnotation(ctx, canvasHeight, scale, px, py, ann)
    if (isPenAnnotation(ann)) return hitTestPenAnnotation(canvasHeight, scale, px, py, ann)
    return false
  })
}

function distanceToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) {
    const ex = px - ax
    const ey = py - ay
    return ex * ex + ey * ey
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  const ex = px - cx
  const ey = py - cy
  return ex * ex + ey * ey
}

function hitTestPenAnnotation(
  canvasHeight: number,
  scale: number,
  px: number,
  py: number,
  ann: Extract<Annotation, { kind: 'pen' }>,
): boolean {
  const tolerance = Math.max((ann.strokeWidth * scale) / 2, 6)
  const toleranceSq = tolerance * tolerance
  for (const seg of ann.segments) {
    if (seg.length === 1) {
      const p = pdfPointToCanvas(seg[0]!, canvasHeight, scale)
      if (distanceToSegmentSq(px, py, p.cx, p.cy, p.cx, p.cy) <= toleranceSq) return true
      continue
    }
    for (let i = 1; i < seg.length; i++) {
      const a = pdfPointToCanvas(seg[i - 1]!, canvasHeight, scale)
      const b = pdfPointToCanvas(seg[i]!, canvasHeight, scale)
      if (distanceToSegmentSq(px, py, a.cx, a.cy, b.cx, b.cy) <= toleranceSq) return true
    }
  }
  return false
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
  if (ann.letterSpacing) ctx.letterSpacing = `${ann.letterSpacing * scale}px`
  const w = ctx.measureText(ann.text).width
  const h = ann.size * scale
  const left = rtl ? cx - w : cx
  const right = left + w
  ctx.restore()
  const pad = 6
  return px >= left - pad && px <= right + pad && py >= cy - h - pad && py <= cy + pad
}
