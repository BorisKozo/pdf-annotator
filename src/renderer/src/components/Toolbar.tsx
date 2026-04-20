import { useEffect, useState } from 'react'
import { useEditor } from '../editor/EditorContext'

function formatRelative(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return `${h}h ago`
}

function AutosaveIndicator({ at }: { at: number | null }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (at === null) return
    const id = window.setInterval(() => tick((n) => n + 1), 15_000)
    return () => window.clearInterval(id)
  }, [at])

  const title =
    at === null
      ? 'Autosave: no save yet this session'
      : `Autosaved ${formatRelative(Date.now() - at)} (${new Date(at).toLocaleTimeString()})`
  const active = at !== null

  return (
    <span
      className={`ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel)] ${active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}
      title={title}
      aria-label={title}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
    </span>
  )
}

export function Toolbar() {
  const { state, openPdfFlow, savePdfFlow, saveAnnotationsFlow, openAnnotationsFlow, changePage } =
    useEditor()
  const { totalPages, currentPage, pdfSourceBytes, lastAutosaveAt } = state
  const pageLabel = totalPages > 0 ? `${currentPage} / ${totalPages}` : '—'
  const navDisabled = totalPages === 0

  return (
    <header
      className="flex h-[var(--toolbar-h)] shrink-0 items-center gap-2.5 border-b border-[var(--border)] bg-[var(--surface)] px-3 sm:px-4"
      id="toolbar"
    >
      <span className="mr-3 text-sm font-bold uppercase tracking-widest text-[var(--accent)]">
        Annotator
      </span>
      <button
        type="button"
        className="btn-primary inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--accent)] bg-[var(--accent)] px-4 text-xs font-semibold text-[#0b1020] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-35"
        id="btn-open"
        onClick={() => void openPdfFlow()}
      >
        Open PDF
      </button>
      <button
        type="button"
        className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-4 text-xs text-[var(--text)] hover:border-[rgba(255,255,255,0.15)] disabled:cursor-not-allowed disabled:opacity-35"
        id="btn-save"
        disabled={pdfSourceBytes === null}
        onClick={() => void savePdfFlow()}
      >
        Save PDF
      </button>
      <button
        type="button"
        className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-4 text-xs text-[var(--text)] hover:border-[rgba(255,255,255,0.15)] disabled:cursor-not-allowed disabled:opacity-35"
        id="btn-open-annotations"
        disabled={pdfSourceBytes === null}
        title="Load annotations from a JSON file (PDF must be open)"
        onClick={() => void openAnnotationsFlow()}
      >
        Open Annotations
      </button>
      <button
        type="button"
        className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-4 text-xs text-[var(--text)] hover:border-[rgba(255,255,255,0.15)] disabled:cursor-not-allowed disabled:opacity-35"
        id="btn-save-annotations"
        disabled={pdfSourceBytes === null}
        title="Save current annotations to a JSON file"
        onClick={() => void saveAnnotationsFlow()}
      >
        Save Annotations
      </button>
      <span className="mx-1 h-[22px] w-px bg-[var(--border)]" />
      <div
        className="ml-auto flex items-center gap-2"
        id="page-nav"
        title={
          totalPages <= 0
            ? 'Open a PDF to use page navigation'
            : totalPages === 1
              ? 'This document has only one page'
              : `Page ${currentPage} of ${totalPages}`
        }
      >
        <button
          type="button"
          className="inline-flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 text-xs text-[var(--text)] hover:border-[rgba(255,255,255,0.15)] disabled:cursor-not-allowed disabled:opacity-35"
          id="btn-prev"
          aria-label="Previous page"
          title="Previous page"
          disabled={navDisabled || currentPage <= 1}
          onClick={() => void changePage(-1)}
        >
          ←
        </button>
        <span className="min-w-[72px] text-center text-xs text-[var(--muted)]" id="page-info">
          {pageLabel}
        </span>
        <button
          type="button"
          className="inline-flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 text-xs text-[var(--text)] hover:border-[rgba(255,255,255,0.15)] disabled:cursor-not-allowed disabled:opacity-35"
          id="btn-next"
          aria-label="Next page"
          title="Next page"
          disabled={navDisabled || currentPage >= totalPages}
          onClick={() => void changePage(1)}
        >
          →
        </button>
      </div>
      <AutosaveIndicator at={lastAutosaveAt} />
    </header>
  )
}
