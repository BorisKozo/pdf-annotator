const LS_KEY = 'pdf-editor-autosave'

export async function readAutosave(): Promise<string | null> {
  const api = window.electronAPI
  if (api?.readAutosave) {
    const res = await api.readAutosave()
    return res.text
  }
  try {
    return localStorage.getItem(LS_KEY)
  } catch {
    return null
  }
}

export async function writeAutosave(text: string): Promise<void> {
  const api = window.electronAPI
  if (api?.writeAutosave) {
    await api.writeAutosave(text)
    return
  }
  try {
    localStorage.setItem(LS_KEY, text)
  } catch {
    /* ignore storage quota / privacy-mode errors */
  }
}

export async function deleteAutosave(): Promise<void> {
  const api = window.electronAPI
  if (api?.deleteAutosave) {
    await api.deleteAutosave()
    return
  }
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}
