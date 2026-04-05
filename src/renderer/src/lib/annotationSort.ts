import type { Annotation } from '../types'

/** Same order as the sidebar list: page ascending, then id ascending. */
export function annotationsSortedLikeList(list: Annotation[]): Annotation[] {
  return [...list].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page
    return a.id - b.id
  })
}
