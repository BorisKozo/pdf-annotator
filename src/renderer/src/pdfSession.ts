import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

let documentProxy: pdfjsLib.PDFDocumentProxy | null = null

export async function openPdfFromBuffer(data: ArrayBuffer): Promise<number> {
  void documentProxy?.destroy()
  documentProxy = null
  const copy = new Uint8Array(data.byteLength)
  copy.set(new Uint8Array(data))
  const task = pdfjsLib.getDocument({ data: copy })
  documentProxy = await task.promise
  return documentProxy.numPages
}

export function getPdfJsDocument(): pdfjsLib.PDFDocumentProxy | null {
  return documentProxy
}

export function closePdf(): void {
  void documentProxy?.destroy()
  documentProxy = null
}

export async function renderPdfPage(
  pageOneBased: number,
  scale: number,
  pdfCanvas: HTMLCanvasElement,
): Promise<{ width: number; height: number }> {
  if (!documentProxy) throw new Error('No PDF loaded')
  const page = await documentProxy.getPage(pageOneBased)
  const viewport = page.getViewport({ scale })
  pdfCanvas.width = viewport.width
  pdfCanvas.height = viewport.height
  const ctx = pdfCanvas.getContext('2d')
  if (!ctx) throw new Error('No 2D context')
  const renderTask = page.render({ canvasContext: ctx, viewport })
  await renderTask.promise
  return { width: viewport.width, height: viewport.height }
}
