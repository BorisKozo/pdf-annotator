import type { PdfPoint } from '../types'

export function canvasPointFromClient(
  overlay: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  scale: number,
): PdfPoint {
  const rect = overlay.getBoundingClientRect()
  const px = clientX - rect.left
  const py = clientY - rect.top
  return {
    x: px / scale,
    y: (overlay.height - py) / scale,
  }
}
