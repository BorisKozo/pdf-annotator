import { useEffect, useRef, useState } from 'react'
import { annotationsSortedLikeList } from '../lib/annotationSort'
import { escapeAttr, escapeHtml } from '../lib/htmlEscape'
import { useEditor } from '../editor/EditorContext'
import { isTextAnnotation, type Annotation } from '../types'

/** Plain-text default name used to seed the rename input. Mirrors the row label,
 *  minus the `pX:` page prefix (the renderer adds that back when displaying). */
function defaultEditableName(ann: Annotation): string {
  if (isTextAnnotation(ann)) return `Text · ${ann.text}`
  const kind = ann.opacity !== undefined && ann.opacity < 1 ? 'Highlight' : 'Pen'
  return `${kind} · ${ann.segments.length} line(s)`
}

export function AnnotationsPanel() {
  const { state, dispatch, selectAnnotationById, deleteAnnotationById, setHoveredAnnotationId } = useEditor()
  const { annotations, selectedId } = state
  const sorted = annotationsSortedLikeList(annotations)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [glowingIds, setGlowingIds] = useState<Set<number>>(() => new Set())

  const flashFavoriteGlow = (id: number) => {
    setGlowingIds((s) => {
      const next = new Set(s)
      next.add(id)
      return next
    })
    window.setTimeout(() => {
      setGlowingIds((s) => {
        if (!s.has(id)) return s
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }, 1000)
  }

  useEffect(() => {
    if (editingId !== null) {
      const el = inputRef.current
      if (!el) return
      el.focus()
      // setSelectionRange is more reliable than .select() right after focus.
      el.setSelectionRange(0, el.value.length)
    }
  }, [editingId])

  const startEdit = (ann: Annotation) => {
    setEditingId(ann.id)
    setEditingText(ann.name && ann.name.length > 0 ? ann.name : defaultEditableName(ann))
  }

  const commitEdit = () => {
    if (editingId === null) return
    dispatch({ type: 'RENAME_ANNOTATION', id: editingId, name: editingText })
    setEditingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-2.5" id="annotations-panel">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        Annotations (<span id="ann-count">{annotations.length}</span>)
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto" id="annotations-list" onMouseLeave={() => setHoveredAnnotationId(null)}>
        {annotations.length === 0 ? (
          <div className="p-2.5 text-center text-xs text-[var(--muted)]">No annotations yet</div>
        ) : (
          sorted.map((ann) => {
            const penKindLabel =
              !isTextAnnotation(ann) && ann.opacity !== undefined && ann.opacity < 1
                ? 'Highlight'
                : 'Pen'
            const defaultLabel = isTextAnnotation(ann)
              ? `${ann.bold === true ? '<span style="opacity:.85">B</span> ' : ''}p${ann.page}: Text · ${escapeHtml(ann.text)}`
              : `p${ann.page}: ${penKindLabel} · ${ann.segments.length} line(s) · ${ann.segments.reduce((n, s) => n + s.length, 0)} pts`
            const label = ann.name ? `p${ann.page}: ${escapeHtml(ann.name)}` : defaultLabel
            const title = ann.name
              ? `${ann.name}`
              : isTextAnnotation(ann)
                ? `Text: ${escapeAttr(ann.text)}`
                : `${penKindLabel} (${ann.segments.length} line(s))`
            const isEditing = editingId === ann.id
            return (
              <div
                key={ann.id}
                role="button"
                tabIndex={0}
                className={
                  'group ann-row mb-0 flex cursor-pointer items-center gap-2 rounded-md border border-transparent p-2 text-xs hover:border-[var(--border)] hover:bg-[rgba(255,255,255,0.04)] ' +
                  (ann.id === selectedId
                    ? 'border-[var(--accent)] bg-[rgba(91,140,255,0.12)]'
                    : '')
                }
                onMouseEnter={() => setHoveredAnnotationId(ann.id)}
                onClick={(ev) => {
                  if (
                    (ev.target as HTMLElement).closest(
                      '.ann-del, .ann-edit, .ann-fav, .ann-name-input',
                    )
                  )
                    return
                  if (isEditing) return
                  void selectAnnotationById(ann.id)
                }}
                onKeyDown={(ev) => {
                  if (isEditing) return
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    void selectAnnotationById(ann.id)
                  }
                }}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: ann.hex }}
                />
                {isEditing ? (
                  <input
                    ref={inputRef}
                    type="text"
                    className="ann-name-input min-w-0 flex-1 rounded-[3px] border border-[var(--accent)] bg-[var(--bg)] px-1 py-0.5 text-xs text-[var(--text)] outline-none"
                    value={editingText}
                    onChange={(ev) => setEditingText(ev.target.value)}
                    onClick={(ev) => ev.stopPropagation()}
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
                    title={title}
                    dangerouslySetInnerHTML={{ __html: label }}
                  />
                )}
                {!isEditing && (
                  <button
                    type="button"
                    className="ann-edit cursor-pointer border-none bg-transparent px-1.5 py-0.5 text-[var(--muted)] opacity-0 hover:text-[var(--accent-hover)] group-hover:opacity-100"
                    title="Rename"
                    aria-label="Rename annotation"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      startEdit(ann)
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                    </svg>
                  </button>
                )}
                {!isEditing && (() => {
                  const glowing = glowingIds.has(ann.id)
                  return (
                    <button
                      type="button"
                      className={
                        'ann-fav cursor-pointer border-none bg-transparent px-1.5 py-0.5 transition-all duration-700 ease-out hover:text-[#fbbf24] ' +
                        (glowing
                          ? 'text-[#fbbf24] opacity-100 [filter:drop-shadow(0_0_6px_#fbbf24)]'
                          : 'text-[var(--muted)] opacity-0 group-hover:opacity-100')
                      }
                      title="Add to favorites"
                      aria-label="Add to favorites"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        dispatch({ type: 'ADD_FAVORITE', ann })
                        flashFavoriteGlow(ann.id)
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill={glowing ? '#fbbf24' : 'none'}
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polygon points="12 2 15 8.5 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 9 8.5 12 2" />
                      </svg>
                    </button>
                  )
                })()}
                {!isEditing && (
                  <button
                    type="button"
                    className="ann-del cursor-pointer border-none bg-transparent px-1.5 py-0.5 text-[var(--muted)] opacity-0 hover:text-[#f87171] group-hover:opacity-100"
                    data-id={ann.id}
                    title="Delete"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      deleteAnnotationById(ann.id)
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
