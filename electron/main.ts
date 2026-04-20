import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, unlink } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const AUTOSAVE_FILENAME = 'pdf-editor-autosave.json'
function autosavePath(): string {
  return path.join(app.getPath('temp'), AUTOSAVE_FILENAME)
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  }
}

ipcMain.handle(
  'pdf:open',
  async (
    event,
  ): Promise<
    { canceled: true } | { canceled: false; filePath: string; data: ArrayBuffer }
  > => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(parent ?? undefined, {
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || !filePaths[0]) return { canceled: true }
    const buf = await readFile(filePaths[0])
    const copy = new Uint8Array(buf.length)
    copy.set(buf)
    return { canceled: false, filePath: filePaths[0], data: copy.buffer as ArrayBuffer }
  },
)

ipcMain.handle(
  'pdf:openByPath',
  async (
    _event,
    filePath: string,
  ): Promise<
    { ok: true; filePath: string; data: ArrayBuffer } | { ok: false; error: string }
  > => {
    try {
      const buf = await readFile(filePath)
      const copy = new Uint8Array(buf.length)
      copy.set(buf)
      return { ok: true, filePath, data: copy.buffer as ArrayBuffer }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: msg }
    }
  },
)

ipcMain.handle(
  'pdf:save',
  async (
    event,
    data: ArrayBuffer,
    defaultPath?: string,
  ): Promise<{ canceled: true } | { canceled: false; filePath: string }> => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePath } = await dialog.showSaveDialog(parent ?? undefined, {
      defaultPath,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return { canceled: true }
    await writeFile(filePath, Buffer.from(new Uint8Array(data)))
    return { canceled: false, filePath }
  },
)

ipcMain.handle(
  'annotations:open',
  async (
    event,
  ): Promise<
    { canceled: true } | { canceled: false; filePath: string; text: string }
  > => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(parent ?? undefined, {
      properties: ['openFile'],
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (canceled || !filePaths[0]) return { canceled: true }
    const text = await readFile(filePaths[0], 'utf8')
    return { canceled: false, filePath: filePaths[0], text }
  },
)

ipcMain.handle(
  'annotations:save',
  async (
    event,
    jsonText: string,
    defaultPath?: string,
  ): Promise<{ canceled: true } | { canceled: false; filePath: string }> => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePath } = await dialog.showSaveDialog(parent ?? undefined, {
      defaultPath,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return { canceled: true }
    await writeFile(filePath, jsonText, 'utf8')
    return { canceled: false, filePath }
  },
)

ipcMain.handle('autosave:read', async (): Promise<{ text: string } | { text: null }> => {
  try {
    const text = await readFile(autosavePath(), 'utf8')
    return { text }
  } catch {
    return { text: null }
  }
})

ipcMain.handle('autosave:write', async (_event, jsonText: string): Promise<{ ok: boolean }> => {
  try {
    await writeFile(autosavePath(), jsonText, 'utf8')
    return { ok: true }
  } catch {
    return { ok: false }
  }
})

ipcMain.handle('autosave:delete', async (): Promise<{ ok: boolean }> => {
  try {
    await unlink(autosavePath())
  } catch {
    /* ignore: file may not exist */
  }
  return { ok: true }
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

let autosaveCleaned = false
app.on('before-quit', (e) => {
  if (autosaveCleaned) return
  e.preventDefault()
  autosaveCleaned = true
  unlink(autosavePath())
    .catch(() => {
      /* file may not exist */
    })
    .finally(() => {
      app.quit()
    })
})

app.on('window-all-closed', () => {
  app.quit()
})
