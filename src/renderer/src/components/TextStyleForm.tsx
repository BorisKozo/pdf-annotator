import { FONT_CATALOG } from '../fonts'
import { useEditor } from '../editor/EditorContext'

export function TextStyleForm() {
  const { state, dispatch, toggleBold } = useEditor()
  const hidden = state.editorMode !== 'text'

  const syncSize = (raw: number) => {
    const v = Number.isFinite(raw) ? Math.min(200, Math.max(6, raw)) : 14
    dispatch({ type: 'SET_STYLE_FONT_SIZE', size: v })
  }

  return (
    <div
      className={`border-b border-[var(--border)] p-3.5 ${hidden ? 'hidden' : ''}`}
      id="section-text-style"
    >
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        Text style
      </div>
      <div className="mb-2 flex items-center gap-2">
        <label className="w-10 shrink-0 text-xs text-[var(--muted)]" htmlFor="font-select">
          Font
        </label>
        <select
          id="font-select"
          className="h-[30px] min-w-0 flex-1 rounded-[5px] border border-[var(--border)] bg-[var(--bg)] px-2 text-xs text-[var(--text)] outline-none"
          value={state.styleFontId}
          onChange={(e) => dispatch({ type: 'SET_STYLE_FONT', fontId: e.target.value })}
        >
          {FONT_CATALOG.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <label className="w-10 shrink-0 text-xs text-[var(--muted)]" htmlFor="font-size-num">
          Size
        </label>
        <input
          type="number"
          id="font-size-num"
          min={6}
          max={200}
          className="h-[30px] w-[52px] shrink-0 flex-none rounded-[5px] border border-[var(--border)] bg-[var(--bg)] px-2 text-center text-xs text-[var(--text)] outline-none"
          value={state.styleFontSize}
          onChange={(e) => syncSize(parseInt(e.target.value, 10))}
        />
        <input
          type="range"
          id="font-size-range"
          min={6}
          max={72}
          className="min-w-0 flex-1"
          value={Math.min(72, state.styleFontSize)}
          onInput={(e) => syncSize(parseInt((e.target as HTMLInputElement).value, 10))}
        />
      </div>
      <div className="mb-2 flex items-center gap-2">
        <label className="w-10 shrink-0 text-xs text-[var(--muted)]" htmlFor="btn-bold">
          Weight
        </label>
        <button
          type="button"
          id="btn-bold"
          title="Bold (700)"
          aria-pressed={state.currentBold}
          className={
            'inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 text-xs hover:border-[rgba(255,255,255,0.15)] ' +
            (state.currentBold
              ? 'border-[var(--accent)] bg-[rgba(91,140,255,0.18)] font-bold text-[var(--accent-hover)]'
              : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text)]')
          }
          onClick={() => toggleBold()}
        >
          Bold
        </button>
      </div>
    </div>
  )
}
