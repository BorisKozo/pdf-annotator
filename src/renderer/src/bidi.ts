/** First strong character determines paragraph direction for placement hints. */
export function getTextDirection(text: string): 'ltr' | 'rtl' {
  for (const c of text) {
    const cp = c.codePointAt(0)
    if (cp === undefined) continue
    if (isStrongRtl(cp)) return 'rtl'
    if (isStrongLtr(cp)) return 'ltr'
  }
  return 'ltr'
}

function isStrongRtl(cp: number): boolean {
  if (cp >= 0x0590 && cp <= 0x05ff) return true
  if (cp >= 0x0600 && cp <= 0x06ff) return true
  if (cp >= 0x0750 && cp <= 0x077f) return true
  if (cp >= 0x08a0 && cp <= 0x08ff) return true
  if (cp >= 0xfb1d && cp <= 0xfdff) return true
  if (cp >= 0xfe70 && cp <= 0xfeff) return true
  return false
}

function isStrongLtr(cp: number): boolean {
  if (cp >= 0x41 && cp <= 0x5a) return true
  if (cp >= 0x61 && cp <= 0x7a) return true
  if (cp >= 0x30 && cp <= 0x39) return true
  return false
}
