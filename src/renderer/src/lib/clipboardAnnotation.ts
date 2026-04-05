import { penBoundsPdf, textAnnotationTopLeftPdf } from '../overlay'
import type { Annotation, PdfPoint } from '../types'
import { isPenAnnotation, isTextAnnotation } from '../types'

export function cloneAnnotationForClipboard(ann: Annotation): Annotation {
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

export function fallbackPastePointPdf(overlay: HTMLCanvasElement, scale: number): PdfPoint {
  return {
    x: overlay.width / 2 / scale,
    y: overlay.height / 2 / scale,
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
