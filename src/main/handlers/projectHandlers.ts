import { IpcMain } from 'electron'
import { getDB, saveDB } from '../db'

export function registerProjectHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('projects:getAll', () => {
    const db = getDB()
    const stmt = db.prepare('SELECT * FROM projects ORDER BY created_at DESC')
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  ipcMain.handle(
    'projects:create',
    (_event, data: { name: string; description?: string; gitPath?: string }) => {
      const db = getDB()
      db.run('INSERT INTO projects (name, description, git_path) VALUES (?, ?, ?)', [
        data.name,
        data.description ?? null,
        data.gitPath ?? null
      ])
      saveDB()
      const stmt = db.prepare('SELECT * FROM projects ORDER BY id DESC LIMIT 1')
      stmt.step()
      const row = stmt.getAsObject()
      stmt.free()
      return row
    }
  )
}
