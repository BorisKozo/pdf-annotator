import type { PenDrawPreview } from '../overlay'
import type { ActivePenStroke, ShiftPenCompose } from './penSession'

export function getActivePenPreviewForOverlay(
  activePenStroke: ActivePenStroke | null,
  shiftPenCompose: ShiftPenCompose | null,
): PenDrawPreview | null {
  if (activePenStroke) {
    const { page, points, strokeWidth, hex } = activePenStroke
    return { page, points, strokeWidth, hex }
  }
  if (shiftPenCompose) {
    return {
      page: shiftPenCompose.page,
      strokeWidth: shiftPenCompose.strokeWidth,
      hex: shiftPenCompose.hex,
      segments: shiftPenCompose.segments,
      current: shiftPenCompose.current,
    }
  }
  return null
}
