import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { initDB } from './db'
import { projectRepository } from './database/repositories'
import { registerProjectHandlers } from './handlers/projectHandlers'
import { registerMeetingHandlers } from './handlers/meetingHandlers'
import { registerTaskHandlers } from './handlers/taskHandlers'
import { registerQueryHandlers } from './handlers/queryHandlers'
import { registerGitHandlers } from './handlers/gitHandlers'
import { registerDocumentHandlers } from './handlers/documentHandlers'
import { registerSettingsHandlers } from './handlers/settingsHandlers'

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
    win.loadURL('http://localhost:5174')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 기본 프로젝트가 없으면 자동 생성합니다.
 * 나중에 프로젝트 선택 UI를 추가하면 이 로직을 교체합니다.
 */
function ensureDefaultProject(): void {
  const projects = projectRepository.getAll()
  if (projects.length === 0) {
    projectRepository.create({
      name: '기본 프로젝트',
      description: '자동 생성된 기본 프로젝트입니다.',
      status: 'active'
    })
    console.log('[App] 기본 프로젝트 자동 생성 완료')
  }
}

app.whenReady().then(async () => {
  // DB 초기화
  await initDB()

  // 기본 프로젝트 보장
  ensureDefaultProject()

  // IPC 핸들러 등록
  registerProjectHandlers(ipcMain)
  registerMeetingHandlers(ipcMain)
  registerTaskHandlers(ipcMain)
  registerQueryHandlers(ipcMain)
  registerGitHandlers(ipcMain)
  registerDocumentHandlers(ipcMain)
  registerSettingsHandlers(ipcMain)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
