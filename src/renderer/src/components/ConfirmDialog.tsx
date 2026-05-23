import { useEffect, useRef } from 'react'

export type ConfirmResult = 'yes' | 'no' | 'cancel'

export function ConfirmDialog(props: {
  open: boolean
  title: string
  message: string
  yesLabel?: string
  noLabel?: string
  onResolve: (result: ConfirmResult) => void
}) {
  const { open, title, message, yesLabel = 'Yes', noLabel = 'No', onResolve } = props
  const yesRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    yesRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onResolve('cancel')
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onResolve('yes')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onResolve])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="relative w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
        <button
          type="button"
          aria-label="Close"
          title="Close"
          className="absolute right-2 top-2 h-7 w-7 cursor-pointer rounded-md border border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:text-[var(--text)]"
          onClick={() => onResolve('cancel')}
        >
          ×
        </button>
        <h2
          id="confirm-title"
          className="mb-2 pr-6 text-sm font-semibold text-[var(--text)]"
        >
          {title}
        </h2>
        <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel)] px-4 text-xs text-[var(--text)] hover:border-[rgba(255,255,255,0.15)]"
            onClick={() => onResolve('no')}
          >
            {noLabel}
          </button>
          <button
            ref={yesRef}
            type="button"
            className="btn-primary inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--accent)] px-4 text-xs font-semibold text-[#0b1020] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]"
            onClick={() => onResolve('yes')}
          >
            {yesLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
