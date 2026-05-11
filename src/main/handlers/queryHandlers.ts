import { IpcMain } from 'electron'
import { queryLogRepository, aiLogRepository, evidenceLogRepository, meetingRepository, taskRepository, documentRepository, projectRepository } from '../database/repositories'
import type { QueryRequest, QueryResponse } from '../../shared/types'
import { buildChatMessages, type PromptBuildInput } from '../services/promptBuilder'
import { callLLM, loadConfigFromEnv } from '../services/llmService'
import { getRecentCommits } from '../services/gitService'
import * as dotenv from 'dotenv'
import * as path from 'path'

// .env 로드 (실제 빌드 환경에 맞게 경로 조정 필요할 수 있음)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
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

    try {
      // 1. 소스 데이터 수집
      const sources: PromptBuildInput['sources'] = []

      // Git 소스 추가
      if (request.sources.includes('git')) {
        const project = projectRepository.getById(request.projectId)
        if (project && project.git_path) {
          try {
            const commits = getRecentCommits(project.git_path as string, 50)
            commits.forEach(c => {
              sources.push({
                type: 'git',
                id: c.hash,
                title: `Commit: ${c.message}`,
                content: `해시: ${c.shortHash}\n작성자: ${c.author}\n날짜: ${c.date}\n메시지: ${c.message}`
              })
            })
          } catch (e) {
            console.warn('Git 데이터 수집 실패:', e)
          }
        }
      }
      
      if (request.sources.includes('meetings')) {
        const meetings = meetingRepository.getByProject(request.projectId)
        meetings.forEach(m => sources.push({ type: 'meeting', id: m.id as number, title: m.title as string, content: m.content as string }))
      }
      if (request.sources.includes('tasks')) {
        const tasks = taskRepository.getByProject(request.projectId)
        tasks.forEach(t => sources.push({ 
          type: 'task', 
          id: t.id as number, 
          title: t.title as string, 
          content: `상태: ${t.status as string}, 우선순위: ${t.priority as string}, 담당자: ${t.assignee as string || '없음'}, 세부: ${t.description as string || ''}` 
        }))
      }
      if (request.sources.includes('documents')) {
        const docs = documentRepository.getByProject(request.projectId)
        // 파일 내용을 읽어오는 처리가 필요하지만 여기서는 간단히 경로만 제공하거나 빈 내용으로 처리.
        // 실제로는 fs를 통해 파일을 읽거나, DB에 저장된 파싱 결과를 가져와야 함.
        // 임시로 파일명만 사용
        docs.forEach(d => sources.push({ type: 'document', id: d.id as number, title: d.file_name as string, content: `파일 경로: ${d.file_path as string}` }))
      }

      // 2. RAG 파이프라인 (프롬프트 & 컨텍스트 빌드)
      const { messages, contextResult, stats } = buildChatMessages({
        userQuestion: request.prompt,
        sources,
        contextOptions: { chunkSize: 500, overlap: 80, topK: 5, maxContextChars: 3000 }
      })

      // 3. LLM 호출
      const provider = process.env.OPENAI_API_KEY ? 'openai' : 
                      process.env.GEMINI_API_KEY ? 'gemini' : 
                      process.env.CLAUDE_API_KEY ? 'claude' : null;

      if (!provider) {
        throw new Error('API 키가 설정되지 않았습니다. .env 파일을 확인하세요.')
      }

      const config = loadConfigFromEnv(provider as any)
      const llmResponse = await callLLM(messages, config)

      // 4. 응답 포맷팅
      const response: QueryResponse = {
        summary: llmResponse.content,
        evidence: contextResult.selectedChunks.map(chunk => ({
          id: `${chunk.sourceType}-${chunk.sourceId}`,
          source: chunk.sourceType as any,
          title: chunk.sourceTitle,
          content: chunk.text,
          score: chunk.score
        })),
        suggestedActions: []
      }

      const durationMs = Date.now() - startTime

      // AI 로그 저장
      aiLogRepository.create({
        queryLogId,
        promptSent: messages[messages.length - 1].content as string, // user prompt
        rawResponse: JSON.stringify(llmResponse),
        tokenUsed: llmResponse.usage?.totalTokens
      })

      // Evidence 로그 저장
      response.evidence.forEach(ev => {
        evidenceLogRepository.create({
          queryLogId,
          source: ev.source,
          title: ev.title,
          content: ev.content,
          score: ev.score
        })
      })

      // 쿼리 로그 상태 업데이트
      queryLogRepository.updateStatus(queryLogId, 'success', JSON.stringify(response), durationMs)

      return response
    } catch (error: any) {
      const durationMs = Date.now() - startTime
      queryLogRepository.updateStatus(queryLogId, 'error', error.message, durationMs)
      throw error
    }
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
