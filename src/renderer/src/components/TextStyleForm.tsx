import { FONT_CATALOG, fontSupportsHebrew, getFontEntry } from '../fonts'
import { getTextDirection } from '../bidi'
import { useEditor } from '../editor/EditorContext'

const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

export function TextStyleForm() {
  const { state, dispatch, toggleBold, nudgeSelectedAnnotation } = useEditor()
  const hidden = state.editorMode !== 'text'

  /** Arrow keys must never nudge a slider's own value — forward them to move the
   *  selected annotation instead, matching what arrow keys do everywhere else. */
  const handleSliderArrowKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!ARROW_KEYS.has(e.key)) return
    e.preventDefault()
    nudgeSelectedAnnotation(e.key, e.shiftKey, e.ctrlKey || e.metaKey)
  }

  const handleFontChange = (fontId: string) => {
    dispatch({ type: 'SET_STYLE_FONT', fontId })
    const target = state.annotations.find((a) => a.id === state.selectedId)
    if (
      target &&
      target.kind === 'text' &&
      getTextDirection(target.text) === 'rtl' &&
      !fontSupportsHebrew(fontId)
    ) {
      window.alert(
        `"${getFontEntry(fontId).label}" does not support Hebrew — this text will not render correctly in the exported PDF. Switch to "Noto Sans Hebrew".`,
      )
    }
  }

  const syncSize = (raw: number) => {
    const v = Number.isFinite(raw) ? Math.min(200, Math.max(6, raw)) : 14
    dispatch({ type: 'SET_STYLE_FONT_SIZE', size: v })
  }

  const syncSpacing = (raw: number) => {
    const v = Number.isFinite(raw) ? Math.max(0, raw) : 0
    dispatch({ type: 'SET_STYLE_LETTER_SPACING', spacing: v })
  }

  return (
    <div
      className={`border-b border-[var(--border)] px-4 py-3.5 ${hidden ? 'hidden' : ''}`}
      id="section-text-style"
      onKeyDown={(e) => {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
      }}
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
          onChange={(e) => handleFontChange(e.target.value)}
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
          className="min-w-0 flex-1 outline-none"
          value={Math.min(72, state.styleFontSize)}
          onInput={(e) => syncSize(parseInt((e.target as HTMLInputElement).value, 10))}
          onKeyDown={handleSliderArrowKey}
        />
      </div>
      <div className="mb-2 flex items-center gap-2">
        <label className="w-10 shrink-0 text-xs text-[var(--muted)]" htmlFor="letter-spacing-num">
          Spacing
        </label>
        <input
          type="number"
          id="letter-spacing-num"
          min={0}
          max={100}
          step={1}
          className="h-[30px] w-[52px] shrink-0 flex-none rounded-[5px] border border-[var(--border)] bg-[var(--bg)] px-2 text-center text-xs text-[var(--text)] outline-none"
          value={state.styleLetterSpacing}
          onChange={(e) => syncSpacing(parseFloat(e.target.value))}
        />
        <input
          type="range"
          id="letter-spacing-range"
          min={0}
          max={50}
          step={1}
          className="min-w-0 flex-1 outline-none"
          value={Math.min(50, state.styleLetterSpacing)}
          onInput={(e) => syncSpacing(parseFloat((e.target as HTMLInputElement).value))}
          onKeyDown={handleSliderArrowKey}
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
            'inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-4 text-xs hover:border-[rgba(255,255,255,0.15)] ' +
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
