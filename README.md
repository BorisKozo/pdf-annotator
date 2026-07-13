# PDF Annotator

A lightweight desktop app for marking up PDFs — type text directly onto a page, draw with a pen, highlight, and export a flattened, annotated PDF. Built with Electron, React, and TypeScript.

## Features

- **Text annotations** — click anywhere on a page to type text directly onto it. Double-click an existing text annotation to edit it inline.
- **Pen & highlight tools** — freehand drawing with adjustable stroke width; highlight strokes render with reduced opacity.
- **Font support** — choose font, size, bold, and color per annotation, including Hebrew (Noto Sans Hebrew) with correct RTL/bidi text handling.
- **Selection & editing** — select, move, restyle, rename, or delete any annotation from the canvas or the annotations panel.
- **Favorites** — save a styled annotation as a reusable template and stamp it onto the page wherever you click next.
- **Export** — flattens all annotations into a new PDF using `pdf-lib`, preserving the original document.
- **Save/load annotations as JSON** — annotations can be exported to a sidecar `.json` file and re-imported later, independent of the exported PDF.
- **Autosave** — in-progress work is periodically persisted so you don't lose annotations between sessions.
- **Undo/redo** — every annotation edit (create, move, resize, restyle, delete, rename, paste) can be undone and redone.

## User guide

### Annotation tools

- **Text** — click anywhere on the page to drop an inline text box; type, then press **Enter** or click elsewhere to commit (**Escape** cancels). Double-click an existing text annotation to edit its content. Per-annotation style: font (including Hebrew — Noto Sans Hebrew — with correct RTL/bidi handling), size, letter spacing, bold, and color. Picking a non-Hebrew font (Helvetica/Times/Courier) for text that contains Hebrew shows a warning, since those fonts can't render it in the exported PDF.
- **Pen** — click-drag to draw a freehand stroke with adjustable width and color.
- **Highlight** — same as Pen, but strokes render at reduced opacity; a circular brush-size cursor preview follows the pointer while this tool is active.
- **Favorites** — click the ★ on any annotation in the sidebar list to save it as a reusable template; arm it from the Favorites panel and click anywhere on the page to stamp a copy there, centered on the click.

### Selecting & editing

Click an annotation (on the canvas or in the sidebar list) to select it — its style controls populate the sidebar so you can restyle, rename, or delete it. Switching tools (Text/Pen/Highlight/Favorites) always deselects whatever was selected, so a tool's style controls never accidentally edit an annotation of a different kind.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Z` | Undo the last edit |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo |
| `Ctrl+C` / `Ctrl+X` | Copy / cut the selected annotation |
| `Ctrl+V` | Paste at the last pointer position on the page |
| `Delete` | Delete the selected annotation |
| `Escape` | Deselect, cancel an inline edit/rename, close the File menu, or blur a focused slider |
| `Enter` | Commit the text you're typing into a text annotation |
| `Arrow keys` | Move the selected annotation by 10pt |
| `Shift` + `Arrow keys` | Move the selected annotation by 1pt (fine nudge) |
| `Ctrl` + `Up`/`Down` *(text selected)* | Increase/decrease font size by 1pt |
| `Ctrl` + `Left`/`Right` *(text selected)* | Decrease/increase letter spacing by 1pt |
| `Ctrl` + `Up`/`Right` *(pen/highlight selected)* | Scale the stroke up 10%, about its center |
| `Ctrl` + `Down`/`Left` *(pen/highlight selected)* | Scale the stroke down 10%, about its center |
| `Shift` *(held while drawing Pen/Highlight)* | Chain multiple separate strokes into one annotation; release `Shift` to finalize it |
| `Ctrl` *(held while dragging a Pen/Highlight stroke)* | Lock the stroke to a straight horizontal or vertical line |
| `Ctrl`/`Cmd` + mouse wheel *(over the page)* | Zoom in/out |

Arrow keys always control the selected annotation — even while a Size/Spacing/Width slider has keyboard focus, arrow keys never nudge the slider itself.

### Mouse operations

- **Click** an empty area of the page in Text mode — place a new text annotation there.
- **Click** an existing annotation — select it.
- **Double-click** an existing text annotation — edit its text inline.
- **Click** the empty background outside the page — deselect.
- **Right-click** an annotation — select it; if several annotations overlap under the cursor, right-click again to cycle through them in order.
- **Right-click** empty space — deselect.
- **Click-drag** in Pen/Highlight mode — draw a stroke.
- **Drag and drop** a PDF file onto the window — open it.
- **Color swatches** / the native color-wheel picker — set the ink color of the selected annotation, or the color used for the next annotation you draw if nothing is selected.
- **Zoom +/− buttons and the 1:1 button** — adjust page zoom (or use `Ctrl`/`Cmd` + scroll wheel).

## Tech stack

- [Electron](https://www.electronjs.org/) — desktop shell
- [React 19](https://react.dev/) + TypeScript — UI
- [Vite](https://vitejs.dev/) / [electron-vite](https://electron-vite.org/) — build tooling
- [Tailwind CSS](https://tailwindcss.com/) — styling
- [pdf.js](https://mozilla.github.io/pdf.js/) — PDF rendering for the canvas
- [pdf-lib](https://pdf-lib.js.org/) + [fontkit](https://github.com/Hopding/fontkit) — PDF generation/export with custom font embedding

## Getting started

```bash
npm install
npm run dev
```

This launches the Electron app in development mode with hot reload.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run the app in development mode |
| `npm run build` | Type-check and build the app for production |
| `npm run preview` | Preview the production build |
| `npm run package` | Build and package a portable Windows executable via `electron-builder` |

## Releases

Every push of a `v*.*.*` tag triggers [`.github/workflows/release.yml`](.github/workflows/release.yml), which builds the portable Windows `.exe` and publishes it as a GitHub Release with the file attached — no manual upload needed.

To cut a release:

```bash
npm version patch   # or: minor / major
git push --follow-tags
```

`npm version` bumps `package.json`, commits it, and creates a matching `vX.Y.Z` tag; `--follow-tags` pushes both the commit and the tag, which kicks off the workflow. Watch progress under the repo's **Actions** tab; once it finishes, the build appears under **Releases**.

You can also trigger a one-off build without a release via the **Actions** tab → *Release* workflow → *Run workflow* (it still uploads the `.exe` as a workflow artifact, but only publishes a Release when run from a tag).

## Project structure

```
electron/               Electron main process & preload script
src/renderer/src/
  components/            UI components (toolbar, sidebar, canvas, panels, dialogs)
  editor/                Editor state (reducer) and React context driving the app
  lib/                   Annotation (de)serialization, clipboard, color, storage helpers
  overlay.ts             Canvas overlay rendering & hit-testing for annotations
  exportPdf.ts           Flattens annotations into an exported PDF via pdf-lib
  pdfSession.ts          pdf.js document loading/rendering
  fonts.ts               Font catalog (CSS + PDF standard font mapping)
  bidi.ts                RTL/bidi text direction handling
tests/                   Sample PDFs and annotation fixtures used for manual/dev testing
```

## Usage

1. Open a PDF from the toolbar.
2. Pick a tool — **Text**, **Pen**, or **Highlight** — from the mode toggle.
3. In text mode, click on the page to start typing; double-click existing text to edit it.
4. In pen/highlight mode, drag to draw; adjust stroke width and color from the sidebar.
5. Select any annotation to restyle, rename, or delete it, or save it as a favorite for reuse.
6. Export the annotated PDF, or save annotations to JSON to continue editing later.
