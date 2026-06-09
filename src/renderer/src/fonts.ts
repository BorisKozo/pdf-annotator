import regularHebrewWoff2Url from '@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-hebrew-500-normal.woff2?url'
import regularLatinWoff2Url from '@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-latin-500-normal.woff2?url'
import boldHebrewWoff2Url from '@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-hebrew-700-normal.woff2?url'
import boldLatinWoff2Url from '@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-latin-700-normal.woff2?url'
import { StandardFonts } from 'pdf-lib'

/** Fonts bundled for canvas preview + pdf-lib embed (same file). */
export interface FontEntry {
  id: string
  label: string
  cssFamily: string
  /** Served from Vite public/ → absolute path in app. Required for embedded fonts. */
  publicPath?: string
  /** When set, exporter uses pdf-lib's built-in standard font instead of embedding bytes.
   *  Standard fonts are WinAnsi only — they don't support Hebrew. */
  standardFont?: StandardFonts
  /** Bold variant of the standard font; used when annotation.bold is true. */
  standardFontBold?: StandardFonts
}

export const FONT_CATALOG: FontEntry[] = [
  {
    id: 'noto-hebrew',
    label: 'Noto Sans Hebrew',
    cssFamily: '"Noto Sans Hebrew", "Segoe UI", "Arial", sans-serif',
    // Full family VF from Google Fonts (Hebrew + Latin). The small "Regular"
    // subset TTF is Hebrew-only — Latin names render as squares in saved PDFs.
    publicPath: '/fonts/NotoSansHebrew-VF.ttf',
  },
  {
    id: 'helvetica',
    label: 'Helvetica (English)',
    cssFamily: 'Helvetica, Arial, sans-serif',
    standardFont: StandardFonts.Helvetica,
    standardFontBold: StandardFonts.HelveticaBold,
  },
  {
    id: 'times-roman',
    label: 'Times Roman (English)',
    cssFamily: '"Times New Roman", Times, serif',
    standardFont: StandardFonts.TimesRoman,
    standardFontBold: StandardFonts.TimesRomanBold,
  },
  {
    id: 'courier',
    label: 'Courier (English)',
    cssFamily: '"Courier New", Courier, monospace',
    standardFont: StandardFonts.Courier,
    standardFontBold: StandardFonts.CourierBold,
  },
]

export function getFontEntry(id: string): FontEntry {
  return FONT_CATALOG.find((f) => f.id === id) ?? FONT_CATALOG[0]!
}

/**
 * pdf-lib embed keys for segmented subset fonts (Hebrew+Latin in one annotation).
 * Regular = weight 500 (Medium) — renders noticeably heavier than the default
 * VF weight-400 in PDF viewers which lack subpixel hinting.
 * Bold = weight 700.
 */
export const PDF_EMBED_REGULAR_HEBREW = 'pdf-embed-regular-hebrew-woff2'
export const PDF_EMBED_REGULAR_LATIN = 'pdf-embed-regular-latin-woff2'
export const PDF_EMBED_BOLD_HEBREW = 'pdf-embed-bold-hebrew-woff2'
export const PDF_EMBED_BOLD_LATIN = 'pdf-embed-bold-latin-woff2'

let cachedFontBytes: Map<string, ArrayBuffer> = new Map()

export async function getFontBytesForExport(fontKey: string): Promise<ArrayBuffer> {
  const hit = cachedFontBytes.get(fontKey)
  if (hit) return hit.slice(0)
  let pathOrUrl: string
  if (fontKey === PDF_EMBED_REGULAR_HEBREW) pathOrUrl = regularHebrewWoff2Url
  else if (fontKey === PDF_EMBED_REGULAR_LATIN) pathOrUrl = regularLatinWoff2Url
  else if (fontKey === PDF_EMBED_BOLD_HEBREW) pathOrUrl = boldHebrewWoff2Url
  else if (fontKey === PDF_EMBED_BOLD_LATIN) pathOrUrl = boldLatinWoff2Url
  else {
    const entry = getFontEntry(fontKey)
    if (!entry.publicPath) {
      throw new Error(`Font ${fontKey} has no bytes to load (standard font)`)
    }
    pathOrUrl = entry.publicPath
  }
  const res = await fetch(pathOrUrl)
  if (!res.ok) {
    throw new Error(`Failed to load font (${fontKey}): ${res.status}`)
  }
  const buf = await res.arrayBuffer()
  cachedFontBytes.set(fontKey, buf.slice(0))
  return buf
}
