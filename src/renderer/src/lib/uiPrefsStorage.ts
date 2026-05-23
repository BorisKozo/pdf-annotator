import type { EditorMode } from '../editor/editorState'

const LS_KEY = 'pdf-editor-ui-prefs'

export type UiPrefs = {
  editorMode: EditorMode
  styleFontId: string
  styleFontSize: number
  currentBold: boolean
  penStrokeWidthPdf: number
  highlightStrokeWidthPdf: number
  colorHex: string
}

export async function readUiPrefs(): Promise<Partial<UiPrefs> | null> {
  let text: string | null = null
  const api = window.electronAPI
  if (api?.readUiPrefs) {
    const res = await api.readUiPrefs()
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
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Partial<UiPrefs>
  } catch {
    return null
  }
}

export async function writeUiPrefs(prefs: UiPrefs): Promise<void> {
  const text = JSON.stringify(prefs)
  const api = window.electronAPI
  if (api?.writeUiPrefs) {
    await api.writeUiPrefs(text)
    return
  }
  try {
    localStorage.setItem(LS_KEY, text)
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
