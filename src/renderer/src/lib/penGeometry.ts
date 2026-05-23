import type { PdfPoint } from '../types'

export const MIN_PEN_SEGMENT_PDF = 0.2

export function penHasDrawableSegments(segments: PdfPoint[][]): boolean {
  return segments.some((s) => s.length >= 2)
}

export function penPointsFarEnough(a: PdfPoint, b: PdfPoint): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return dx * dx + dy * dy >= MIN_PEN_SEGMENT_PDF * MIN_PEN_SEGMENT_PDF
}
