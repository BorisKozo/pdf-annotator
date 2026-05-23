import { penBoundsPdf, textAnnotationTopLeftPdf } from '../overlay'
import { getFontEntry } from '../fonts'
import type { Annotation, PdfPoint } from '../types'
import { isPenAnnotation, isTextAnnotation } from '../types'

export function cloneAnnotationForClipboard(ann: Annotation): Annotation {
  if (isTextAnnotation(ann)) {
    return {
      kind: 'text',
      id: 0,
      page: ann.page,
      name: ann.name,
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
    name: ann.name,
    segments: ann.segments.map((seg) => seg.map((p) => ({ x: p.x, y: p.y }))),
    strokeWidth: ann.strokeWidth,
    opacity: ann.opacity,
    r: ann.r,
    g: ann.g,
    b: ann.b,
    hex: ann.hex,
  }
}

export function fallbackPastePointPdf(overlay: HTMLCanvasElement, scale: number): PdfPoint {
  return {
    x: overlay.width / 2 / scale,
    y: overlay.height / 2 / scale,
  }
}

/** Places a clone so its visual center (PDF space, y up) matches `at`. */
export function annotationPastedCenteredAt(
  template: Annotation,
  page: number,
  at: PdfPoint,
  overlay: HTMLCanvasElement,
  scale: number,
): Annotation {
  const ctx = overlay.getContext('2d')
  if (isTextAnnotation(template)) {
    const cloned = cloneAnnotationForClipboard(template) as Extract<Annotation, { kind: 'text' }>
    if (!ctx) {
      return { ...cloned, id: 0, page, x: at.x, y: at.y - template.size / 2 }
    }
    const tl = textAnnotationTopLeftPdf(ctx, overlay.height, scale, template)
    // Measure text width via overlay 2d context.
    const family = getFontEntry(template.fontId).cssFamily
    ctx.save()
    ctx.font = `${template.bold === true ? 'bold ' : ''}${template.size * scale}px ${family}`
    const wCss = ctx.measureText(template.text).width
    ctx.restore()
    const w = wCss / scale
    const h = template.size
    const centerX = tl.x + w / 2
    const centerY = tl.y - h / 2
    return {
      ...cloned,
      id: 0,
      page,
      x: template.x + (at.x - centerX),
      y: template.y + (at.y - centerY),
    }
  }
  const cloned = cloneAnnotationForClipboard(template) as Extract<Annotation, { kind: 'pen' }>
  const b = penBoundsPdf(template)
  if (!b) return { ...cloned, id: 0, page }
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  const dX = at.x - cx
  const dY = at.y - cy
  return {
    ...cloned,
    id: 0,
    page,
    segments: cloned.segments.map((seg) => seg.map((p) => ({ x: p.x + dX, y: p.y + dY }))),
  }
}

/** Places a clone so its visual top-left (PDF space, y up) matches `at`. */
export function annotationPastedAtTopLeft(
  template: Annotation,
  page: number,
  at: PdfPoint,
  overlay: HTMLCanvasElement,
  scale: number,
): Annotation {
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
