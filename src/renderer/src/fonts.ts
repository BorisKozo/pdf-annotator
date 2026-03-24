import boldHebrewWoff2Url from '@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-hebrew-700-normal.woff2?url'
import boldLatinWoff2Url from '@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-latin-700-normal.woff2?url'

/** Fonts bundled for canvas preview + pdf-lib embed (same file). */
export interface FontEntry {
  id: string
  label: string
  cssFamily: string
  /** Served from Vite public/ → absolute path in app */
  publicPath: string
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
]

export function getFontEntry(id: string): FontEntry {
  return FONT_CATALOG.find((f) => f.id === id) ?? FONT_CATALOG[0]!
}

/** pdf-lib embed keys for bold subset fonts (mixed Hebrew+Latin in one annotation). */
export const PDF_EMBED_BOLD_HEBREW = 'pdf-embed-bold-hebrew-woff2'
export const PDF_EMBED_BOLD_LATIN = 'pdf-embed-bold-latin-woff2'

let cachedFontBytes: Map<string, ArrayBuffer> = new Map()

export async function getFontBytesForExport(fontKey: string): Promise<ArrayBuffer> {
  const hit = cachedFontBytes.get(fontKey)
  if (hit) return hit.slice(0)
  let pathOrUrl: string
  if (fontKey === PDF_EMBED_BOLD_HEBREW) pathOrUrl = boldHebrewWoff2Url
  else if (fontKey === PDF_EMBED_BOLD_LATIN) pathOrUrl = boldLatinWoff2Url
  else {
    pathOrUrl = getFontEntry(fontKey).publicPath
  }
  const res = await fetch(pathOrUrl)
  if (!res.ok) {
    throw new Error(`Failed to load font (${fontKey}): ${res.status}`)
  }
  const buf = await res.arrayBuffer()
  cachedFontBytes.set(fontKey, buf.slice(0))
  return buf
}
