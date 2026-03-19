import { IpcMain } from 'electron'
import { getDB, saveDB } from '../db'

export function registerTaskHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('tasks:getByProject', (_event, projectId: number) => {
    const db = getDB()
    const stmt = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC')
    stmt.bind([projectId])
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  ipcMain.handle(
    'tasks:create',
    (
      _event,
      data: {
        projectId: number
        title: string
        status: string
        priority: string
        assignee?: string
        description?: string
        meetingId?: number
      }
    ) => {
      const db = getDB()
      db.run(
        'INSERT INTO tasks (project_id, meeting_id, title, description, status, assignee, priority) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          data.projectId,
          data.meetingId ?? null,
          data.title,
          data.description ?? null,
          data.status,
          data.assignee ?? null,
          data.priority
        ]
      )
      saveDB()
      const stmt = db.prepare('SELECT * FROM tasks ORDER BY id DESC LIMIT 1')
      stmt.step()
      const row = stmt.getAsObject()
      stmt.free()
      return row
    }
  )

  ipcMain.handle('tasks:updateStatus', (_event, id: number, status: string) => {
    const db = getDB()
    db.run("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id])
    saveDB()
    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?')
    stmt.bind([id])
    stmt.step()
    const row = stmt.getAsObject()
    stmt.free()
    return row
  })
}
