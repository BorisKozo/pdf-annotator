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
  async (): Promise<
    { canceled: true } | { canceled: false; filePath: string; data: ArrayBuffer }
  > => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
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
    _e,
    data: ArrayBuffer,
    defaultPath?: string,
  ): Promise<{ canceled: true } | { canceled: false; filePath: string }> => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return { canceled: true }
    await writeFile(filePath, Buffer.from(new Uint8Array(data)))
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
