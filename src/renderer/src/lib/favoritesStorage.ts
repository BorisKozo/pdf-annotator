import type { Favorite } from '../types'

const LS_KEY = 'pdf-editor-favorites'

export async function readFavorites(): Promise<Favorite[] | null> {
  let text: string | null = null
  const api = window.electronAPI
  if (api?.readFavorites) {
    const res = await api.readFavorites()
    text = res.text
  } else {
    try {
      text = localStorage.getItem(LS_KEY)
    } catch {
      return null
    }
  }
  if (!text) return null
  try {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) return null
    // Trust the persisted shape; validation happens implicitly when rendering.
    return parsed as Favorite[]
  } catch {
    return null
  }
}

export async function writeFavorites(favorites: Favorite[]): Promise<void> {
  const text = JSON.stringify(favorites)
  const api = window.electronAPI
  if (api?.writeFavorites) {
    await api.writeFavorites(text)
    return
  }
  try {
    localStorage.setItem(LS_KEY, text)
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
