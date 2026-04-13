import { IpcMain } from 'electron'
import { queryLogRepository, aiLogRepository, evidenceLogRepository } from '../database/repositories'
import type { QueryRequest, QueryResponse } from '../../shared/types'

export function registerQueryHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('query:run', async (_event, request: QueryRequest): Promise<QueryResponse> => {
    const startTime = Date.now()

    // query_log 저장
    const queryLogId = queryLogRepository.create({
      projectId: request.projectId,
      sources: JSON.stringify(request.sources),
      tool: request.tool,
      prompt: request.prompt
    })

    // TODO: Week 7-12에서 실제 retrieval + LLM 연동 구현
    const response: QueryResponse = {
      summary: `[${request.tool}] "${request.prompt}" 에 대한 응답입니다. (LLM 연동 전 skeleton)`,
      evidence: [],
      suggestedActions: ['retrieval 구현 후 실제 결과가 여기 표시됩니다.']
    }

    const durationMs = Date.now() - startTime

    // AI 로그 저장
    aiLogRepository.create({
      queryLogId,
      promptSent: request.prompt,
      rawResponse: JSON.stringify(response)
    })

    // 쿼리 로그 상태 업데이트
    queryLogRepository.updateStatus(queryLogId, 'success', JSON.stringify(response), durationMs)

    return response
  })

  // 쿼리 히스토리 조회
  ipcMain.handle('query:getHistory', (_event, projectId: number, limit?: number) => {
    return queryLogRepository.getByProject(projectId, limit)
  })

  // 특정 쿼리 로그 상세 조회
  ipcMain.handle('query:getById', (_event, id: number) => {
    const log = queryLogRepository.getById(id)
    if (!log) return null

    const aiLogs = aiLogRepository.getByQueryLogId(id)
    const evidenceLogs = evidenceLogRepository.getByQueryLogId(id)

    return { ...log, aiLogs, evidenceLogs }
  })
}
