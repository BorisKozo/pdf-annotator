import { useEffect, useRef, useState } from 'react'
import { escapeHtml } from '../lib/htmlEscape'
import { useEditor } from '../editor/EditorContext'
import { isTextAnnotation } from '../types'

export function FavoritesPanel() {
  const { state, dispatch } = useEditor()
  const { favorites, pendingFavoritePasteId } = state

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId !== null) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingId])

  const startEdit = (id: number, currentName: string) => {
    setEditingId(id)
    setEditingText(currentName)
  }

  const commitEdit = () => {
    if (editingId === null) return
    dispatch({ type: 'RENAME_FAVORITE', id: editingId, name: editingText })
    setEditingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-2.5" id="favorites-panel">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        Favorites (<span>{favorites.length}</span>)
      </div>
      {pendingFavoritePasteId !== null && (
        <div className="mb-2 rounded-md border border-[var(--accent)] bg-[rgba(91,140,255,0.12)] p-2 text-[11px] text-[var(--text)]">
          Click on the document to place this annotation.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => dispatch({ type: 'CLEAR_FAVORITE_PASTE' })}
          >
            Cancel
          </button>
        </div>
      )}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {favorites.length === 0 ? (
          <div className="p-2.5 text-center text-xs text-[var(--muted)]">
            No favorites yet. Click the star on any annotation to add it here.
          </div>
        ) : (
          favorites.map((fav) => {
            const ann = fav.ann
            const defaultLabel = isTextAnnotation(ann)
              ? `Text · ${escapeHtml(ann.text)}`
              : `Pen · ${ann.segments.length} line(s)`
            const label = fav.name ? escapeHtml(fav.name) : defaultLabel
            const armed = pendingFavoritePasteId === fav.id
            const isEditing = editingId === fav.id
            return (
              <div
                key={fav.id}
                className={
                  'group mb-0 flex items-center gap-2 rounded-md border border-transparent p-2 text-xs hover:border-[var(--border)] hover:bg-[rgba(255,255,255,0.04)] ' +
                  (armed ? 'border-[var(--accent)] bg-[rgba(91,140,255,0.12)]' : '')
                }
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: ann.hex }}
                />
                {isEditing ? (
                  <input
                    ref={inputRef}
                    type="text"
                    className="min-w-0 flex-1 rounded-[3px] border border-[var(--accent)] bg-[var(--bg)] px-1 py-0.5 text-xs text-[var(--text)] outline-none"
                    value={editingText}
                    onChange={(ev) => setEditingText(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter') {
                        ev.preventDefault()
                        commitEdit()
                      } else if (ev.key === 'Escape') {
                        ev.preventDefault()
                        cancelEdit()
                      }
                    }}
                    onBlur={commitEdit}
                  />
                ) : (
                  <span
                    className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                    title={label}
                    dangerouslySetInnerHTML={{ __html: label }}
                  />
                )}
                {!isEditing && (
                  <>
                    <button
                      type="button"
                      className="cursor-pointer border-none bg-transparent px-1.5 py-0.5 text-[var(--muted)] opacity-0 hover:text-[var(--accent-hover)] group-hover:opacity-100"
                      title="Add — then click on the document to place"
                      aria-label="Add to document"
                      onClick={() => dispatch({ type: 'ARM_FAVORITE_PASTE', id: fav.id })}
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer border-none bg-transparent px-1.5 py-0.5 text-[var(--muted)] opacity-0 hover:text-[var(--accent-hover)] group-hover:opacity-100"
                      title="Rename"
                      aria-label="Rename favorite"
                      onClick={() => startEdit(fav.id, fav.name ?? '')}
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer border-none bg-transparent px-1.5 py-0.5 text-[var(--muted)] opacity-0 hover:text-[#f87171] group-hover:opacity-100"
                      title="Delete from favorites"
                      aria-label="Delete favorite"
                      onClick={() => dispatch({ type: 'DELETE_FAVORITE', id: fav.id })}
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
