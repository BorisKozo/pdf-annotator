export {}

declare global {
  interface Window {
    electronAPI: {
      openPDFFile: () => Promise<
        { canceled: true } | { canceled: false; filePath: string; data: ArrayBuffer }
      >
      savePDFBytes: (
        data: ArrayBuffer,
        defaultPath?: string,
      ) => Promise<{ canceled: true } | { canceled: false; filePath: string }>
    }
  }
}
