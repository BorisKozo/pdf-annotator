import type { PenDrawPreview } from '../overlay'
import type { ActivePenStroke, ShiftPenCompose } from './penSession'

export function getActivePenPreviewForOverlay(
  activePenStroke: ActivePenStroke | null,
  shiftPenCompose: ShiftPenCompose | null,
): PenDrawPreview | null {
  if (activePenStroke) {
    const { page, points, strokeWidth, hex, opacity } = activePenStroke
    return { page, points, strokeWidth, hex, opacity }
  }
  if (shiftPenCompose) {
    return {
      page: shiftPenCompose.page,
      strokeWidth: shiftPenCompose.strokeWidth,
      hex: shiftPenCompose.hex,
      opacity: shiftPenCompose.opacity,
      segments: shiftPenCompose.segments,
      current: shiftPenCompose.current,
    }
  }
  return null
}
