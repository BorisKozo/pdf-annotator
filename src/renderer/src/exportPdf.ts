import {
  PDFDocument,
  PDFName,
  PDFOperator,
  rgb,
  LineCapStyle,
  LineJoinStyle,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  stroke,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  setGraphicsState,
  type PDFFont,
  type PDFPage,
  type StandardFonts,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { Annotation } from './types'
import { isTextAnnotation } from './types'
import { getTextDirection } from './bidi'
import {
  getFontBytesForExport,
  getFontEntry,
  PDF_EMBED_BOLD_HEBREW,
  PDF_EMBED_BOLD_LATIN,
} from './fonts'

function isHebrewCodePoint(cp: number): boolean {
  if (cp >= 0x0590 && cp <= 0x05ff) return true
  if (cp >= 0xfb1d && cp <= 0xfb4f) return true
  return false
}

/** Split into Hebrew vs non-Hebrew runs so each can use a matching bold subset font. */
function segmentForBoldPdf(text: string): { hebrew: boolean; s: string }[] {
  const out: { hebrew: boolean; s: string }[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (cp === undefined) continue
    const he = isHebrewCodePoint(cp)
    const last = out[out.length - 1]
    if (last !== undefined && last.hebrew === he) last.s += ch
    else out.push({ hebrew: he, s: ch })
  }
  return out
}

function drawBoldSegmented(
  page: PDFPage,
  text: string,
  anchorX: number,
  rtl: boolean,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
  fontHe: PDFFont,
  fontLat: PDFFont,
): void {
  const segs = segmentForBoldPdf(text)
  let total = 0
  for (const seg of segs) {
    const font = seg.hebrew ? fontHe : fontLat
    if (seg.s) total += font.widthOfTextAtSize(seg.s, size)
  }
  let cursor = rtl ? anchorX - total : anchorX
  for (const seg of segs) {
    const font = seg.hebrew ? fontHe : fontLat
    if (!seg.s) continue
    page.drawText(seg.s, { x: cursor, y, size, font, color })
    cursor += font.widthOfTextAtSize(seg.s, size)
  }
}

export async function buildAnnotatedPdfBytes(
  originalBytes: ArrayBuffer,
  annotations: Annotation[],
): Promise<Uint8Array> {
  if (annotations.length === 0) {
    return new Uint8Array(originalBytes)
  }
  const doc = await PDFDocument.load(originalBytes.slice(0))
  doc.registerFontkit(fontkit)
  const fontCache = new Map<string, Awaited<ReturnType<typeof doc.embedFont>>>()

  const embedFor = async (fontKey: string) => {
    const hit = fontCache.get(fontKey)
    if (hit) return hit
    const bytes = await getFontBytesForExport(fontKey)
    // Full embed (subset: false). Subsetting via fontkit often breaks cmap / glyph
    // mapping for many fonts, which PDF viewers show as square placeholders.
    const font = await doc.embedFont(new Uint8Array(bytes), { subset: false })
    fontCache.set(fontKey, font)
    return font
  }

  const embedStandard = (key: StandardFonts) => {
    const hit = fontCache.get(key)
    if (hit) return hit
    const font = doc.embedStandardFont(key)
    fontCache.set(key, font)
    return font
  }

  const resolveFont = async (
    fontId: string,
    bold: boolean,
  ): Promise<{ font: PDFFont; segmentedBold: false } | { segmentedBold: true }> => {
    const entry = getFontEntry(fontId)
    if (entry.standardFont) {
      const key = bold && entry.standardFontBold ? entry.standardFontBold : entry.standardFont
      return { font: embedStandard(key), segmentedBold: false }
    }
    if (bold) return { segmentedBold: true }
    return { font: await embedFor(fontId), segmentedBold: false }
  }

  const needsHebrewBold = annotations.some(
    (a) => isTextAnnotation(a) && a.bold === true && !getFontEntry(a.fontId).standardFont,
  )
  let boldHe: PDFFont | null = null
  let boldLat: PDFFont | null = null
  if (needsHebrewBold) {
    boldHe = await embedFor(PDF_EMBED_BOLD_HEBREW)
    boldLat = await embedFor(PDF_EMBED_BOLD_LATIN)
  }

  for (const ann of annotations) {
    const page = doc.getPage(ann.page - 1)
    const color = rgb(ann.r, ann.g, ann.b)

    if (ann.kind === 'pen') {
      const opacity = ann.opacity ?? 1

      if (opacity >= 1) {
        // Opaque strokes: drawLine per segment is fine.
        for (const seg of ann.segments) {
          for (let i = 1; i < seg.length; i++) {
            page.drawLine({
              start: { x: seg[i - 1]!.x, y: seg[i - 1]!.y },
              end: { x: seg[i]!.x, y: seg[i]!.y },
              thickness: ann.strokeWidth,
              color,
              lineCap: LineCapStyle.Round,
            })
          }
        }
      } else {
        // Transparent strokes (e.g. highlights): draw ALL segments as one
        // compound path and apply the opacity ExtGState a single time.
        // Using drawLine() per segment causes opacity to compound wherever
        // adjacent round caps overlap, producing uneven darkness at joints.
        const gsDict = page.doc.context.obj({ Type: 'ExtGState', CA: opacity, ca: opacity })
        const gsKey: PDFName = (page.node as any).newExtGState('GS', gsDict)

        const ops: PDFOperator[] = [
          pushGraphicsState(),
          setGraphicsState(gsKey),
          setLineCap(LineCapStyle.Round),
          setLineJoin(LineJoinStyle.Round),
          setLineWidth(ann.strokeWidth),
          setStrokingRgbColor(ann.r, ann.g, ann.b),
        ]

        for (const seg of ann.segments) {
          if (seg.length === 0) continue
          ops.push(moveTo(seg[0]!.x, seg[0]!.y))
          for (let i = 1; i < seg.length; i++) {
            ops.push(lineTo(seg[i]!.x, seg[i]!.y))
          }
        }

        ops.push(stroke(), popGraphicsState())
        page.pushOperators(...ops)
      }
      continue
    }

    const rtl = getTextDirection(ann.text) === 'rtl'
    const resolved = await resolveFont(ann.fontId, ann.bold === true)
    if (resolved.segmentedBold && boldHe && boldLat) {
      drawBoldSegmented(
        page,
        ann.text,
        ann.x,
        rtl,
        ann.y,
        ann.size,
        color,
        boldHe,
        boldLat,
      )
    } else if (!resolved.segmentedBold) {
      const font = resolved.font
      const w = font.widthOfTextAtSize(ann.text, ann.size)
      const xPdf = rtl ? ann.x - w : ann.x
      page.drawText(ann.text, {
        x: xPdf,
        y: ann.y,
        size: ann.size,
        font,
        color,
      })
    }
  }

  return doc.save()
}
