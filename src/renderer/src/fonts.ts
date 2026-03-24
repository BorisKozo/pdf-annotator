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
    publicPath: '/fonts/NotoSansHebrew-Regular.ttf',
  },
]

export function getFontEntry(id: string): FontEntry {
  return FONT_CATALOG.find((f) => f.id === id) ?? FONT_CATALOG[0]!
}

let cachedFontBytes: Map<string, ArrayBuffer> = new Map()

export async function getFontBytesForExport(fontId: string): Promise<ArrayBuffer> {
  const hit = cachedFontBytes.get(fontId)
  if (hit) return hit.slice(0)
  const entry = getFontEntry(fontId)
  const res = await fetch(entry.publicPath)
  if (!res.ok) {
    throw new Error(`Failed to load font ${entry.publicPath}: ${res.status}`)
  }
  const buf = await res.arrayBuffer()
  cachedFontBytes.set(fontId, buf.slice(0))
  return buf
}
