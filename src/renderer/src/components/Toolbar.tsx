import { useEditor } from '../editor/EditorContext'

export function Toolbar() {
  const { state, openPdfFlow, savePdfFlow, changePage } = useEditor()
  const { totalPages, currentPage, pdfSourceBytes } = state
  const pageLabel = totalPages > 0 ? `${currentPage} / ${totalPages}` : '—'
  const navDisabled = totalPages === 0

  return (
    <header
      className="flex h-[var(--toolbar-h)] shrink-0 items-center gap-2.5 border-b border-[var(--border)] bg-[var(--surface)] px-3.5"
      id="toolbar"
    >
      <span className="mr-3 text-sm font-bold uppercase tracking-widest text-[var(--accent)]">
        Annotator
      </span>
      <button
        type="button"
        className="btn-primary inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--accent)] bg-[var(--accent)] px-3 text-xs font-semibold text-[#0b1020] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-35"
        id="btn-open"
        onClick={() => void openPdfFlow()}
      >
        Open PDF
      </button>
      <button
        type="button"
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 text-xs text-[var(--text)] hover:border-[rgba(255,255,255,0.15)] disabled:cursor-not-allowed disabled:opacity-35"
        id="btn-save"
        disabled={pdfSourceBytes === null}
        onClick={() => void savePdfFlow()}
      >
        Save PDF
      </button>
      <span className="mx-1 h-[22px] w-px bg-[var(--border)]" />
      <div className="ml-auto flex items-center gap-2" id="page-nav">
        <button
          type="button"
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 text-xs text-[var(--text)] hover:border-[rgba(255,255,255,0.15)] disabled:cursor-not-allowed disabled:opacity-35"
          id="btn-prev"
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
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 text-xs text-[var(--text)] hover:border-[rgba(255,255,255,0.15)] disabled:cursor-not-allowed disabled:opacity-35"
          id="btn-next"
          disabled={navDisabled || currentPage >= totalPages}
          onClick={() => void changePage(1)}
        >
          →
        </button>
      </div>
    </header>
  )
}
