/**
 * 문서 소스 Repository
 * document_sources 테이블에 대한 CRUD 연산을 제공합니다.
 */

import { getDB, saveDB } from '../index'

export interface CreateDocumentSourceData {
  projectId: number
  filePath: string
  fileName: string
  fileType: string
  fileSize?: number
  contentHash?: string
}

export const documentRepository = {
  /**
   * 프로젝트별 문서 목록을 조회합니다.
   */
  getByProject(projectId: number): Record<string, unknown>[] {
    const db = getDB()
    const stmt = db.prepare(
      'SELECT * FROM document_sources WHERE project_id = ? ORDER BY file_name ASC'
    )
    stmt.bind([projectId])
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  },

  /**
   * ID로 문서를 조회합니다.
   */
  getById(id: number): Record<string, unknown> | null {
    const db = getDB()
    const stmt = db.prepare('SELECT * FROM document_sources WHERE id = ?')
    stmt.bind([id])
    const result = stmt.step() ? stmt.getAsObject() : null
    stmt.free()
    return result
  },

  /**
   * 문서를 생성합니다.
   */
  create(data: CreateDocumentSourceData): Record<string, unknown> {
    const db = getDB()
    db.run(
      `INSERT INTO document_sources 
       (project_id, file_path, file_name, file_type, file_size, content_hash, last_indexed_at) 
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        data.projectId,
        data.filePath,
        data.fileName,
        data.fileType,
        data.fileSize ?? null,
        data.contentHash ?? null
      ]
    )
    saveDB()

    const stmt = db.prepare('SELECT * FROM document_sources ORDER BY id DESC LIMIT 1')
    stmt.step()
    const row = stmt.getAsObject()
    stmt.free()
    return row
  },

  /**
   * 여러 문서를 한번에 생성합니다 (스캔 결과 저장 시 사용).
   */
  createBatch(items: CreateDocumentSourceData[]): number {
    const db = getDB()
    let count = 0
    for (const data of items) {
      // 이미 같은 경로의 파일이 등록되어 있으면 스킵
      const existing = db.prepare(
        'SELECT id FROM document_sources WHERE project_id = ? AND file_path = ?'
      )
      existing.bind([data.projectId, data.filePath])
      const exists = existing.step()
      existing.free()

      if (!exists) {
        db.run(
          `INSERT INTO document_sources 
           (project_id, file_path, file_name, file_type, file_size, content_hash, last_indexed_at) 
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            data.projectId,
            data.filePath,
            data.fileName,
            data.fileType,
            data.fileSize ?? null,
            data.contentHash ?? null
          ]
        )
        count++
      }
    }
    saveDB()
    return count
  },

  /**
   * 문서를 삭제합니다.
   */
  delete(id: number): boolean {
    const db = getDB()
    db.run('DELETE FROM document_sources WHERE id = ?', [id])
    saveDB()
    return db.getRowsModified() > 0
  },

  /**
   * 프로젝트의 모든 문서를 삭제합니다.
   */
  deleteByProject(projectId: number): number {
    const db = getDB()
    db.run('DELETE FROM document_sources WHERE project_id = ?', [projectId])
    const deleted = db.getRowsModified()
    saveDB()
    return deleted
  }
}
