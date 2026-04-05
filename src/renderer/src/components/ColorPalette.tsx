import { PALETTE } from '../lib/color'
import { useEditor } from '../editor/EditorContext'

export function ColorPalette() {
  const { state, applyColor } = useEditor()
  const hex = state.currentColor.hex

  return (
    <div className="border-b border-[var(--border)] px-4 py-3.5">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">Color</div>
      <div className="flex flex-wrap gap-1.5" id="palette">
        {PALETTE.map((c) => {
          const selected = hex.toLowerCase() === c.toLowerCase()
          return (
            <button
              key={c}
              type="button"
              title={c}
              data-hex={c}
              className={
                'h-[22px] w-[22px] cursor-pointer rounded border-2 ' +
                (selected ? 'border-[var(--text)]' : 'border-transparent')
              }
              style={{
                background: c,
                ...(!selected && (c === '#f8fafc' || c === '#000000')
                  ? { borderColor: 'rgba(255,255,255,0.25)' }
                  : {}),
              }}
              onClick={() => applyColor(c)}
            />
          )
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="color"
          id="color-picker"
          className="h-8 w-8 cursor-pointer border-none bg-transparent p-0"
          value={hex}
          onInput={(e) => applyColor((e.target as HTMLInputElement).value)}
        />
        <span
          id="hex-label"
          className="font-mono text-xs"
          style={{ fontFamily: 'ui-monospace, monospace' }}
        >
          {hex.toUpperCase()}
        </span>
      </div>
    </div>
  )
}
