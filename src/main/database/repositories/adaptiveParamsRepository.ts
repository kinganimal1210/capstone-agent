/**
 * 적응형 파라미터 및 Evidence 피드백 Repository
 *
 * user_chunking_params, evidence_feedback 테이블에 대한 CRUD 연산을 제공합니다.
 */

import { getDB, saveDB } from '../index'
import type { BayesianWeights, ChunkFeatures, ChunkingParams } from '../../../shared/types'

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
    questionType: string,
    chunkFeatures?: ChunkFeatures
  ): void {
    const db = getDB()
    db.run(
      `INSERT INTO evidence_feedback (user_id, query_log_id, evidence_log_id, feedback, question_type, chunk_features)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, queryLogId, evidenceLogId, feedback, questionType, chunkFeatures ? JSON.stringify(chunkFeatures) : null]
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

export const scoringWeightsRepository = {
  getByUserAndType(userId: string, questionType: string): BayesianWeights | null {
    const db = getDB()
    const stmt = db.prepare(
      'SELECT * FROM user_scoring_weights WHERE user_id = ? AND question_type = ?'
    )
    stmt.bind([userId, questionType])
    const row = stmt.step() ? stmt.getAsObject() : null
    stmt.free()

    if (!row) return null

    return {
      wKeywordBase: row.w_keyword_base as number,
      wKeywordBase_n: row.w_keyword_base_n as number,
      wFreqBonus: row.w_freq_bonus as number,
      wFreqBonus_n: row.w_freq_bonus_n as number,
      wPositionBonus: row.w_position_bonus as number,
      wPositionBonus_n: row.w_position_bonus_n as number,
      wTitleMatch: row.w_title_match as number,
      wTitleMatch_n: row.w_title_match_n as number,
      wFirstChunk: row.w_first_chunk as number,
      wFirstChunk_n: row.w_first_chunk_n as number,
      wMeetingType: row.w_meeting_type as number,
      wMeetingType_n: row.w_meeting_type_n as number,
      wTaskType: row.w_task_type as number,
      wTaskType_n: row.w_task_type_n as number
    }
  },

  upsert(userId: string, questionType: string, weights: BayesianWeights): void {
    const db = getDB()
    db.run(
      `INSERT INTO user_scoring_weights (
        user_id, question_type,
        w_keyword_base, w_keyword_base_n,
        w_freq_bonus, w_freq_bonus_n,
        w_position_bonus, w_position_bonus_n,
        w_title_match, w_title_match_n,
        w_first_chunk, w_first_chunk_n,
        w_meeting_type, w_meeting_type_n,
        w_task_type, w_task_type_n
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, question_type) DO UPDATE SET
        w_keyword_base = excluded.w_keyword_base,
        w_keyword_base_n = excluded.w_keyword_base_n,
        w_freq_bonus = excluded.w_freq_bonus,
        w_freq_bonus_n = excluded.w_freq_bonus_n,
        w_position_bonus = excluded.w_position_bonus,
        w_position_bonus_n = excluded.w_position_bonus_n,
        w_title_match = excluded.w_title_match,
        w_title_match_n = excluded.w_title_match_n,
        w_first_chunk = excluded.w_first_chunk,
        w_first_chunk_n = excluded.w_first_chunk_n,
        w_meeting_type = excluded.w_meeting_type,
        w_meeting_type_n = excluded.w_meeting_type_n,
        w_task_type = excluded.w_task_type,
        w_task_type_n = excluded.w_task_type_n,
        updated_at = datetime('now')`,
      [
        userId,
        questionType,
        weights.wKeywordBase,
        weights.wKeywordBase_n,
        weights.wFreqBonus,
        weights.wFreqBonus_n,
        weights.wPositionBonus,
        weights.wPositionBonus_n,
        weights.wTitleMatch,
        weights.wTitleMatch_n,
        weights.wFirstChunk,
        weights.wFirstChunk_n,
        weights.wMeetingType,
        weights.wMeetingType_n,
        weights.wTaskType,
        weights.wTaskType_n
      ]
    )
    saveDB()
  },

  getAllByUser(userId: string): BayesianWeights[] {
    const db = getDB()
    const stmt = db.prepare(
      'SELECT * FROM user_scoring_weights WHERE user_id = ? ORDER BY question_type'
    )
    stmt.bind([userId])
    const rows: BayesianWeights[] = []
    while (stmt.step()) {
      const row = stmt.getAsObject()
      rows.push({
        wKeywordBase: row.w_keyword_base as number,
        wKeywordBase_n: row.w_keyword_base_n as number,
        wFreqBonus: row.w_freq_bonus as number,
        wFreqBonus_n: row.w_freq_bonus_n as number,
        wPositionBonus: row.w_position_bonus as number,
        wPositionBonus_n: row.w_position_bonus_n as number,
        wTitleMatch: row.w_title_match as number,
        wTitleMatch_n: row.w_title_match_n as number,
        wFirstChunk: row.w_first_chunk as number,
        wFirstChunk_n: row.w_first_chunk_n as number,
        wMeetingType: row.w_meeting_type as number,
        wMeetingType_n: row.w_meeting_type_n as number,
        wTaskType: row.w_task_type as number,
        wTaskType_n: row.w_task_type_n as number
      })
    }
    stmt.free()
    return rows
  }
}
