import type { Annotation, Favorite } from '../types'
import { FONT_CATALOG } from '../fonts'
import { inkColorFromHex, type InkColor, PALETTE } from '../lib/color'

export type EditorMode = 'text' | 'pen' | 'highlight' | 'favorites'

export function isDrawingMode(mode: EditorMode): boolean {
  return mode === 'pen' || mode === 'highlight'
}

export type EditorState = {
  pdfSourceBytes: ArrayBuffer | null
  sourceFilePath: string | null
  currentPage: number
  totalPages: number
  scale: number
  annotations: Annotation[]
  selectedId: number | null
  nextAnnId: number
  currentColor: InkColor
  currentBold: boolean
  editorMode: EditorMode
  penStrokeWidthPdf: number
  highlightStrokeWidthPdf: number
  /** Font/size for new text and for the sidebar when a text annotation is selected. */
  styleFontId: string
  styleFontSize: number
  statusFileLabel: string
  statusAnnotationsLabel: string
  coordsLabel: string
  pdfDocumentLoaded: boolean
  /** Epoch ms of the last successful autosave in this session, or null. */
  lastAutosaveAt: number | null
  /** Persistent favorite annotation templates. */
  favorites: Favorite[]
  nextFavoriteId: number
  /** When set, the next click on the document inserts this favorite centered there. */
  pendingFavoritePasteId: number | null
}

export const initialEditorState: EditorState = {
  pdfSourceBytes: null,
  sourceFilePath: null,
  currentPage: 1,
  totalPages: 0,
  scale: 1,
  annotations: [],
  selectedId: null,
  nextAnnId: 1,
  currentColor: inkColorFromHex(PALETTE[0]!),
  currentBold: false,
  editorMode: 'text',
  penStrokeWidthPdf: 2,
  highlightStrokeWidthPdf: 5,
  styleFontId: FONT_CATALOG[0]!.id,
  styleFontSize: 14,
  statusFileLabel: '—',
  statusAnnotationsLabel: '—',
  coordsLabel: '—',
  pdfDocumentLoaded: false,
  lastAutosaveAt: null,
  favorites: [],
  nextFavoriteId: 1,
  pendingFavoritePasteId: null,
}

export type EditorAction =
  | {
      type: 'PDF_OPENED'
      buffer: ArrayBuffer
      pathOrName: string
      totalPages: number
    }
  | { type: 'SET_STATUS_FILE'; label: string }
  | { type: 'SET_STATUS_ANNOTATIONS'; label: string }
  | { type: 'SET_COORDS'; label: string }
  /** Toolbar prev/next: clears selection. */
  | { type: 'SET_PAGE_NAV'; page: number }
  /** Jump to page while keeping (or setting) selection — e.g. picking an annotation. */
  | { type: 'SET_PAGE_AND_SELECT'; page: number; selectedId: number }
  | { type: 'SET_ZOOM'; scale: number }
  | { type: 'SET_MODE'; mode: EditorMode }
  | { type: 'SYNC_COLOR_UI'; color: InkColor }
  | { type: 'APPLY_COLOR_TO_SELECTED_TEXT'; color: InkColor }
  | { type: 'SET_BOLD'; bold: boolean }
  | { type: 'TOGGLE_BOLD_TO_SELECTION' }
  | { type: 'SET_PEN_WIDTH'; width: number }
  | { type: 'SET_HIGHLIGHT_WIDTH'; width: number }
  | {
      type: 'LOAD_TEXT_STYLE_FROM_ANN'
      fontId: string
      size: number
      bold: boolean
      color: InkColor
    }
  | { type: 'SET_STYLE_FONT'; fontId: string }
  | { type: 'SET_STYLE_FONT_SIZE'; size: number }
  | { type: 'SYNC_FROM_PEN_ANN'; color: InkColor; strokeWidth: number }
  | { type: 'SELECT_ID'; id: number | null }
  | { type: 'DELETE_ANNOTATION'; id: number }
  | { type: 'RENAME_ANNOTATION'; id: number; name: string }
  | { type: 'ADD_ANNOTATION'; ann: Annotation }
  | { type: 'REPLACE_ANNOTATIONS'; annotations: Annotation[] }
  /** Remap ids inside reducer; does not link to a specific PDF. */
  | { type: 'IMPORT_ANNOTATIONS'; imported: Annotation[]; mode: 'replace' | 'append' }
  | { type: 'UPDATE_SELECTED_TEXT_STYLE'; fontId: string; size: number }
  | { type: 'UPDATE_SELECTED_TEXT_BOLD' }
  | { type: 'PATCH_ANNOTATIONS'; updater: (list: Annotation[]) => Annotation[] }
  | { type: 'UPDATE_ANNOTATION_TEXT'; id: number; text: string }
  | { type: 'SET_LAST_AUTOSAVE'; at: number }
  | { type: 'LOAD_FAVORITES'; favorites: Favorite[] }
  | { type: 'ADD_FAVORITE'; ann: Annotation }
  | { type: 'RENAME_FAVORITE'; id: number; name: string }
  | { type: 'DELETE_FAVORITE'; id: number }
  | { type: 'ARM_FAVORITE_PASTE'; id: number }
  | { type: 'CLEAR_FAVORITE_PASTE' }
  | {
      type: 'APPLY_UI_PREFS'
      editorMode?: EditorMode
      styleFontId?: string
      styleFontSize?: number
      currentBold?: boolean
      penStrokeWidthPdf?: number
      highlightStrokeWidthPdf?: number
      currentColor?: InkColor
    }
  | { type: 'PDF_CLOSED' }

