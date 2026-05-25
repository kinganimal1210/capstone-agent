/**
 * 쿼리 로그 & AI 로그 Repository
 * query_logs, ai_logs, evidence_logs 테이블에 대한 CRUD 연산을 제공합니다.
 */

import { getDB, saveDB } from '../index'

export interface CreateQueryLogData {
  projectId: number
  sources: string
  tool: string
  prompt: string
}

export interface CreateAiLogData {
  queryLogId: number
  model?: string
  promptSent?: string
  rawResponse?: string
  tokenUsed?: number
  error?: string
}

export interface CreateEvidenceLogData {
  queryLogId: number
  source: string
  title: string
  content: string
  score?: number
  metadata?: string
}

export const queryLogRepository = {
  /**
   * 쿼리 로그를 생성하고 ID를 반환합니다.
   */
  create(data: CreateQueryLogData): number {
    const db = getDB()
    db.run(
      'INSERT INTO query_logs (project_id, sources, tool, prompt) VALUES (?, ?, ?, ?)',
      [data.projectId, data.sources, data.tool, data.prompt]
    )
    saveDB()

    const stmt = db.prepare('SELECT id FROM query_logs ORDER BY id DESC LIMIT 1')
    stmt.step()
    const row = stmt.getAsObject() as { id: number }
    stmt.free()
    return row.id
  },

  /**
   * 쿼리 로그 상태를 업데이트합니다.
   */
  updateStatus(id: number, status: string, response?: string, durationMs?: number): void {
    const db = getDB()
    db.run(
      'UPDATE query_logs SET status = ?, response = ?, duration_ms = ? WHERE id = ?',
      [status, response ?? null, durationMs ?? null, id]
    )
    saveDB()
  },

  /**
   * 프로젝트별 쿼리 히스토리를 조회합니다.
   */
  getByProject(projectId: number, limit: number = 50): Record<string, unknown>[] {
    const db = getDB()
    const stmt = db.prepare(
      'SELECT * FROM query_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
    )
    stmt.bind([projectId, limit])
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  },

  /**
   * ID로 쿼리 로그를 조회합니다.
   */
  getById(id: number): Record<string, unknown> | null {
    const db = getDB()
    const stmt = db.prepare('SELECT * FROM query_logs WHERE id = ?')
    stmt.bind([id])
    const result = stmt.step() ? stmt.getAsObject() : null
    stmt.free()
    return result
  }
}

export const aiLogRepository = {
  /**
   * AI 로그를 생성합니다.
   */
  create(data: CreateAiLogData): Record<string, unknown> {
    const db = getDB()
    db.run(
      'INSERT INTO ai_logs (query_log_id, model, prompt_sent, raw_response, token_used, error) VALUES (?, ?, ?, ?, ?, ?)',
      [
        data.queryLogId,
        data.model ?? null,
        data.promptSent ?? null,
        data.rawResponse ?? null,
        data.tokenUsed ?? null,
        data.error ?? null
      ]
    )
    saveDB()

    const stmt = db.prepare('SELECT * FROM ai_logs ORDER BY id DESC LIMIT 1')
    stmt.step()
    const row = stmt.getAsObject()
    stmt.free()
    return row
  },

  /**
   * 쿼리 로그에 연결된 AI 로그를 조회합니다.
   */
  getByQueryLogId(queryLogId: number): Record<string, unknown>[] {
    const db = getDB()
    const stmt = db.prepare(
      'SELECT * FROM ai_logs WHERE query_log_id = ? ORDER BY created_at DESC'
    )
    stmt.bind([queryLogId])
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  }
}

export const evidenceLogRepository = {
  /**
   * Evidence 로그를 생성하고 생성된 ID를 반환합니다.
   */
  create(data: CreateEvidenceLogData): number {
    const db = getDB()
    const stmt = db.prepare(
      'INSERT INTO evidence_logs (query_log_id, source, title, content, score, metadata) VALUES (?, ?, ?, ?, ?, ?)'
    )
    stmt.run([
      data.queryLogId,
      data.source,
      data.title,
      data.content,
      data.score ?? null,
      data.metadata ?? null
    ])
    const stmt2 = db.prepare('SELECT last_insert_rowid() as id')
    stmt2.step()
    const result = stmt2.getAsObject() as { id: number }
    stmt2.free()
    saveDB()
    return result.id
  },

  /**
   * 여러 Evidence 로그를 한번에 생성합니다.
   */
  createBatch(items: CreateEvidenceLogData[]): void {
    const db = getDB()
    for (const data of items) {
      db.run(
        'INSERT INTO evidence_logs (query_log_id, source, title, content, score, metadata) VALUES (?, ?, ?, ?, ?, ?)',
        [
          data.queryLogId,
          data.source,
          data.title,
          data.content,
          data.score ?? null,
          data.metadata ?? null
        ]
      )
    }
    saveDB()
  },

  /**
   * 쿼리 로그에 연결된 Evidence를 조회합니다.
   */
  getByQueryLogId(queryLogId: number): Record<string, unknown>[] {
    const db = getDB()
    const stmt = db.prepare(
      'SELECT * FROM evidence_logs WHERE query_log_id = ? ORDER BY score DESC'
    )
    stmt.bind([queryLogId])
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  }
}
