import { useEditor } from '../editor/EditorContext'

export function PenStyleForm() {
  const { state, dispatch } = useEditor()
  const hidden = state.editorMode !== 'pen' && state.editorMode !== 'highlight'
  const isHighlight = state.editorMode === 'highlight'
  const heading = isHighlight ? 'Highlight' : 'Pen'
  const min = isHighlight ? 5 : 1
  const max = isHighlight ? 35 : 48
  const rangeMax = isHighlight ? 35 : 24
  const fallback = isHighlight ? 5 : 2
  const width = isHighlight ? state.highlightStrokeWidthPdf : state.penStrokeWidthPdf
  const actionType = isHighlight ? 'SET_HIGHLIGHT_WIDTH' : 'SET_PEN_WIDTH'

  const syncWidth = (raw: number) => {
    const v = Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : fallback
    dispatch({ type: actionType, width: v } as never)
  }

  return (
    <div
      className={`border-b border-[var(--border)] px-4 py-3.5 ${hidden ? 'hidden' : ''}`}
      id="section-pen-style"
    >
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">{heading}</div>
      <div className="mb-2 flex items-center gap-2">
        <label className="w-10 shrink-0 text-xs text-[var(--muted)]" htmlFor="pen-width-num">
          Width
        </label>
        <input
          type="number"
          id="pen-width-num"
          min={min}
          max={max}
          step={1}
          className="h-[30px] min-w-0 flex-1 rounded-[5px] border border-[var(--border)] bg-[var(--bg)] px-2 text-xs text-[var(--text)] outline-none"
          value={width}
          onChange={(e) => syncWidth(parseInt(e.target.value, 10))}
        />
        <input
          type="range"
          id="pen-width-range"
          min={min}
          max={rangeMax}
          className="min-w-0 flex-1"
          value={Math.min(rangeMax, width)}
          onInput={(e) => syncWidth(parseInt((e.target as HTMLInputElement).value, 10))}
        />
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted)]">
        Line color uses <strong className="font-medium text-[var(--text)]">Color</strong> below. Hold{' '}
        <strong className="font-medium text-[var(--text)]">Shift</strong> to chain several strokes into one
        annotation; release Shift to save.
      </p>
    </div>
  )
}
