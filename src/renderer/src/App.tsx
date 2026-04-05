import { useEffect } from 'react'
import { useEditor } from './editor/EditorContext'
import { CanvasArea } from './components/CanvasArea'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { Toolbar } from './components/Toolbar'

function GlobalBindings() {
  const { bindGlobalKeys, bindShiftPenFinalize } = useEditor()
  useEffect(() => {
    const a = bindGlobalKeys()
    const b = bindShiftPenFinalize()
    return () => {
      a()
      b()
    }
  }, [bindGlobalKeys, bindShiftPenFinalize])
  return null
}

export function App() {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 sm:px-5">
      <GlobalBindings />
      <Toolbar />
      <div className="flex min-h-0 flex-1" id="app-body">
        <Sidebar />
        <CanvasArea />
      </div>
      <StatusBar />
    </div>
  )
}
