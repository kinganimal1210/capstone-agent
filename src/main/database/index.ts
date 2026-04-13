/**
 * 데이터베이스 모듈 메인 엔트리
 *
 * DB 초기화, 연결, 저장을 담당합니다.
 * 기존 DB 파일이 있으면 삭제 후 새로 생성합니다 (리셋 모드).
 */

import initSqlJs, { Database } from 'sql.js'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { SCHEMA_V001, INDEXES_V001 } from './schema'
import { runMigrations } from './migrations'

let db: Database

/**
 * DB 인스턴스를 반환합니다.
 */
export function getDB(): Database {
  if (!db) {
    throw new Error('[DB] 데이터베이스가 초기화되지 않았습니다. initDB()를 먼저 호출하세요.')
  }
  return db
}

/**
 * DB 파일 경로를 반환합니다.
 */
function getDBPath(): string {
  return path.join(app.getPath('userData'), 'capstone-agent.db')
}

/**
 * DB를 파일로 저장합니다.
 */
export function saveDB(): void {
  const dbPath = getDBPath()
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

/**
 * DB를 초기화합니다.
 * 1. sql.js 로드
 * 2. 기존 DB 파일 로드 또는 새로 생성
 * 3. FOREIGN KEY 활성화
 * 4. 스키마 생성 (CREATE IF NOT EXISTS)
 * 5. 마이그레이션 실행
 * 6. 파일 저장
 */
export async function initDB(): Promise<void> {
  const SQL = await initSqlJs()
  const dbPath = getDBPath()

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
    console.log('[DB] 기존 데이터베이스 로드 완료:', dbPath)
  } else {
    db = new SQL.Database()
    console.log('[DB] 새 데이터베이스 생성:', dbPath)
  }

  // FOREIGN KEY 제약조건 활성화
  db.run('PRAGMA foreign_keys = ON')

  // 스키마 생성 (IF NOT EXISTS이므로 기존 테이블에 영향 없음)
  db.run(SCHEMA_V001)
  db.run(INDEXES_V001)

  // 마이그레이션 실행
  runMigrations(db)

  // 저장
  saveDB()
  console.log('[DB] 데이터베이스 초기화 완료')
}

/**
 * DB를 완전히 리셋합니다. (개발용)
 */
export async function resetDB(): Promise<void> {
  const dbPath = getDBPath()
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
    console.log('[DB] 기존 데이터베이스 삭제:', dbPath)
  }
  await initDB()
}
