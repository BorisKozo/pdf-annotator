import { AnnotationsPanel } from './AnnotationsPanel'
import { ColorPalette } from './ColorPalette'
import { ModeToggle } from './ModeToggle'
import { PenStyleForm } from './PenStyleForm'
import { TextStyleForm } from './TextStyleForm'

export function Sidebar() {
  return (
    <aside
      className="flex w-[var(--sidebar-w)] shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--surface)]"
      id="sidebar"
    >
      <ModeToggle />
      <TextStyleForm />
      <PenStyleForm />
      <ColorPalette />
      <AnnotationsPanel />
    </aside>
  )
}
