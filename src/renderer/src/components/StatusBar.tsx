import { useEditor } from '../editor/EditorContext'

export function StatusBar() {
  const { state } = useEditor()
  return (
    <footer
      className="flex h-[26px] shrink-0 items-center gap-4 border-t border-[var(--border)] bg-[var(--panel)] px-3.5 text-[11px] text-[var(--muted)]"
      id="status"
    >
      <span>
        File: <strong className="font-medium text-[var(--text)]" id="st-file">{state.statusFileLabel}</strong>
      </span>
      <span>
        Coords (PDF):{' '}
        <strong className="font-medium text-[var(--text)]" id="st-coords">
          {state.coordsLabel}
        </strong>
      </span>
    </footer>
  )
}
