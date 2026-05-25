/**
 * 데이터베이스 스키마 정의
 * 모든 테이블 DDL과 인덱스를 한 곳에서 관리합니다.
 */

// ── 초기 스키마 (v001) ───────────────────────────────────────────

export const SCHEMA_V001 = `
  -- 마이그레이션 버전 추적
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 프로젝트
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    git_path TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    goal TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 회의록
  CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- 태스크
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    meeting_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    assignee TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    tags TEXT,
    due_date TEXT,
    is_auto_generated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL
  );

  -- 쿼리 로그
  CREATE TABLE IF NOT EXISTS query_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    sources TEXT NOT NULL,
    tool TEXT NOT NULL,
    prompt TEXT NOT NULL,
    response TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    duration_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- AI 로그
  CREATE TABLE IF NOT EXISTS ai_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_log_id INTEGER NOT NULL,
    model TEXT,
    prompt_sent TEXT,
    raw_response TEXT,
    token_used INTEGER,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (query_log_id) REFERENCES query_logs(id) ON DELETE CASCADE
  );

  -- 문서 소스 (로컬 프로젝트 파일 메타데이터)
  CREATE TABLE IF NOT EXISTS document_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER,
    content_hash TEXT,
    last_indexed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- Evidence 로그 (retrieval 결과 스냅샷)
  CREATE TABLE IF NOT EXISTS evidence_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_log_id INTEGER NOT NULL,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    score REAL,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (query_log_id) REFERENCES query_logs(id) ON DELETE CASCADE
  );

  -- 보고서
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'report',
    content TEXT NOT NULL,
    generated_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- 마일스톤
  CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- 문서 청크 (FTS5 연동용)
  CREATE TABLE IF NOT EXISTS document_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (document_id) REFERENCES document_sources(id) ON DELETE CASCADE
  );

  -- 문서 청크 FTS4 가상 테이블 (sql.js 호환)
  CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts4(content);

  -- FTS 동기화 트리거
  CREATE TRIGGER IF NOT EXISTS document_chunks_ai AFTER INSERT ON document_chunks BEGIN
    INSERT INTO document_chunks_fts(docid, content) VALUES (new.id, new.content);
  END;

  CREATE TRIGGER IF NOT EXISTS document_chunks_ad AFTER DELETE ON document_chunks BEGIN
    DELETE FROM document_chunks_fts WHERE docid = old.id;
  END;

  CREATE TRIGGER IF NOT EXISTS document_chunks_au AFTER UPDATE ON document_chunks BEGIN
    DELETE FROM document_chunks_fts WHERE docid = old.id;
    INSERT INTO document_chunks_fts(docid, content) VALUES (new.id, new.content);
  END;
`

// ── 인덱스 ──────────────────────────────────────────────────────

export const INDEXES_V001 = `
  CREATE INDEX IF NOT EXISTS idx_meetings_project_id ON meetings(project_id);
  CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
  CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_meeting_id ON tasks(meeting_id);
  CREATE INDEX IF NOT EXISTS idx_query_logs_project_id ON query_logs(project_id);
  CREATE INDEX IF NOT EXISTS idx_ai_logs_query_log_id ON ai_logs(query_log_id);
  CREATE INDEX IF NOT EXISTS idx_document_sources_project_id ON document_sources(project_id);
  CREATE INDEX IF NOT EXISTS idx_document_sources_file_path ON document_sources(file_path);
  CREATE INDEX IF NOT EXISTS idx_evidence_logs_query_log_id ON evidence_logs(query_log_id);
  CREATE INDEX IF NOT EXISTS idx_reports_project_id ON reports(project_id);
  CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
`
