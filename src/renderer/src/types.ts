/** PDF user-space point (origin bottom-left), same as text anchors. */
export interface PdfPoint {
  x: number
  y: number
}

export interface TextAnnotation {
  kind: 'text'
  id: number
  page: number
  /** Optional user-provided display name for the annotations list. */
  name?: string
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
  /** Optional user-provided display name for the annotations list. */
  name?: string
  /** Each sub-array is one pen stroke (PDF pt). Disjoint segments are not connected. */
  segments: PdfPoint[][]
  /** Stroke width in PDF points. */
  strokeWidth: number
  /** 0..1. Omitted = 1 (fully opaque). Highlight annotations use 0.3. */
  opacity?: number
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

/** Persisted favorite annotation template. `ann` has `id`/`page` placeholders. */
export interface Favorite {
  id: number
  /** Optional display name; falls back to the inner annotation's label. */
  name?: string
  ann: Annotation
}
