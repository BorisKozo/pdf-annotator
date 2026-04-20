import { contextBridge, ipcRenderer, webUtils } from 'electron'

export type OpenPdfResult =
  | { canceled: true }
  | { canceled: false; filePath: string; data: ArrayBuffer }

export type OpenPdfByPathResult =
  | { ok: true; filePath: string; data: ArrayBuffer }
  | { ok: false; error: string }

export type SavePdfResult =
  | { canceled: true }
  | { canceled: false; filePath: string }

export type OpenAnnotationsResult =
  | { canceled: true }
  | { canceled: false; filePath: string; text: string }

export type SaveAnnotationsResult =
  | { canceled: true }
  | { canceled: false; filePath: string }

contextBridge.exposeInMainWorld('electronAPI', {
  openPDFFile: (): Promise<OpenPdfResult> => ipcRenderer.invoke('pdf:open'),
  openPDFByPath: (filePath: string): Promise<OpenPdfByPathResult> =>
    ipcRenderer.invoke('pdf:openByPath', filePath),
  savePDFBytes: (data: ArrayBuffer, defaultPath?: string): Promise<SavePdfResult> =>
    ipcRenderer.invoke('pdf:save', data, defaultPath),
  openAnnotationsFile: (): Promise<OpenAnnotationsResult> =>
    ipcRenderer.invoke('annotations:open'),
  saveAnnotationsJson: (jsonText: string, defaultPath?: string): Promise<SaveAnnotationsResult> =>
    ipcRenderer.invoke('annotations:save', jsonText, defaultPath),
  readAutosave: (): Promise<{ text: string | null }> => ipcRenderer.invoke('autosave:read'),
  writeAutosave: (jsonText: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('autosave:write', jsonText),
  deleteAutosave: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('autosave:delete'),
  /** Full absolute path for a File from drag-drop or <input type=file>. Empty when unavailable. */
  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file) ?? ''
    } catch {
      return ''
    }
  },
})
