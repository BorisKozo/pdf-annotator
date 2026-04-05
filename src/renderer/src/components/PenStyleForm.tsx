import { useEditor } from '../editor/EditorContext'

export function PenStyleForm() {
  const { state, dispatch } = useEditor()
  const hidden = state.editorMode !== 'pen'

  const syncWidth = (raw: number) => {
    const v = Number.isFinite(raw) ? Math.min(48, Math.max(1, raw)) : 2
    dispatch({ type: 'SET_PEN_WIDTH', width: v })
  }

  return (
    <div
      className={`border-b border-[var(--border)] p-3.5 ${hidden ? 'hidden' : ''}`}
      id="section-pen-style"
    >
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">Pen</div>
      <div className="mb-2 flex items-center gap-2">
        <label className="w-10 shrink-0 text-xs text-[var(--muted)]" htmlFor="pen-width-num">
          Width
        </label>
        <input
          type="number"
          id="pen-width-num"
          min={1}
          max={48}
          step={1}
          className="h-[30px] min-w-0 flex-1 rounded-[5px] border border-[var(--border)] bg-[var(--bg)] px-2 text-xs text-[var(--text)] outline-none"
          value={state.penStrokeWidthPdf}
          onChange={(e) => syncWidth(parseInt(e.target.value, 10))}
        />
        <input
          type="range"
          id="pen-width-range"
          min={1}
          max={24}
          className="min-w-0 flex-1"
          value={Math.min(24, state.penStrokeWidthPdf)}
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
