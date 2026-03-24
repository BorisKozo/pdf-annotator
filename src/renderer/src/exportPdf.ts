import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { Annotation } from './types'
import { getTextDirection } from './bidi'
import {
  getFontBytesForExport,
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

  const anyBold = annotations.some((a) => a.bold === true)
  let boldHe: Awaited<ReturnType<typeof embedFor>> | null = null
  let boldLat: Awaited<ReturnType<typeof embedFor>> | null = null
  if (anyBold) {
    boldHe = await embedFor(PDF_EMBED_BOLD_HEBREW)
    boldLat = await embedFor(PDF_EMBED_BOLD_LATIN)
  }

  for (const ann of annotations) {
    const page = doc.getPage(ann.page - 1)
    const color = rgb(ann.r, ann.g, ann.b)
    const rtl = getTextDirection(ann.text) === 'rtl'
    if (ann.bold === true && boldHe && boldLat) {
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
    } else {
      const font = await embedFor(ann.fontId)
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
