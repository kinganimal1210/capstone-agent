/**
 * 마이그레이션 시스템
 *
 * 버전 기반으로 스키마 변경을 관리합니다.
 * 각 마이그레이션은 버전 문자열과 up() 함수로 구성됩니다.
 * 앱 시작 시 미적용 마이그레이션을 순서대로 실행합니다.
 *
 * === 새 마이그레이션 추가 방법 ===
 * 1. migrations 배열에 새 항목 추가
 * 2. version은 'VXXX' 형식 (예: 'V002')
 * 3. up() 함수에 ALTER TABLE, CREATE TABLE 등 SQL 작성
 * 4. 앱 재시작 시 자동 적용
 */

import type { Database } from 'sql.js'

export interface Migration {
  version: string
  description: string
  up: (db: Database) => void
}

// ── 마이그레이션 목록 ────────────────────────────────────────────
// 새로운 마이그레이션은 이 배열 끝에 추가하면 됩니다.

export const migrations: Migration[] = [
  {
    version: 'V002',
    description: '적응형 청킹 파라미터 및 evidence 피드백 테이블 추가',
    up: (db) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS user_chunking_params (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          question_type TEXT NOT NULL,
          chunk_size INTEGER NOT NULL,
          overlap INTEGER NOT NULL,
          top_k INTEGER NOT NULL,
          max_context_chars INTEGER NOT NULL,
          feedback_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(user_id, question_type)
        )
      `)
      db.run(`
        CREATE TABLE IF NOT EXISTS evidence_feedback (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          query_log_id INTEGER NOT NULL,
          evidence_log_id INTEGER NOT NULL,
          feedback TEXT NOT NULL,
          question_type TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (query_log_id) REFERENCES query_logs(id) ON DELETE CASCADE,
          FOREIGN KEY (evidence_log_id) REFERENCES evidence_logs(id) ON DELETE CASCADE
        )
      `)
      db.run('CREATE INDEX IF NOT EXISTS idx_user_chunking_params_user ON user_chunking_params(user_id)')
      db.run('CREATE INDEX IF NOT EXISTS idx_evidence_feedback_user ON evidence_feedback(user_id)')
      db.run('CREATE INDEX IF NOT EXISTS idx_evidence_feedback_query ON evidence_feedback(query_log_id)')
    }
  },
  {
    version: 'V003',
    description: 'projects 테이블에 status 컬럼 추가',
    up: (db) => {
      let hasStatus = false
      const stmt = db.prepare('PRAGMA table_info(projects)')
      while (stmt.step()) {
        const row = stmt.getAsObject() as { name: string }
        if (row.name === 'status') {
          hasStatus = true
          break
        }
      }
      stmt.free()

      if (!hasStatus) {
        db.run("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
      }
    }
  },
  {
    version: 'V004',
    description: 'document_chunks 및 FTS 가상 테이블 보정',
    up: (db) => {
      // document_chunks 테이블
      db.run(`
        CREATE TABLE IF NOT EXISTS document_chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          document_id INTEGER NOT NULL,
          chunk_index INTEGER NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (document_id) REFERENCES document_sources(id) ON DELETE CASCADE
        )
      `)
      // FTS 테이블
      db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts4(content)`)
      
      // 트리거
      db.run(`
        CREATE TRIGGER IF NOT EXISTS document_chunks_ai AFTER INSERT ON document_chunks BEGIN
          INSERT INTO document_chunks_fts(docid, content) VALUES (new.id, new.content);
        END;
      `)
      db.run(`
        CREATE TRIGGER IF NOT EXISTS document_chunks_ad AFTER DELETE ON document_chunks BEGIN
          DELETE FROM document_chunks_fts WHERE docid = old.id;
        END;
      `)
      db.run(`
        CREATE TRIGGER IF NOT EXISTS document_chunks_au AFTER UPDATE ON document_chunks BEGIN
          DELETE FROM document_chunks_fts WHERE docid = old.id;
          INSERT INTO document_chunks_fts(docid, content) VALUES (new.id, new.content);
        END;
      `)
    }
  },
]

// ── 마이그레이션 엔진 ────────────────────────────────────────────

/**
 * 적용된 마이그레이션 버전 목록을 조회합니다.
 */
function getAppliedVersions(db: Database): Set<string> {
  const versions = new Set<string>()
  try {
    const stmt = db.prepare('SELECT version FROM schema_migrations')
    while (stmt.step()) {
      const row = stmt.getAsObject() as { version: string }
      versions.add(row.version)
    }
    stmt.free()
  } catch {
    // schema_migrations 테이블이 아직 없는 경우 (최초 실행)
  }
  return versions
}

/**
 * 마이그레이션 버전을 기록합니다.
 */
function recordMigration(db: Database, version: string): void {
  db.run('INSERT INTO schema_migrations (version) VALUES (?)', [version])
}

/**
 * 미적용 마이그레이션을 순서대로 실행합니다.
 * 초기 스키마(V001)가 적용된 후에 호출되어야 합니다.
 */
export function runMigrations(db: Database): void {
  const applied = getAppliedVersions(db)

  // 초기 스키마 버전 기록 (최초 실행 시)
  if (!applied.has('V001')) {
    recordMigration(db, 'V001')
    applied.add('V001')
    console.log('[DB] 초기 스키마 V001 기록 완료')
  }

  // 이후 마이그레이션 순차 적용
  for (const migration of migrations) {
    if (!applied.has(migration.version)) {
      console.log(`[DB] 마이그레이션 ${migration.version} 적용 중: ${migration.description}`)
      try {
        migration.up(db)
        recordMigration(db, migration.version)
        console.log(`[DB] 마이그레이션 ${migration.version} 적용 완료`)
      } catch (error) {
        console.error(`[DB] 마이그레이션 ${migration.version} 실패:`, error)
        throw error
      }
    }
  }
}
