/**
 * Returns 'rtl' if the text contains any strongly-RTL character (Hebrew, Arabic),
 * otherwise 'ltr'. Digits are weak directional characters and do not trigger LTR
 * even when they appear before Hebrew — "420 ש\"ח" is RTL, not LTR.
 */
export function getTextDirection(text: string): 'ltr' | 'rtl' {
  for (const c of text) {
    const cp = c.codePointAt(0)
    if (cp === undefined) continue
    if (isStrongRtl(cp)) return 'rtl'
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
