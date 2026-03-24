import { contextBridge, ipcRenderer } from 'electron'

export type OpenPdfResult =
  | { canceled: true }
  | { canceled: false; filePath: string; data: ArrayBuffer }

export type SavePdfResult =
  | { canceled: true }
  | { canceled: false; filePath: string }

contextBridge.exposeInMainWorld('electronAPI', {
  openPDFFile: (): Promise<OpenPdfResult> => ipcRenderer.invoke('pdf:open'),
  savePDFBytes: (data: ArrayBuffer, defaultPath?: string): Promise<SavePdfResult> =>
    ipcRenderer.invoke('pdf:save', data, defaultPath),
})
