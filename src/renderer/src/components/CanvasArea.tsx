import { useEffect, useLayoutEffect, useRef } from 'react'
import { useEditor } from '../editor/EditorContext'

export function CanvasArea() {
  const {
    state,
    pdfCanvasRef,
    overlayCanvasRef,
    inlineInputRef,
    canvasStackRef,
    setZoom,
    onPdfFileSelected,
    onDropPdfFile,
    setDragTarget,
    bindCanvasListeners,
  } = useEditor()

  const areaRef = useRef<HTMLElement>(null)
  const scaleRef = useRef(state.scale)
  scaleRef.current = state.scale
  const cleanupCanvasRef = useRef<(() => void) | null>(null)

  useLayoutEffect(() => {
    cleanupCanvasRef.current?.()
    cleanupCanvasRef.current = bindCanvasListeners()
    return () => {
      cleanupCanvasRef.current?.()
      cleanupCanvasRef.current = null
    }
  }, [bindCanvasListeners])

  const { pdfDocumentLoaded, scale } = state
  const zoomPct = `${Math.round(scale * 100)}%`

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.08 : -0.08
      setZoom(scaleRef.current + delta)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setZoom])

  return (
    <main
      ref={areaRef}
      className="canvas-area relative flex-1 overflow-auto bg-[var(--bg)] p-7"
      id="canvas-area"
      onDragEnter={(e) => {
        e.preventDefault()
        setDragTarget(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragTarget(true)
      }}
      onDragLeave={() => setDragTarget(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragTarget(false)
        const f = e.dataTransfer?.files?.[0]
        if (f) onDropPdfFile(f)
      }}
    >
      <input
        type="file"
        id="pdf-file-input"
        accept=".pdf,application/pdf"
        hidden
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onPdfFileSelected(f)
        }}
      />
      <div
        className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-[var(--muted)] ${pdfDocumentLoaded ? 'hidden' : ''}`}
        id="drop-hint"
      >
        <div className="text-lg font-semibold text-[var(--text)]">Open a PDF</div>
        <div>
          Use <strong>Open PDF</strong> or drag a file here
        </div>
      </div>
      <div
        ref={canvasStackRef}
        className={`relative mx-auto shadow-[0_12px_40px_rgba(0,0,0,0.45)] ${pdfDocumentLoaded ? 'block' : 'hidden'}`}
        id="canvas-stack"
      >
        <canvas ref={pdfCanvasRef} id="pdf-canvas" className="block" />
        <canvas
          ref={overlayCanvasRef}
          id="overlay-canvas"
          className="absolute left-0 top-0 cursor-crosshair"
        />
        <input
          ref={inlineInputRef}
          type="text"
          id="inline-input"
          dir="auto"
          autoComplete="off"
          spellCheck
          className="absolute z-10 hidden min-w-[40px] max-w-[min(560px,90vw)] border-none px-1.5 py-0.5 outline-none"
        />
      </div>
      <div
        className="fixed bottom-[88px] right-6 z-20 flex flex-col gap-1"
        id="zoom-stack"
      >
        <button
          type="button"
          id="zoom-in"
          title="Zoom in"
          className="h-9 w-9 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface)] text-lg leading-none text-[var(--text)] hover:bg-[var(--panel)]"
          onClick={() => setZoom(scale + 0.15)}
        >
          +
        </button>
        <button
          type="button"
          id="zoom-out"
          title="Zoom out"
          className="h-9 w-9 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface)] text-lg leading-none text-[var(--text)] hover:bg-[var(--panel)]"
          onClick={() => setZoom(scale - 0.15)}
        >
          −
        </button>
        <button
          type="button"
          id="zoom-reset"
          title="100%"
          className="h-9 w-9 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text)] hover:bg-[var(--panel)]"
          onClick={() => setZoom(1)}
        >
          1:1
        </button>
        <div className="text-center text-[11px] text-[var(--muted)]" id="zoom-pct">
          {zoomPct}
        </div>
      </div>
    </main>
  )
}
