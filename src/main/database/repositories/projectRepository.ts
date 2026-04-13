/**
 * 프로젝트 Repository
 * projects 테이블에 대한 CRUD 연산을 제공합니다.
 */

import { getDB, saveDB } from '../index'

export interface CreateProjectData {
  name: string
  description?: string
  gitPath?: string
  status?: string
  goal?: string
}

export interface UpdateProjectData {
  name?: string
  description?: string
  gitPath?: string
  status?: string
  goal?: string
}

export const projectRepository = {
  /**
   * 모든 프로젝트를 최신순으로 조회합니다.
   */
  getAll(): Record<string, unknown>[] {
    const db = getDB()
    const stmt = db.prepare('SELECT * FROM projects ORDER BY created_at DESC')
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  },

  /**
   * ID로 프로젝트를 조회합니다.
   */
  getById(id: number): Record<string, unknown> | null {
    const db = getDB()
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ?')
    stmt.bind([id])
    const result = stmt.step() ? stmt.getAsObject() : null
    stmt.free()
    return result
  },

  /**
   * 프로젝트를 생성합니다.
   */
  create(data: CreateProjectData): Record<string, unknown> {
    const db = getDB()
    db.run(
      'INSERT INTO projects (name, description, git_path, status, goal) VALUES (?, ?, ?, ?, ?)',
      [
        data.name,
        data.description ?? null,
        data.gitPath ?? null,
        data.status ?? 'active',
        data.goal ?? null
      ]
    )
    saveDB()

    const stmt = db.prepare('SELECT * FROM projects ORDER BY id DESC LIMIT 1')
    stmt.step()
    const row = stmt.getAsObject()
    stmt.free()
    return row
  },

  /**
   * 프로젝트를 수정합니다.
   */
  update(id: number, data: UpdateProjectData): Record<string, unknown> | null {
    const db = getDB()
    const fields: string[] = []
    const values: (string | number | null)[] = []

    if (data.name !== undefined) {
      fields.push('name = ?')
      values.push(data.name)
    }
    if (data.description !== undefined) {
      fields.push('description = ?')
      values.push(data.description)
    }
    if (data.gitPath !== undefined) {
      fields.push('git_path = ?')
      values.push(data.gitPath)
    }
    if (data.status !== undefined) {
      fields.push('status = ?')
      values.push(data.status)
    }
    if (data.goal !== undefined) {
      fields.push('goal = ?')
      values.push(data.goal)
    }

    if (fields.length === 0) return this.getById(id)

    fields.push("updated_at = datetime('now')")
    values.push(id)

    db.run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values)
    saveDB()
    return this.getById(id)
  },

  /**
   * 프로젝트를 삭제합니다.
   */
  delete(id: number): boolean {
    const db = getDB()
    db.run('DELETE FROM projects WHERE id = ?', [id])
    saveDB()
    return db.getRowsModified() > 0
  },

  /**
   * 활성 프로젝트만 조회합니다.
   */
  getActive(): Record<string, unknown>[] {
    const db = getDB()
    const stmt = db.prepare("SELECT * FROM projects WHERE status = 'active' ORDER BY created_at DESC")
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  }
}
