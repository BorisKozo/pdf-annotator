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
  PDF_EMBED_REGULAR_HEBREW,
  PDF_EMBED_REGULAR_LATIN,
  PDF_EMBED_BOLD_HEBREW,
  PDF_EMBED_BOLD_LATIN,
} from './fonts'

function isHebrewCodePoint(cp: number): boolean {
  if (cp >= 0x0590 && cp <= 0x05ff) return true
  if (cp >= 0xfb1d && cp <= 0xfb4f) return true
  return false
}

/** True for strongly-RTL code points (Hebrew, Arabic and related scripts). */
function isStrongRtlCodePoint(cp: number): boolean {
  if (cp >= 0x0590 && cp <= 0x05ff) return true // Hebrew
  if (cp >= 0x0600 && cp <= 0x06ff) return true // Arabic
  if (cp >= 0x0750 && cp <= 0x077f) return true // Arabic Supplement
  if (cp >= 0x08a0 && cp <= 0x08ff) return true // Arabic Extended-A
  if (cp >= 0xfb1d && cp <= 0xfdff) return true // Hebrew/Arabic Presentation Forms-A
  if (cp >= 0xfe70 && cp <= 0xfeff) return true // Arabic Presentation Forms-B
  return false
}

/** Split text into alternating strongly-RTL and LTR/neutral runs. */
function splitBidiRuns(text: string): { rtl: boolean; s: string }[] {
  const out: { rtl: boolean; s: string }[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (cp === undefined) continue
    const r = isStrongRtlCodePoint(cp)
    const last = out[out.length - 1]
    if (last !== undefined && last.rtl === r) last.s += ch
    else out.push({ rtl: r, s: ch })
  }
  return out
}

/**
 * Draw RTL text with correct BiDi handling for mixed RTL/LTR content.
 *
 * fontkit reverses the entire glyph sequence for RTL scripts, which works for
 * pure Hebrew/Arabic but reverses digit sequences embedded in RTL text (e.g.
 * "שלום 123 ביי" becomes "321" in the PDF). Fix: split into RTL/LTR runs,
 * draw them in visual (reversed) order, and let fontkit handle per-run
 * reversal of Hebrew/Arabic characters while leaving digit runs untouched.
 */
function drawTextBidi(
  page: PDFPage,
  text: string,
  anchorX: number,
  rtl: boolean,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
  font: PDFFont,
): void {
  if (!rtl) {
    page.drawText(text, { x: anchorX, y, size, font, color })
    return
  }

  const runs = splitBidiRuns(text)

  if (runs.length === 1) {
    // Pure RTL (or pure neutral) – single draw call, fontkit handles reversal.
    const w = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: anchorX - w, y, size, font, color })
    return
  }

  // Calculate total advance width across all runs.
  let total = 0
  for (const run of runs) {
    total += font.widthOfTextAtSize(run.s, size)
  }

  // Draw in visual order: RTL paragraph = reverse the run order.
  // fontkit reverses glyph order within each RTL run; LTR runs (digits,
  // spaces) are drawn as-is, preserving the correct left-to-right digit order.
  //
  // Space placement: when the first visual run (leftmost) is an LTR run with
  // leading spaces (e.g. "רחובות (26)" → LTR run is " (26)"), those spaces
  // must be moved to the trailing position so they appear as the gap between
  // the LTR block and the adjacent RTL block, not at the far-left edge.
  let cursor = anchorX - total
  let isFirstVisualRun = true
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i]!
    if (!run.s) continue
    let text = run.s
    if (isFirstVisualRun && !run.rtl) {
      // First (leftmost) visual run is LTR with leading spaces: move them to
      // trailing so the gap appears between the LTR block and the RTL block.
      const trimmed = text.trimStart()
      if (trimmed.length < text.length) {
        text = trimmed + text.slice(0, text.length - trimmed.length)
      }
    }
    if (i === 0 && !run.rtl) {
      // Last (rightmost) visual run is LTR with trailing spaces: move them to
      // leading so the gap appears between the RTL block and the LTR block.
      const trimmed = text.trimEnd()
      if (trimmed.length < text.length) {
        text = text.slice(trimmed.length) + trimmed
      }
    }
    page.drawText(text, { x: cursor, y, size, font, color })
    cursor += font.widthOfTextAtSize(text, size)
    isFirstVisualRun = false
  }
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

function drawSegmented(
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
  // For RTL, draw runs in visual order (reversed) so Hebrew words land on the
  // correct side of the anchor and digits are not reversed within their block.
  const drawOrder = rtl ? [...segs].reverse() : segs
  let isFirstVisualSeg = rtl
  for (let i = 0; i < drawOrder.length; i++) {
    const seg = drawOrder[i]!
    const font = seg.hebrew ? fontHe : fontLat
    if (!seg.s) continue
    let text = seg.s
    if (isFirstVisualSeg && !seg.hebrew) {
      // First (leftmost) visual seg is LTR with leading spaces: move to trailing.
      const trimmed = text.trimStart()
      if (trimmed.length < text.length) {
        text = trimmed + text.slice(0, text.length - trimmed.length)
      }
    }
    if (rtl && i === drawOrder.length - 1 && !seg.hebrew) {
      // Last (rightmost) visual seg is LTR with trailing spaces: move to leading.
      const trimmed = text.trimEnd()
      if (trimmed.length < text.length) {
        text = text.slice(trimmed.length) + trimmed
      }
    }
    page.drawText(text, { x: cursor, y, size, font, color })
    cursor += font.widthOfTextAtSize(text, size)
    isFirstVisualSeg = false
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
  ): Promise<{ font: PDFFont; segmented: false } | { segmented: true; bold: boolean }> => {
    const entry = getFontEntry(fontId)
    if (entry.standardFont) {
      const key = bold && entry.standardFontBold ? entry.standardFontBold : entry.standardFont
      return { font: embedStandard(key), segmented: false }
    }
    // Non-standard (custom) fonts always use segmented subset rendering so that
    // Hebrew and Latin characters each use a correctly-weighted woff2 file.
    return { segmented: true, bold }
  }

  // Preload whichever subset font pairs are actually needed.
  const customAnnotations = annotations.filter(
    (a) => isTextAnnotation(a) && !getFontEntry(a.fontId).standardFont,
  )
  const needsRegular = customAnnotations.some((a) => isTextAnnotation(a) && a.bold !== true)
  const needsBold = customAnnotations.some((a) => isTextAnnotation(a) && a.bold === true)
  let regularHe: PDFFont | null = null
  let regularLat: PDFFont | null = null
  let boldHe: PDFFont | null = null
  let boldLat: PDFFont | null = null
  if (needsRegular) {
    regularHe = await embedFor(PDF_EMBED_REGULAR_HEBREW)
    regularLat = await embedFor(PDF_EMBED_REGULAR_LATIN)
  }
  if (needsBold) {
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
    if (resolved.segmented) {
      const he = resolved.bold ? boldHe : regularHe
      const lat = resolved.bold ? boldLat : regularLat
      if (he && lat) {
        drawSegmented(page, ann.text, ann.x, rtl, ann.y, ann.size, color, he, lat)
      }
    } else {
      drawTextBidi(page, ann.text, ann.x, rtl, ann.y, ann.size, color, resolved.font)
    }
  }

  return doc.save()
}
