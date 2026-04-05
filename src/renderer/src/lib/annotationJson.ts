import { FONT_CATALOG } from '../fonts'
import type { Annotation, PdfPoint, PenAnnotation, TextAnnotation } from '../types'

export const ANNOTATIONS_FILE_VERSION = 1

const DEFAULT_FONT_ID = FONT_CATALOG[0]!.id
const fontIds = new Set(FONT_CATALOG.map((f) => f.id))

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function num(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`Invalid or missing number: ${field}`)
  }
  return v
}

function str(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new Error(`Invalid or missing string: ${field}`)
  return v
}

function parsePdfPoint(raw: unknown): PdfPoint {
  if (!isRecord(raw)) throw new Error('Invalid point')
  return { x: num(raw.x, 'x'), y: num(raw.y, 'y') }
}

function parseTextAnnotation(raw: Record<string, unknown>): TextAnnotation {
  const fontId = str(raw.fontId, 'fontId')
  return {
    kind: 'text',
    id: num(raw.id, 'id'),
    page: num(raw.page, 'page'),
    x: num(raw.x, 'x'),
    y: num(raw.y, 'y'),
    text: str(raw.text, 'text'),
    fontId: fontIds.has(fontId) ? fontId : DEFAULT_FONT_ID,
    size: num(raw.size, 'size'),
    bold: raw.bold === true ? true : undefined,
    r: num(raw.r, 'r'),
    g: num(raw.g, 'g'),
    b: num(raw.b, 'b'),
    hex: str(raw.hex, 'hex'),
  }
}

function parsePenAnnotation(raw: Record<string, unknown>): PenAnnotation {
  if (!Array.isArray(raw.segments)) throw new Error('pen.segments must be an array')
  const segments: PdfPoint[][] = []
  for (let s = 0; s < raw.segments.length; s++) {
    const seg = raw.segments[s]
    if (!Array.isArray(seg)) throw new Error(`pen.segments[${s}] must be an array`)
    segments.push(seg.map((p, i) => parsePdfPoint(p)))
  }
  return {
    kind: 'pen',
    id: num(raw.id, 'id'),
    page: num(raw.page, 'page'),
    segments,
    strokeWidth: num(raw.strokeWidth, 'strokeWidth'),
    r: num(raw.r, 'r'),
    g: num(raw.g, 'g'),
    b: num(raw.b, 'b'),
    hex: str(raw.hex, 'hex'),
  }
}

function parseOneAnnotation(raw: unknown, index: number): Annotation {
  if (!isRecord(raw)) throw new Error(`Annotation ${index}: expected object`)
  const kind = raw.kind
  if (kind === 'text') return parseTextAnnotation(raw)
  if (kind === 'pen') return parsePenAnnotation(raw)
  throw new Error(`Annotation ${index}: kind must be "text" or "pen"`)
}

/** Parse JSON from a saved annotations file (array or `{ version, annotations }`). */
export function parseAnnotationsFile(text: string): Annotation[] {
  let data: unknown
  try {
    data = JSON.parse(text) as unknown
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Invalid JSON: ${msg}`)
  }

  let rawList: unknown
  if (Array.isArray(data)) {
    rawList = data
  } else if (isRecord(data) && Array.isArray(data.annotations)) {
    rawList = data.annotations
  } else {
    throw new Error('Expected a JSON array of annotations or an object with an "annotations" array')
  }

  return (rawList as unknown[]).map((item, i) => parseOneAnnotation(item, i))
}

export function serializeAnnotationsToJson(annotations: Annotation[]): string {
  return JSON.stringify(
    { version: ANNOTATIONS_FILE_VERSION, annotations },
    null,
    2,
  )
}
