export interface Annotation {
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
