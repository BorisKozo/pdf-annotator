/** PDF user-space point (origin bottom-left), same as text anchors. */
export interface PdfPoint {
  x: number
  y: number
}

export interface TextAnnotation {
  kind: 'text'
  id: number
  page: number
  x: number
  y: number
  text: string
  fontId: string
  size: number
  /** When true, uses weight 700 in preview and bold subset fonts in exported PDF. */
  bold?: boolean
  r: number
  g: number
  b: number
  hex: string
}

export interface PenAnnotation {
  kind: 'pen'
  id: number
  page: number
  /** Each sub-array is one pen stroke (PDF pt). Disjoint segments are not connected. */
  segments: PdfPoint[][]
  /** Stroke width in PDF points. */
  strokeWidth: number
  r: number
  g: number
  b: number
  hex: string
}

export type Annotation = TextAnnotation | PenAnnotation

export function isTextAnnotation(a: Annotation): a is TextAnnotation {
  return a.kind === 'text'
}

export function isPenAnnotation(a: Annotation): a is PenAnnotation {
  return a.kind === 'pen'
}
