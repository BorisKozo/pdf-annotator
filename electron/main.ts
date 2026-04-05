import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
