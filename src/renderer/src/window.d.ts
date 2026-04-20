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
      openAnnotationsFile: () => Promise<
        { canceled: true } | { canceled: false; filePath: string; text: string }
      >
      saveAnnotationsJson: (
        jsonText: string,
        defaultPath?: string,
      ) => Promise<{ canceled: true } | { canceled: false; filePath: string }>
      readAutosave: () => Promise<{ text: string | null }>
      writeAutosave: (jsonText: string) => Promise<{ ok: boolean }>
      deleteAutosave: () => Promise<{ ok: boolean }>
      getPathForFile: (file: File) => string
    }
  }
}
