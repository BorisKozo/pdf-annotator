import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorProvider } from './editor/EditorContext'
import { App } from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EditorProvider>
      <App />
    </EditorProvider>
  </StrictMode>,
)
