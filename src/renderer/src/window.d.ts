export {}

declare global {
  interface Window {
    /** Present when the app runs inside Electron with preload. */
    electronAPI?: {
      openPDFFile: () => Promise<
        { canceled: true } | { canceled: false; filePath: string; data: ArrayBuffer }
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
    }
  }
}
