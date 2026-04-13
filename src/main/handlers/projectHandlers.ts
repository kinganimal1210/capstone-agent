import { IpcMain } from 'electron'
import { projectRepository } from '../database/repositories'

export function registerProjectHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('projects:getAll', () => {
    return projectRepository.getAll()
  })

  ipcMain.handle('projects:getById', (_event, id: number) => {
    return projectRepository.getById(id)
  })

  ipcMain.handle(
    'projects:create',
    (_event, data: { name: string; description?: string; gitPath?: string; goal?: string }) => {
      return projectRepository.create(data)
    }
  )

  ipcMain.handle(
    'projects:update',
    (_event, id: number, data: { name?: string; description?: string; gitPath?: string; status?: string; goal?: string }) => {
      return projectRepository.update(id, data)
    }
  )

  ipcMain.handle('projects:delete', (_event, id: number) => {
    return projectRepository.delete(id)
  })

  ipcMain.handle('projects:getActive', () => {
    return projectRepository.getActive()
  })
}
