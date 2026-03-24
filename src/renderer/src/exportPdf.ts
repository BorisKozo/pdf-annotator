import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { Annotation } from './types'
import { getFontBytesForExport } from './fonts'

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

  const embedFor = async (fontId: string) => {
    const hit = fontCache.get(fontId)
    if (hit) return hit
    const bytes = await getFontBytesForExport(fontId)
    let font: Awaited<ReturnType<typeof doc.embedFont>>
    try {
      font = await doc.embedFont(bytes, { subset: true })
    } catch {
      font = await doc.embedFont(bytes)
    }
    fontCache.set(fontId, font)
    return font
  }

  for (const ann of annotations) {
    const page = doc.getPage(ann.page - 1)
    const font = await embedFor(ann.fontId)
    page.drawText(ann.text, {
      x: ann.x,
      y: ann.y,
      size: ann.size,
      font,
      color: rgb(ann.r, ann.g, ann.b),
    })
  }

  return doc.save()
}
