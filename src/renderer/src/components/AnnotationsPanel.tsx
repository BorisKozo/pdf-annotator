import { annotationsSortedLikeList } from '../lib/annotationSort'
import { escapeAttr, escapeHtml } from '../lib/htmlEscape'
import { useEditor } from '../editor/EditorContext'
import { isTextAnnotation } from '../types'

export function AnnotationsPanel() {
  const { state, selectAnnotationById, deleteAnnotationById } = useEditor()
  const { annotations, selectedId } = state
  const sorted = annotationsSortedLikeList(annotations)

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-2.5" id="annotations-panel">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        Annotations (<span id="ann-count">{annotations.length}</span>)
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto" id="annotations-list">
        {annotations.length === 0 ? (
          <div className="p-2.5 text-center text-xs text-[var(--muted)]">No annotations yet</div>
        ) : (
          sorted.map((ann) => {
            const label = isTextAnnotation(ann)
              ? `${ann.bold === true ? '<span style="opacity:.85">B</span> ' : ''}p${ann.page}: Text · ${escapeHtml(ann.text)}`
              : `p${ann.page}: Pen · ${ann.segments.length} line(s) · ${ann.segments.reduce((n, s) => n + s.length, 0)} pts`
            const title = isTextAnnotation(ann)
              ? `Text: ${escapeAttr(ann.text)}`
              : `Pen (${ann.segments.length} line(s))`
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
                onClick={(ev) => {
                  if ((ev.target as HTMLElement).closest('.ann-del')) return
                  void selectAnnotationById(ann.id)
                }}
                onKeyDown={(ev) => {
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
                <span
                  className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                  title={title}
                  dangerouslySetInnerHTML={{ __html: label }}
                />
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
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
