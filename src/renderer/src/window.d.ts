export {}

declare global {
  interface Window {
    /** Present when the app runs inside Electron with preload. */
    electronAPI?: {
      openPDFFile: () => Promise<
        { canceled: true } | { canceled: false; filePath: string; data: ArrayBuffer }
      >
      openPDFByPath: (
        filePath: string,
      ) => Promise<
        { ok: true; filePath: string; data: ArrayBuffer } | { ok: false; error: string }
      >
      savePDFBytes: (
        data: ArrayBuffer,
        defaultPath?: string,
      ) => Promise<{ canceled: true } | { canceled: false; filePath: string }>
      savePDFBytesToPath: (
        data: ArrayBuffer,
        filePath: string,
      ) => Promise<{ ok: true } | { ok: false; error: string }>
      openAnnotationsFile: () => Promise<
        { canceled: true } | { canceled: false; filePath: string; text: string }
      >
      saveAnnotationsJson: (
        jsonText: string,
        defaultPath?: string,
      ) => Promise<{ canceled: true } | { canceled: false; filePath: string }>
      saveAnnotationsJsonToPath: (
        jsonText: string,
        filePath: string,
      ) => Promise<{ ok: true } | { ok: false; error: string }>
      readAutosave: () => Promise<{ text: string | null }>
      writeAutosave: (jsonText: string) => Promise<{ ok: boolean }>
      deleteAutosave: () => Promise<{ ok: boolean }>
      readUiPrefs: () => Promise<{ text: string | null }>
      writeUiPrefs: (jsonText: string) => Promise<{ ok: boolean }>
      readFavorites: () => Promise<{ text: string | null }>
      writeFavorites: (jsonText: string) => Promise<{ ok: boolean }>
      getPathForFile: (file: File) => string
    }
  }
}
