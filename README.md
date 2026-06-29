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
