import { IpcMain } from 'electron'
import { getDB, saveDB } from '../db'
import type { QueryRequest, QueryResponse } from '../../shared/types'

export function registerQueryHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('query:run', async (_event, request: QueryRequest): Promise<QueryResponse> => {
    const db = getDB()

    // query_log 저장
    db.run(
      'INSERT INTO query_logs (project_id, sources, tool, prompt) VALUES (?, ?, ?, ?)',
      [request.projectId, JSON.stringify(request.sources), request.tool, request.prompt]
    )

    const logStmt = db.prepare('SELECT id FROM query_logs ORDER BY id DESC LIMIT 1')
    logStmt.step()
    const { id: queryLogId } = logStmt.getAsObject()
    logStmt.free()

    // TODO: Week 7-12에서 실제 retrieval + LLM 연동 구현
    const response: QueryResponse = {
      summary: `[${request.tool}] "${request.prompt}" 에 대한 응답입니다. (LLM 연동 전 skeleton)`,
      evidence: [],
      suggestedActions: ['retrieval 구현 후 실제 결과가 여기 표시됩니다.']
    }

    db.run(
      'INSERT INTO ai_logs (query_log_id, prompt_sent, raw_response) VALUES (?, ?, ?)',
      [queryLogId as number, request.prompt, JSON.stringify(response)]
    )
    saveDB()

    return response
  })
}
