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
  // V001은 초기 스키마이므로 schema.ts에서 직접 생성합니다.
  // 여기서부터 V002, V003 등 변경 사항을 추가합니다.

  // 예시: 나중에 새 컬럼을 추가하고 싶다면
  // {
  //   version: 'V002',
  //   description: 'projects 테이블에 archive_reason 필드 추가',
  //   up: (db) => {
  //     db.run('ALTER TABLE projects ADD COLUMN archive_reason TEXT')
  //   }
  // },
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
