import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { initDB } from './db'
import { registerProjectHandlers } from './handlers/projectHandlers'
import { registerMeetingHandlers } from './handlers/meetingHandlers'
import { registerTaskHandlers } from './handlers/taskHandlers'
import { registerQueryHandlers } from './handlers/queryHandlers'

const isDev = process.env.NODE_ENV === 'development'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // DB 초기화
  await initDB()

  // IPC 핸들러 등록
  registerProjectHandlers(ipcMain)
  registerMeetingHandlers(ipcMain)
  registerTaskHandlers(ipcMain)
  registerQueryHandlers(ipcMain)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
