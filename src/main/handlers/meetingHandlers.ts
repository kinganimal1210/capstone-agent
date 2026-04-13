import { IpcMain } from 'electron'
import { meetingRepository } from '../database/repositories'

export function registerMeetingHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('meetings:getByProject', (_event, projectId: number) => {
    return meetingRepository.getByProject(projectId)
  })

  ipcMain.handle('meetings:getById', (_event, id: number) => {
    return meetingRepository.getById(id)
  })

  ipcMain.handle(
    'meetings:create',
    (_event, data: { projectId: number; title: string; content: string; date: string }) => {
      return meetingRepository.create(data)
    }
  )

  ipcMain.handle(
    'meetings:update',
    (_event, id: number, data: { title?: string; content?: string; date?: string; summary?: string }) => {
      return meetingRepository.update(id, data)
    }
  )

  ipcMain.handle('meetings:delete', (_event, id: number) => {
    return meetingRepository.delete(id)
  })

  ipcMain.handle('meetings:getRecent', (_event, limit: number) => {
    return meetingRepository.getRecent(limit)
  })

  ipcMain.handle('meetings:search', (_event, projectId: number, keyword: string) => {
    return meetingRepository.search(projectId, keyword)
  })
}
