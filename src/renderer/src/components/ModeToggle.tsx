import { useEditor } from '../editor/EditorContext'

export function ModeToggle() {
  const { state, setEditorMode } = useEditor()
  const text = state.editorMode === 'text'

  return (
    <div className="border-b border-[var(--border)] p-3.5" id="section-mode">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        Mode
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          id="mode-text"
          title="Add text annotations"
          className={
            'inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 text-xs hover:border-[rgba(255,255,255,0.15)] ' +
            (text
              ? 'border-[var(--accent)] bg-[rgba(91,140,255,0.18)] font-bold text-[var(--accent-hover)]'
              : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text)]')
          }
          onClick={() => setEditorMode('text')}
        >
          Text
        </button>
        <button
          type="button"
          id="mode-pen"
          title="Draw with the pen"
          className={
            'inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 text-xs hover:border-[rgba(255,255,255,0.15)] ' +
            (!text
              ? 'border-[var(--accent)] bg-[rgba(91,140,255,0.18)] font-bold text-[var(--accent-hover)]'
              : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text)]')
          }
          onClick={() => setEditorMode('pen')}
        >
          Pen
        </button>
      </div>
    </div>
  )
}
