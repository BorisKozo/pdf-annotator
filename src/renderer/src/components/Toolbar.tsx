import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../editor/EditorContext'

function FileMenu({
  onOpenPdf,
  onSavePdf,
  onClosePdf,
  onOpenAnnotations,
  onSaveAnnotations,
  pdfLoaded,
}: {
  onOpenPdf: () => void
  onSavePdf: () => void
  onClosePdf: () => void
  onOpenAnnotations: () => void
  onSaveAnnotations: () => void
  pdfLoaded: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const run = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  const itemCls =
    'flex w-full cursor-pointer items-center px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[rgba(255,255,255,0.06)] disabled:cursor-not-allowed disabled:opacity-35'
  const sectionLabelCls =
    'px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]'

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={`inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-4 text-xs ${
          open
            ? 'border-[var(--accent)] bg-[rgba(255,255,255,0.06)] text-[var(--text)]'
            : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text)] hover:border-[rgba(255,255,255,0.15)]'
        }`}
        id="btn-file-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        File
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+4px)] z-20 min-w-[200px] rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
        >
          <div className={sectionLabelCls}>PDF</div>
          <button type="button" role="menuitem" className={itemCls} onClick={() => run(onOpenPdf)}>
            Open PDF…
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            disabled={!pdfLoaded}
            onClick={() => run(onSavePdf)}
          >
            Save PDF…
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            disabled={!pdfLoaded}
            onClick={() => run(onClosePdf)}
          >
            Close PDF
          </button>
          <div className="my-1 h-px bg-[var(--border)]" />
          <div className={sectionLabelCls}>Annotations</div>
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            onClick={() => run(onOpenAnnotations)}
          >
            Open Annotations…
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            disabled={!pdfLoaded}
            onClick={() => run(onSaveAnnotations)}
          >
            Save Annotations…
          </button>
        </div>
      )}
    </div>
  )
}

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
  const {
    state,
    openPdfFlow,
    savePdfFlow,
    saveAnnotationsFlow,
    openAnnotationsFlow,
    closePdfFlow,
    changePage,
  } = useEditor()
  const { totalPages, currentPage, pdfSourceBytes, lastAutosaveAt } = state
  const pageLabel = totalPages > 0 ? `${currentPage} / ${totalPages}` : '—'
  const navDisabled = totalPages === 0

  return (
    <header
      className="relative flex h-[var(--toolbar-h)] shrink-0 items-stretch border-b border-[var(--border)] bg-[var(--surface)]"
      id="toolbar"
    >
      <div className="flex w-[var(--sidebar-w)] shrink-0 items-center gap-2.5 px-3 sm:px-4">
        <span className="mr-3 text-sm font-bold uppercase tracking-widest text-[var(--accent)]">
          Annotator
        </span>
        <FileMenu
          onOpenPdf={() => void openPdfFlow()}
          onSavePdf={() => void savePdfFlow()}
          onClosePdf={() => void closePdfFlow()}
          onOpenAnnotations={() => void openAnnotationsFlow()}
          onSaveAnnotations={() => void saveAnnotationsFlow()}
          pdfLoaded={pdfSourceBytes !== null}
        />
      </div>
      <div className="relative flex min-w-0 flex-1 items-center">
        <div
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2"
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
      </div>
      <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center pr-2">
        <AutosaveIndicator at={lastAutosaveAt} />
      </div>
    </header>
  )
}
