import { contextBridge, ipcRenderer } from 'electron'

export type OpenPdfResult =
  | { canceled: true }
  | { canceled: false; filePath: string; data: ArrayBuffer }

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
  savePDFBytes: (data: ArrayBuffer, defaultPath?: string): Promise<SavePdfResult> =>
    ipcRenderer.invoke('pdf:save', data, defaultPath),
  openAnnotationsFile: (): Promise<OpenAnnotationsResult> =>
    ipcRenderer.invoke('annotations:open'),
  saveAnnotationsJson: (jsonText: string, defaultPath?: string): Promise<SaveAnnotationsResult> =>
    ipcRenderer.invoke('annotations:save', jsonText, defaultPath),
})