function baseName(pathOrName: string): string {
  return pathOrName.replace(/\\/g, '/').split('/').pop() ?? 'document.pdf'
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'PDF_OPENED': {
      const buf = action.buffer.slice(0)
      return {
        ...initialEditorState,
        pdfSourceBytes: buf,
        sourceFilePath: action.pathOrName,
        totalPages: action.totalPages,
        currentPage: 1,
        pdfDocumentLoaded: true,
        statusFileLabel: baseName(action.pathOrName),
        statusAnnotationsLabel: '—',
        editorMode: state.editorMode,
        styleFontId: state.styleFontId,
        styleFontSize: state.styleFontSize,
        currentBold: state.currentBold,
        currentColor: state.currentColor,
        penStrokeWidthPdf: state.penStrokeWidthPdf,
        highlightStrokeWidthPdf: state.highlightStrokeWidthPdf,
        favorites: state.favorites,
        nextFavoriteId: state.nextFavoriteId,
      }
    }
    case 'SET_STATUS_FILE':
      return { ...state, statusFileLabel: action.label }
    case 'SET_STATUS_ANNOTATIONS':
      return { ...state, statusAnnotationsLabel: action.label }
    case 'SET_COORDS':
      return { ...state, coordsLabel: action.label }
    case 'SET_PAGE_NAV':
      return { ...state, currentPage: action.page, selectedId: null }
    case 'SET_PAGE_AND_SELECT':
      return { ...state, currentPage: action.page, selectedId: action.selectedId }
    case 'SET_ZOOM':
      return { ...state, scale: action.scale, selectedId: null }
    case 'SET_MODE':
      return { ...state, editorMode: action.mode }
    case 'SYNC_COLOR_UI':
      return { ...state, currentColor: action.color }
    case 'APPLY_COLOR_TO_SELECTED_TEXT': {
      if (state.selectedId === null) return { ...state, currentColor: action.color }
      const ann = state.annotations.find((a) => a.id === state.selectedId)
      if (!ann || ann.kind !== 'text') return { ...state, currentColor: action.color }
      const { r, g, b, hex } = action.color
      return {
        ...state,
        currentColor: action.color,
        annotations: state.annotations.map((a) =>
          a.id === state.selectedId && a.kind === 'text' ? { ...a, r, g, b, hex } : a,
        ),
      }
    }
    case 'SET_BOLD':
      return { ...state, currentBold: action.bold }
    case 'TOGGLE_BOLD_TO_SELECTION': {
      const nextBold = !state.currentBold
      if (state.selectedId === null) return { ...state, currentBold: nextBold }
      const ann = state.annotations.find((a) => a.id === state.selectedId)
      if (!ann || ann.kind !== 'text') return { ...state, currentBold: nextBold }
      return {
        ...state,
        currentBold: nextBold,
        annotations: state.annotations.map((a) =>
          a.id === state.selectedId && a.kind === 'text' ? { ...a, bold: nextBold } : a,
        ),
      }
    }
    case 'SET_PEN_WIDTH':
      return { ...state, penStrokeWidthPdf: action.width }
    case 'SET_HIGHLIGHT_WIDTH':
      return { ...state, highlightStrokeWidthPdf: action.width }
    case 'LOAD_TEXT_STYLE_FROM_ANN':
      return {
        ...state,
        styleFontId: action.fontId,
        styleFontSize: action.size,
        currentBold: action.bold,
        currentColor: action.color,
      }
    case 'SET_STYLE_FONT': {
      const next = { ...state, styleFontId: action.fontId }
      if (state.selectedId === null) return next
      const target = state.annotations.find((a) => a.id === state.selectedId)
      if (!target || target.kind !== 'text') return next
      return {
        ...next,
        annotations: state.annotations.map((a) =>
          a.id === state.selectedId && a.kind === 'text' ? { ...a, fontId: action.fontId } : a,
        ),
      }
    }
    case 'SET_STYLE_FONT_SIZE': {
      const v = Math.min(200, Math.max(6, action.size))
      const next = { ...state, styleFontSize: v }
      if (state.selectedId === null) return next
      const target = state.annotations.find((a) => a.id === state.selectedId)
      if (!target || target.kind !== 'text') return next
      return {
        ...next,
        annotations: state.annotations.map((a) =>
          a.id === state.selectedId && a.kind === 'text' ? { ...a, size: v } : a,
        ),
      }
    }
    case 'SYNC_FROM_PEN_ANN':
      return {
        ...state,
        currentColor: action.color,
        penStrokeWidthPdf: action.strokeWidth,
      }
    case 'SELECT_ID':
      return { ...state, selectedId: action.id }
    case 'DELETE_ANNOTATION': {
      const sortedBefore = [...state.annotations].sort((a, b) => {
        if (a.page !== b.page) return a.page - b.page
        return a.id - b.id
      })
      const idx = sortedBefore.findIndex((a) => a.id === action.id)
      if (idx === -1) return state
      const wasSelected = state.selectedId === action.id
      let selectAfter: number | null = null
      if (wasSelected && idx > 0) selectAfter = sortedBefore[idx - 1]!.id

      const annotations = state.annotations.filter((a) => a.id !== action.id)

      if (wasSelected) {
        if (selectAfter === null && annotations.length > 0) {
          const sorted = [...annotations].sort((a, b) => {
            if (a.page !== b.page) return a.page - b.page
            return a.id - b.id
          })
          selectAfter = sorted[0]!.id
        }
        return { ...state, annotations, selectedId: selectAfter }
      }
      return { ...state, annotations }
    }
    case 'RENAME_ANNOTATION': {
      const trimmed = action.name.trim()
      const name = trimmed.length > 0 ? trimmed : undefined
      return {
        ...state,
        annotations: state.annotations.map((a) => (a.id === action.id ? { ...a, name } : a)),
      }
    }
    case 'ADD_ANNOTATION':
      return {
        ...state,
        annotations: [...state.annotations, action.ann],
        selectedId: action.ann.id,
        nextAnnId: state.nextAnnId + 1,
      }
    case 'REPLACE_ANNOTATIONS':
      return { ...state, annotations: action.annotations }
    case 'IMPORT_ANNOTATIONS': {
      const { imported, mode } = action
      const startId = mode === 'replace' ? 1 : state.nextAnnId
      const remapped: Annotation[] = imported.map((a, i) => {
        const id = startId + i
        if (a.kind === 'text') return { ...a, id }
        return {
          ...a,
          id,
          segments: a.segments.map((seg) => seg.map((p) => ({ x: p.x, y: p.y }))),
        }
      })
      const annotations = mode === 'replace' ? remapped : [...state.annotations, ...remapped]
      const nextAnnId = startId + remapped.length
      return { ...state, annotations, nextAnnId, selectedId: null }
    }
    case 'UPDATE_SELECTED_TEXT_STYLE': {
      const v = Math.min(200, Math.max(6, action.size))
      const next = {
        ...state,
        styleFontId: action.fontId,
        styleFontSize: v,
      }
      if (state.selectedId === null) return next
      const target = state.annotations.find((a) => a.id === state.selectedId)
      if (!target || target.kind !== 'text') return next
      return {
        ...next,
        annotations: state.annotations.map((a) =>
          a.id === state.selectedId && a.kind === 'text'
            ? { ...a, fontId: action.fontId, size: v }
            : a,
        ),
      }
    }
    case 'UPDATE_SELECTED_TEXT_BOLD': {
      if (state.selectedId === null) return state
      const target = state.annotations.find((a) => a.id === state.selectedId)
      if (!target || target.kind !== 'text') return state
      return {
        ...state,
        annotations: state.annotations.map((a) =>
          a.id === state.selectedId && a.kind === 'text'
            ? { ...a, bold: state.currentBold }
            : a,
        ),
      }
    }
    case 'PATCH_ANNOTATIONS':
      return { ...state, annotations: action.updater(state.annotations) }
    case 'UPDATE_ANNOTATION_TEXT':
      return {
        ...state,
        annotations: state.annotations.map((a) =>
          a.id === action.id && a.kind === 'text' ? { ...a, text: action.text } : a,
        ),
      }
    case 'SET_LAST_AUTOSAVE':
      return { ...state, lastAutosaveAt: action.at }
    case 'LOAD_FAVORITES': {
      const maxId = action.favorites.reduce((m, f) => Math.max(m, f.id), 0)
      return { ...state, favorites: action.favorites, nextFavoriteId: maxId + 1 }
    }
    case 'ADD_FAVORITE': {
      // Strip id/page so the template doesn't carry stale identity.
      const template: Annotation =
        action.ann.kind === 'text'
          ? { ...action.ann, id: 0, page: 1 }
          : { ...action.ann, id: 0, page: 1 }
      const fav: Favorite = { id: state.nextFavoriteId, ann: template }
      return {
        ...state,
        favorites: [...state.favorites, fav],
        nextFavoriteId: state.nextFavoriteId + 1,
      }
    }
    case 'RENAME_FAVORITE': {
      const trimmed = action.name.trim()
      const name = trimmed.length > 0 ? trimmed : undefined
      return {
        ...state,
        favorites: state.favorites.map((f) => (f.id === action.id ? { ...f, name } : f)),
      }
    }
    case 'DELETE_FAVORITE': {
      const next = state.favorites.filter((f) => f.id !== action.id)
      const pending =
        state.pendingFavoritePasteId === action.id ? null : state.pendingFavoritePasteId
      return { ...state, favorites: next, pendingFavoritePasteId: pending }
    }
    case 'ARM_FAVORITE_PASTE':
      return { ...state, pendingFavoritePasteId: action.id }
    case 'CLEAR_FAVORITE_PASTE':
      return { ...state, pendingFavoritePasteId: null }
    case 'APPLY_UI_PREFS': {
      const next = { ...state }
      if (action.editorMode !== undefined) next.editorMode = action.editorMode
      if (action.styleFontId !== undefined) next.styleFontId = action.styleFontId
      if (action.styleFontSize !== undefined) next.styleFontSize = action.styleFontSize
      if (action.currentBold !== undefined) next.currentBold = action.currentBold
      if (action.penStrokeWidthPdf !== undefined)
        next.penStrokeWidthPdf = action.penStrokeWidthPdf
      if (action.highlightStrokeWidthPdf !== undefined)
        next.highlightStrokeWidthPdf = action.highlightStrokeWidthPdf
      if (action.currentColor !== undefined) next.currentColor = action.currentColor
      return next
    }
    case 'PDF_CLOSED':
      return {
        ...initialEditorState,
        editorMode: state.editorMode,
        styleFontId: state.styleFontId,
        styleFontSize: state.styleFontSize,
        currentBold: state.currentBold,
        currentColor: state.currentColor,
        penStrokeWidthPdf: state.penStrokeWidthPdf,
        highlightStrokeWidthPdf: state.highlightStrokeWidthPdf,
        favorites: state.favorites,
        nextFavoriteId: state.nextFavoriteId,
      }
    default:
      return state
  }
}
