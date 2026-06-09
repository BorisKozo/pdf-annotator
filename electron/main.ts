import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises'

// Register before app.whenReady() — must happen at module load time.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const AUTOSAVE_FILENAME = 'pdf-editor-autosave.json'
function autosavePath(): string {
  return path.join(app.getPath('temp'), AUTOSAVE_FILENAME)
}

const UI_PREFS_FILENAME = 'ui-prefs.json'
function uiPrefsPath(): string {
  return path.join(app.getPath('userData'), UI_PREFS_FILENAME)
}

const FAVORITES_FILENAME = 'favorites.json'
function favoritesPath(): string {
  return path.join(app.getPath('userData'), FAVORITES_FILENAME)
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
    void mainWindow.loadURL('app://bundled/index.html')
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
  'pdf:saveToPath',
  async (
    _event,
    data: ArrayBuffer,
    filePath: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      await writeFile(filePath, Buffer.from(new Uint8Array(data)))
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: msg }
    }
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

ipcMain.handle(
  'annotations:saveToPath',
  async (
    _event,
    jsonText: string,
    filePath: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      await writeFile(filePath, jsonText, 'utf8')
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: msg }
    }
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

ipcMain.handle('uiPrefs:read', async (): Promise<{ text: string | null }> => {
  try {
    const text = await readFile(uiPrefsPath(), 'utf8')
    return { text }
  } catch {
    return { text: null }
  }
})

ipcMain.handle('uiPrefs:write', async (_event, jsonText: string): Promise<{ ok: boolean }> => {
  try {
    const p = uiPrefsPath()
    await mkdir(path.dirname(p), { recursive: true })
    await writeFile(p, jsonText, 'utf8')
    return { ok: true }
  } catch {
    return { ok: false }
  }
})

ipcMain.handle('favorites:read', async (): Promise<{ text: string | null }> => {
  try {
    const text = await readFile(favoritesPath(), 'utf8')
    return { text }
  } catch {
    return { text: null }
  }
})

ipcMain.handle('favorites:write', async (_event, jsonText: string): Promise<{ ok: boolean }> => {
  try {
    const p = favoritesPath()
    await mkdir(path.dirname(p), { recursive: true })
    await writeFile(p, jsonText, 'utf8')
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

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
}

app.whenReady().then(() => {
  // Serve bundled renderer files via app:// so that fetch('/assets/...')
  // and fetch('/fonts/...') work correctly in the packaged app.
  // net.fetch() uses Chromium's stack and doesn't understand asar paths —
  // use fs.readFile (patched by Electron) to read from the asar instead.
  protocol.handle('app', async (req) => {
    const { pathname } = new URL(req.url)
    const rel = pathname.startsWith('/') ? pathname.slice(1) : pathname
    const filePath = path.join(__dirname, '..', 'renderer', rel)
    try {
      const data = await readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mime = MIME[ext] ?? 'application/octet-stream'
      return new Response(data, { headers: { 'content-type': mime } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

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
