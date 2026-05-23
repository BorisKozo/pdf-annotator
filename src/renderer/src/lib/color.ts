export const PALETTE = [
  '#000000',
  '#f8fafc',
  '#0f172a',
  '#5b8cff',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#a78bfa',
  '#22d3ee',
  '#fb7185',
  '#94a3b8',
] as const

export type Rgb01 = { r: number; g: number; b: number }

export function hexToRgb(hex: string): Rgb01 {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  }
}

/** True when the ink color is white or very light (needs a dark input field for contrast). */
export function hexIsNearWhite(hex: string): boolean {
  let full = hex.replace('#', '').toLowerCase()
  if (full.length === 3) {
    full = full
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (full.length !== 6) return false
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if (![r, g, b].every((n) => Number.isFinite(n))) return false
  const lum = (r * 299 + g * 587 + b * 114) / 1000
  return lum >= 230
}

export type InkColor = Rgb01 & { hex: string }

export function inkColorFromHex(hex: string): InkColor {
  const rgb = hexToRgb(hex)
  return { ...rgb, hex }
}
