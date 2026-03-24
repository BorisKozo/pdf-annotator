import type { Annotation } from './types'
import { getTextDirection } from './bidi'
import { getFontEntry } from './fonts'

export function drawAnnotationOverlay(
  ctx: CanvasRenderingContext2D,
  canvasHeight: number,
  scale: number,
  pageOneBased: number,
  annotations: Annotation[],
  selectedId: number | null,
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  const list = annotations.filter((a) => a.page === pageOneBased)
  for (const ann of list) {
    const cx = ann.x * scale
    const cy = canvasHeight - ann.y * scale
    const dir = getTextDirection(ann.text)
    const family = getFontEntry(ann.fontId).cssFamily
    const rtl = dir === 'rtl'
    // Avoid textAlign 'start' + variable font-weight: Chromium can mis-anchor bold RTL runs.
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
    if (hitTestAnnotation(ctx, canvasHeight, scale, px, py, ann)) return ann
  }
  return null
}

function hitTestAnnotation(
  ctx: CanvasRenderingContext2D,
  canvasHeight: number,
  scale: number,
  px: number,
  py: number,
  ann: Annotation,
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
