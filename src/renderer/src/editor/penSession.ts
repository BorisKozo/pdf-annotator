import type { PdfPoint } from '../types'

export type ActivePenStroke = {
  page: number
  points: PdfPoint[]
  strokeWidth: number
  r: number
  g: number
  b: number
  hex: string
}

/** Shift held: multiple strokes committed together when Shift is released. */
export type ShiftPenCompose = {
  page: number
  segments: PdfPoint[][]
  current: PdfPoint[]
  strokeWidth: number
  r: number
  g: number
  b: number
  hex: string
}
