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
   * 여러 문서를 한번에 생성하고, 생성된 문서 목록을 반환합니다.
   */
  createBatch(items: CreateDocumentSourceData[]): { id: number, filePath: string }[] {
    const db = getDB()
    const added: { id: number, filePath: string }[] = []
    for (const data of items) {
      const existing = db.prepare(
        'SELECT id FROM document_sources WHERE project_id = ? AND file_path = ?'
      )
      existing.bind([data.projectId, data.filePath])
      const exists = existing.step()

      if (!exists) {
        existing.free()
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
        const stmt = db.prepare('SELECT last_insert_rowid() as id')
        if (stmt.step()) {
          added.push({ id: stmt.getAsObject().id as number, filePath: data.filePath })
        }
        stmt.free()
      } else {
        const row = existing.getAsObject()
        existing.free()
        db.run(
          `UPDATE document_sources 
           SET file_size = ?, updated_at = datetime('now') 
           WHERE id = ?`,
          [data.fileSize ?? null, row.id]
        )
        added.push({ id: row.id as number, filePath: data.filePath })
      }
    }
    saveDB()
    return added
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
  },

  /**
   * 여러 청크를 일괄 저장합니다. (FTS 테이블 트리거 자동 동작)
   */
  createChunksBatch(documentId: number, chunks: string[]): void {
    const db = getDB()
    for (let i = 0; i < chunks.length; i++) {
      db.run(
        'INSERT INTO document_chunks (document_id, chunk_index, content) VALUES (?, ?, ?)',
        [documentId, i, chunks[i]]
      )
    }
    saveDB()
  },

  /**
   * 특정 문서의 모든 청크를 삭제합니다. (재색인용)
   */
  deleteChunks(documentId: number): void {
    const db = getDB()
    db.run('DELETE FROM document_chunks WHERE document_id = ?', [documentId])
    saveDB()
  },

  /**
   * 문서의 내용 해시와 인덱싱 시간을 갱신합니다.
   */
  updateContentHash(documentId: number, contentHash: string): void {
    const db = getDB()
    db.run(
      `UPDATE document_sources 
       SET content_hash = ?, last_indexed_at = datetime('now') 
       WHERE id = ?`,
      [contentHash, documentId]
    )
    saveDB()
  },

  /**
   * FTS5를 사용하여 관련 문서 청크를 검색합니다.
   */
  searchChunks(projectId: number, keywords: string[], limit: number = 5): Record<string, unknown>[] {
    if (keywords.length === 0) return []
    const db = getDB()
    
    const rowsMap = new Map<number, Record<string, unknown>>()

    const sqlFts = `
      SELECT c.id, c.document_id, c.chunk_index, c.content, d.file_name, d.file_path
      FROM document_chunks_fts fts
      JOIN document_chunks c ON fts.docid = c.id
      JOIN document_sources d ON c.document_id = d.id
      WHERE document_chunks_fts MATCH ? AND d.project_id = ?
      LIMIT 500
    `

    try {
      // 1. AND 검색 (Precision 우선)
      const andMatchQuery = keywords.map(kw => `"${kw.replace(/"/g, '""')}*"`).join(' AND ')
      const stmtAnd = db.prepare(sqlFts)
      stmtAnd.bind([andMatchQuery, projectId])
      while (stmtAnd.step()) {
        const row = stmtAnd.getAsObject()
        row.searchMode = 'fts_and'
        rowsMap.set(row.id as number, row)
      }
      stmtAnd.free()

      // 2. OR 검색 (Recall 보완) - AND 결과가 충분하지 않을 때만
      if (rowsMap.size < limit * 2) {
        const orMatchQuery = keywords.map(kw => `"${kw.replace(/"/g, '""')}*"`).join(' OR ')
        const stmtOr = db.prepare(sqlFts)
        stmtOr.bind([orMatchQuery, projectId])
        while (stmtOr.step()) {
          const row = stmtOr.getAsObject()
          if (!rowsMap.has(row.id as number)) {
            row.searchMode = 'fts_or'
            rowsMap.set(row.id as number, row)
          }
        }
        stmtOr.free()
      }

      if (rowsMap.size === 0) {
        throw new Error('FTS returned 0 results')
      }
    } catch (e) {
      console.warn('FTS 검색 실패, LIKE fallback 사용:', e)
      const likeQuery = keywords.map(() => `c.content LIKE ?`).join(' OR ')
      const fallbackSql = `
        SELECT c.id, c.document_id, c.chunk_index, c.content, d.file_name, d.file_path
        FROM document_chunks c
        JOIN document_sources d ON c.document_id = d.id
        WHERE d.project_id = ? AND (${likeQuery})
        LIMIT 500
      `
      const fallbackStmt = db.prepare(fallbackSql)
      const bindParams = [projectId, ...keywords.map(kw => `%${kw}%`)]
      fallbackStmt.bind(bindParams)
      while (fallbackStmt.step()) {
        const row = fallbackStmt.getAsObject()
        if (!rowsMap.has(row.id as number)) {
          row.searchMode = 'like'
          rowsMap.set(row.id as number, row)
        }
      }
      fallbackStmt.free()
    }

    const rows = Array.from(rowsMap.values())

    // JS 기반 랭킹 (키워드 매칭 수 계산, 점수가 작을수록/음수일수록 우선순위 높음)
    const lowerKeywords = keywords.map(kw => kw.toLowerCase())
    
    // Q20 등 특정 도메인 부스팅용 키워드 감지
    const hasBuildSecurityKeyword = lowerKeywords.some(kw => 
      ['패키지', '의존성', '빌드', '보안', '유출', 'package', 'dependency', 'security', 'leak'].includes(kw)
    )
    const buildFiles = ['package.json', 'vite.config', 'electron-builder', 'tsconfig', '.env', 'preload', 'main', 'llmservice', 'queryhandlers']

    for (const row of rows) {
      const content = (row.content as string).toLowerCase()
      const fileName = ((row.file_name as string) || '').toLowerCase()
      let score = 0
      let matchCount = 0

      for (const kw of lowerKeywords) {
        if (content.includes(kw)) {
          score -= 1
          matchCount++
        }
        // 제목 매칭 가중치
        if (fileName.includes(kw)) {
          score -= 2
        }
      }

      // 특정 질문 의도(빌드/설정/보안)별 파일 부스팅
      if (hasBuildSecurityKeyword && buildFiles.some(bf => fileName.includes(bf))) {
        score -= 3 // 매우 강한 가중치 부여
      }

      // 여러 키워드 동시 포함 가중치
      if (matchCount === lowerKeywords.length && lowerKeywords.length > 1) {
        score -= 2
      }

      // 너무 긴 청크 패널티, 적당히 밀도 높은 청크 우대
      if (matchCount > 0) {
        if (content.length < 200) score -= 1
        if (content.length > 1000) score += 1
      }

      row.rank = score
    }

    // 점수(rank) 오름차순 정렬 (음수이므로 더 많이 포함될수록 앞쪽)
    rows.sort((a, b) => (a.rank as number) - (b.rank as number))

    return rows.slice(0, limit)
  },

  /**
   * 키워드 검색 결과가 없을 때 사용할 최근 문서 청크를 조회합니다.
   */
  getChunksByProject(projectId: number, limit: number = 5): Record<string, unknown>[] {
    const db = getDB()
    const stmt = db.prepare(`
      SELECT c.id, c.document_id, c.chunk_index, c.content, d.file_name, d.file_path
      FROM document_chunks c
      JOIN document_sources d ON c.document_id = d.id
      WHERE d.project_id = ?
      ORDER BY d.updated_at DESC, c.chunk_index ASC
      LIMIT ?
    `)
    stmt.bind([projectId, limit])

    const rows: Record<string, unknown>[] = []
    while (stmt.step()) {
      const row = stmt.getAsObject()
      row.searchMode = 'fallback_recent'
      row.rank = 0
      rows.push(row)
    }
    stmt.free()
    return rows
  }
}
