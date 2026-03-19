import { IpcMain } from 'electron'
import { getDB, saveDB } from '../db'

export function registerMeetingHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('meetings:getByProject', (_event, projectId: number) => {
    const db = getDB()
    const stmt = db.prepare(
      'SELECT * FROM meetings WHERE project_id = ? ORDER BY date DESC'
    )
    stmt.bind([projectId])
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  ipcMain.handle(
    'meetings:create',
    (_event, data: { projectId: number; title: string; content: string; date: string }) => {
      const db = getDB()
      db.run('INSERT INTO meetings (project_id, title, content, date) VALUES (?, ?, ?, ?)', [
        data.projectId,
        data.title,
        data.content,
        data.date
      ])
      saveDB()
      const stmt = db.prepare('SELECT * FROM meetings ORDER BY id DESC LIMIT 1')
      stmt.step()
      const row = stmt.getAsObject()
      stmt.free()
      return row
    }
  )
}
