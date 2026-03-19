import initSqlJs, { Database } from 'sql.js'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

let db: Database

export function getDB(): Database {
  return db
}

export async function initDB(): Promise<void> {
  const SQL = await initSqlJs()
  const dbPath = path.join(app.getPath('userData'), 'capstone-agent.db')

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  createTables()
  persistDB(dbPath)
}

function persistDB(dbPath: string): void {
  // 변경사항을 파일로 저장하는 헬퍼
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

export function saveDB(): void {
  const dbPath = path.join(app.getPath('userData'), 'capstone-agent.db')
  persistDB(dbPath)
}

function createTables(): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      git_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      meeting_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      assignee TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS query_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      sources TEXT NOT NULL,
      tool TEXT NOT NULL,
      prompt TEXT NOT NULL,
      response TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_log_id INTEGER NOT NULL,
      prompt_sent TEXT,
      raw_response TEXT,
      token_used INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  saveDB()
}
