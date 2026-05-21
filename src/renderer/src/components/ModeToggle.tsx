import type { ReactNode } from 'react'
import { useEditor } from '../editor/EditorContext'
import type { EditorMode } from '../editor/editorState'

type ModeDef = {
  id: EditorMode
  label: string
  tooltip: string
  icon: ReactNode
}

// Icons sourced from Lucide (https://lucide.dev, ISC license) and inlined as SVG paths.
const MODES: ModeDef[] = [
  {
    id: 'text',
    label: 'Text',
    tooltip: 'Text — click on the page to add a text annotation',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 7 4 4 20 4 20 7" />
        <line x1="9" y1="20" x2="15" y2="20" />
        <line x1="12" y1="4" x2="12" y2="20" />
      </svg>
    ),
  },
  {
    id: 'pen',
    label: 'Pen',
    tooltip: 'Pen — draw freehand strokes (hold Shift to chain strokes)',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="2" />
      </svg>
    ),
  },
  {
    id: 'highlight',
    label: 'Highlight',
    tooltip: 'Highlight — mark text with a translucent stroke',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l-4 4v4h4l4-4" />
        <path d="M13 7l4-4 4 4-4 4z" />
        <path d="M9 11l4 4 8-8-4-4z" />
        <line x1="3" y1="22" x2="21" y2="22" />
      </svg>
    ),
  },
]

export function ModeToggle() {
  const { state, setEditorMode } = useEditor()

  return (
    <div className="border-b border-[var(--border)] px-4 py-3.5" id="section-mode">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        Mode
      </div>
      <div className="flex gap-2" role="toolbar" aria-label="Editor mode">
        {MODES.map((m) => {
          const active = state.editorMode === m.id
          return (
            <button
              key={m.id}
              type="button"
              id={`mode-${m.id}`}
              title={m.tooltip}
              aria-label={m.label}
              aria-pressed={active}
              className={
                'inline-flex h-8 flex-1 cursor-pointer items-center justify-center rounded-md border hover:border-[rgba(255,255,255,0.15)] ' +
                (active
                  ? 'border-[var(--accent)] bg-[rgba(91,140,255,0.18)] text-[var(--accent-hover)]'
                  : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text)]')
              }
              onClick={() => setEditorMode(m.id)}
            >
              {m.icon}
            </button>
          )
        })}
      </div>
    </div>
  )
}
