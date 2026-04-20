import { FONT_CATALOG } from '../fonts'
import type { Annotation, PdfPoint, PenAnnotation, TextAnnotation } from '../types'

export const ANNOTATIONS_FILE_VERSION = 1

const DEFAULT_FONT_ID = FONT_CATALOG[0]!.id
const fontIds = new Set(FONT_CATALOG.map((f) => f.id))

export type ParsedAnnotationsFile = {
  annotations: Annotation[]
  pdfPath: string | null
}

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
    segments.push(seg.map((p) => parsePdfPoint(p)))
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

/** Parse JSON from a saved annotations file (array or `{ version, pdfPath?, annotations }`). */
export function parseAnnotationsFile(text: string): ParsedAnnotationsFile {
  let data: unknown
  try {
    data = JSON.parse(text) as unknown
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Invalid JSON: ${msg}`)
  }

  let rawList: unknown
  let pdfPath: string | null = null
  if (Array.isArray(data)) {
    rawList = data
  } else if (isRecord(data) && Array.isArray(data.annotations)) {
    rawList = data.annotations
    if (typeof data.pdfPath === 'string' && data.pdfPath.length > 0) {
      pdfPath = data.pdfPath
    }
  } else {
    throw new Error('Expected a JSON array of annotations or an object with an "annotations" array')
  }

  const annotations = (rawList as unknown[]).map((item, i) => parseOneAnnotation(item, i))
  return { annotations, pdfPath }
}

export function serializeAnnotationsToJson(
  annotations: Annotation[],
  pdfPath: string | null,
): string {
  return JSON.stringify(
    {
      version: ANNOTATIONS_FILE_VERSION,
      pdfPath: pdfPath ?? undefined,
      annotations,
    },
    null,
    2,
  )
}

/** Normalize a pdf path for comparison: forward slashes, lowercased, trimmed. */
export function normalizePdfPath(p: string | null | undefined): string {
  if (!p) return ''
  return p.replace(/\\/g, '/').trim().toLowerCase()
}

export function pdfPathsMatch(a: string | null, b: string | null): boolean {
  const na = normalizePdfPath(a)
  const nb = normalizePdfPath(b)
  if (!na || !nb) return false
  return na === nb
}
