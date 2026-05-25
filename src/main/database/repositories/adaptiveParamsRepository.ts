/**
 * 적응형 파라미터 및 Evidence 피드백 Repository
 *
 * user_chunking_params, evidence_feedback 테이블에 대한 CRUD 연산을 제공합니다.
 */

import { getDB, saveDB } from '../index'
import type { ChunkingParams } from '../../../shared/types'

export const adaptiveParamsRepository = {
  /**
   * 사용자별 질문 유형에 해당하는 파라미터를 조회합니다.
   */
  getByUserAndType(userId: string, questionType: string): Record<string, unknown> | null {
    const db = getDB()
    const stmt = db.prepare(
      'SELECT * FROM user_chunking_params WHERE user_id = ? AND question_type = ?'
    )
    stmt.bind([userId, questionType])
    const result = stmt.step() ? stmt.getAsObject() : null
    stmt.free()
    return result
  },

  /**
   * 파라미터를 삽입하거나 업데이트합니다. (UPSERT)
   */
  upsert(userId: string, questionType: string, params: ChunkingParams): void {
    const db = getDB()
    db.run(
      `INSERT INTO user_chunking_params (user_id, question_type, chunk_size, overlap, top_k, max_context_chars, feedback_count)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(user_id, question_type) DO UPDATE SET
         chunk_size = excluded.chunk_size,
         overlap = excluded.overlap,
         top_k = excluded.top_k,
         max_context_chars = excluded.max_context_chars,
         feedback_count = feedback_count + 1,
         updated_at = datetime('now')`,
      [userId, questionType, params.chunkSize, params.overlap, params.topK, params.maxContextChars]
    )
    saveDB()
  },

  /**
   * 사용자의 모든 파라미터를 조회합니다.
   */
  getAllByUser(userId: string): Record<string, unknown>[] {
    const db = getDB()
    const stmt = db.prepare(
      'SELECT * FROM user_chunking_params WHERE user_id = ? ORDER BY question_type'
    )
    stmt.bind([userId])
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  },

  /**
   * Evidence 피드백을 저장합니다.
   */
  createFeedback(
    userId: string,
    queryLogId: number,
    evidenceLogId: number,
    feedback: string,
    questionType: string
  ): void {
    const db = getDB()
    db.run(
      `INSERT INTO evidence_feedback (user_id, query_log_id, evidence_log_id, feedback, question_type)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, queryLogId, evidenceLogId, feedback, questionType]
    )
    saveDB()
  },

  /**
   * 특정 쿼리에 대한 피드백 목록을 조회합니다.
   */
  getFeedbackByQueryLogId(queryLogId: number): Record<string, unknown>[] {
    const db = getDB()
    const stmt = db.prepare(
      'SELECT * FROM evidence_feedback WHERE query_log_id = ? ORDER BY created_at'
    )
    stmt.bind([queryLogId])
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  },
}
