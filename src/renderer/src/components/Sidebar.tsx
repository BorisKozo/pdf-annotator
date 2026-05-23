import { useEditor } from '../editor/EditorContext'
import { AnnotationsPanel } from './AnnotationsPanel'
import { ColorPalette } from './ColorPalette'
import { FavoritesPanel } from './FavoritesPanel'
import { ModeToggle } from './ModeToggle'
import { PenStyleForm } from './PenStyleForm'
import { TextStyleForm } from './TextStyleForm'

export function Sidebar() {
  const { state } = useEditor()
  const showFavorites = state.editorMode === 'favorites'

  return (
    <aside
      className="flex w-[var(--sidebar-w)] shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--surface)]"
      id="sidebar"
    >
      <ModeToggle />
      <TextStyleForm />
      <PenStyleForm />
      {!showFavorites && <ColorPalette />}
      {showFavorites && <FavoritesPanel />}
      <AnnotationsPanel />
    </aside>
  )
}
