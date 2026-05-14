/**
 * 회의록 Repository
 * meetings 테이블에 대한 CRUD 연산을 제공합니다.
 */

import { getDB, saveDB } from '../index'

export interface CreateMeetingData {
  projectId: number
  title: string
  content: string
  date: string
  summary?: string
}

export interface UpdateMeetingData {
  title?: string
  content?: string
  date?: string
  summary?: string
}

export const meetingRepository = {
  /**
   * 프로젝트별 회의록을 날짜 내림차순으로 조회합니다.
   */
  getByProject(projectId: number): Record<string, unknown>[] {
    const db = getDB()
    const stmt = db.prepare(
      'SELECT * FROM meetings WHERE project_id = ? ORDER BY date DESC'
    )
    stmt.bind([projectId])
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  },

  /**
   * ID로 회의록을 조회합니다.
   */
  getById(id: number): Record<string, unknown> | null {
    const db = getDB()
    const stmt = db.prepare('SELECT * FROM meetings WHERE id = ?')
    stmt.bind([id])
    const result = stmt.step() ? stmt.getAsObject() : null
    stmt.free()
    return result
  },

  /**
   * 회의록을 생성합니다.
   */
  create(data: CreateMeetingData): Record<string, unknown> {
    const db = getDB()
    db.run(
      'INSERT INTO meetings (project_id, title, content, date, summary) VALUES (?, ?, ?, ?, ?)',
      [data.projectId, data.title, data.content, data.date, data.summary ?? null]
    )
    saveDB()

    const stmt = db.prepare('SELECT * FROM meetings ORDER BY id DESC LIMIT 1')
    stmt.step()
    const row = stmt.getAsObject()
    stmt.free()
    return row
  },

  /**
   * 회의록을 수정합니다.
   */
  update(id: number, data: UpdateMeetingData): Record<string, unknown> | null {
    const db = getDB()
    const fields: string[] = []
    const values: (string | number | null)[] = []

    if (data.title !== undefined) {
      fields.push('title = ?')
      values.push(data.title)
    }
    if (data.content !== undefined) {
      fields.push('content = ?')
      values.push(data.content)
    }
    if (data.date !== undefined) {
      fields.push('date = ?')
      values.push(data.date)
    }
    if (data.summary !== undefined) {
      fields.push('summary = ?')
      values.push(data.summary)
    }

    if (fields.length === 0) return this.getById(id)

    fields.push("updated_at = datetime('now')")
    values.push(id)

    db.run(`UPDATE meetings SET ${fields.join(', ')} WHERE id = ?`, values)
    saveDB()
    return this.getById(id)
  },

  /**
   * 회의록을 삭제합니다.
   */
  delete(id: number): boolean {
    const db = getDB()
    db.run('DELETE FROM meetings WHERE id = ?', [id])
    saveDB()
    return db.getRowsModified() > 0
  },

  /**
   * 최근 N개 회의록을 조회합니다 (프로젝트 무관).
   */
  getRecent(limit: number = 10): Record<string, unknown>[] {
    const db = getDB()
    const stmt = db.prepare('SELECT * FROM meetings ORDER BY date DESC LIMIT ?')
    stmt.bind([limit])
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  },

  /**
   * 키워드로 회의록을 검색합니다.
   */
  search(projectId: number, keyword: string): Record<string, unknown>[] {
    const db = getDB()
    const stmt = db.prepare(
      `SELECT * FROM meetings 
       WHERE project_id = ? AND (title LIKE ? OR content LIKE ?)
       ORDER BY date DESC`
    )
    const pattern = `%${keyword}%`
    stmt.bind([projectId, pattern, pattern])
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  }
}
