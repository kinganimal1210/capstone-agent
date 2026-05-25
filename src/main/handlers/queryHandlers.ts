import { IpcMain } from 'electron'
import { queryLogRepository, aiLogRepository, evidenceLogRepository, meetingRepository, taskRepository, documentRepository, projectRepository, adaptiveParamsRepository } from '../database/repositories'
import type { QueryRequest, QueryResponse, EvidenceFeedbackRequest } from '../../shared/types'
import { buildChatMessages, type PromptBuildInput } from '../services/promptBuilder'
import { callLLM, loadConfigFromEnv } from '../services/llmService'
import { getRecentCommits } from '../services/gitService'
import { classifyQuestion } from '../services/questionClassifier'
import { getParams, updateParamsFromBatch } from '../services/adaptiveParams'
import { preprocessPrompt } from '../services/promptPreprocessor'
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
                title: `${c.shortHash} ${c.message} (작성자: ${c.author}, 날짜: ${c.date.substring(0, 10)})`,
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
        meetings.forEach(m => sources.push({ type: 'meeting', id: m.id as number, title: `${m.title as string} (일자: ${(m.date as string).substring(0, 10)})`, content: m.content as string }))
      }
      if (request.sources.includes('tasks')) {
        const tasks = taskRepository.getByProject(request.projectId)
        tasks.forEach(t => sources.push({ 
          type: 'task', 
          id: t.id as number, 
          title: `${t.title as string} (상태: ${t.status}, 마감: ${t.dueDate || '없음'})`, 
          content: `상태: ${t.status as string}, 우선순위: ${t.priority as string}, 담당자: ${t.assignee as string || '없음'}, 세부: ${t.description as string || ''}` 
        }))
      }
      if (request.sources.includes('documents')) {
        // 1. 질문에서 키워드 추출
        const { keywords } = preprocessPrompt(request.prompt)
        
        if (keywords.length > 0) {
          // 2. FTS5를 통해 DB에서 직접 관련 청크 검색 (상위 10개)
          // (Chunker에서 2차로 score 순으로 정렬하므로 여기서는 넉넉히 가져옴)
          const matchedChunks = documentRepository.searchChunks(request.projectId, keywords, 10)
          matchedChunks.forEach((c: any) => {
            const contentStr = c.content as string
            const lines = contentStr.split('\n').map(line => line.trim())
            // 알파벳이나 한글이 포함된 5글자 이상의 줄을 우선적으로 찾음
            let firstLine = lines.find(line => line.length > 5 && /[a-zA-Z가-힣]/.test(line)) 
                         || lines.find(line => line.length > 0) || ''
            const preview = firstLine.length > 25 ? firstLine.substring(0, 25) + '...' : firstLine

            sources.push({ 
              type: 'document', 
              id: c.document_id, 
              title: `${c.file_name as string} (미리보기: "${preview}")`, 
              content: contentStr
            })
          })
        }
      }

      // 2. 질문 유형 분류 + 적응형 파라미터 조회
      const questionType = classifyQuestion(request.prompt)
      const userId = (request as any).userId ?? 'default'
      const adaptiveContextOptions = getParams(userId, questionType)

      // 3. RAG 파이프라인 (프롬프트 & 컨텍스트 빌드)
      const { messages, contextResult, stats } = buildChatMessages({
        userQuestion: request.prompt,
        sources,
        contextOptions: adaptiveContextOptions
      })

      // 4. LLM 호출
      const provider = process.env.OPENAI_API_KEY ? 'openai' : 
                      process.env.GEMINI_API_KEY ? 'gemini' : 
                      process.env.CLAUDE_API_KEY ? 'claude' : null;

      if (!provider) {
        throw new Error('API 키가 설정되지 않았습니다. .env 파일을 확인하세요.')
      }

      const config = loadConfigFromEnv(provider as any)
      const llmResponse = await callLLM(messages, config)

      // 5. 응답 포맷팅
      const response: QueryResponse = {
        queryLogId,
        summary: llmResponse.content,
        evidence: contextResult.selectedChunks.map(chunk => ({
          id: `${chunk.sourceType}-${chunk.sourceId}`,
          source: chunk.sourceType as any,
          title: chunk.sourceTitle,
          content: chunk.text,
          score: chunk.score
        })),
        suggestedActions: [],
        rawResponse: JSON.stringify({ questionType, userId, adaptiveContextOptions })
      }

      const durationMs = Date.now() - startTime

      // AI 로그 저장
      aiLogRepository.create({
        queryLogId,
        promptSent: messages[messages.length - 1].content as string, // user prompt
        rawResponse: JSON.stringify(llmResponse),
        tokenUsed: llmResponse.usage?.totalTokens
      })

      // Evidence 로그 저장 및 dbId 할당
      response.evidence = response.evidence.map(ev => {
        const dbId = evidenceLogRepository.create({
          queryLogId,
          source: ev.source,
          title: ev.title,
          content: ev.content,
          score: ev.score
        })
        return { ...ev, dbId }
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

  // Evidence 개별 피드백 저장 (파라미터 업데이트는 하지 않음)
  ipcMain.handle('evidence:feedback', async (_event, data: EvidenceFeedbackRequest) => {
    adaptiveParamsRepository.createFeedback(
      data.userId,
      data.queryLogId,
      data.evidenceLogId,
      data.feedback,
      data.questionType
    )
    return { success: true }
  })

  // 한 질문의 모든 evidence 피드백을 배치로 제출 → 집계 후 파라미터 업데이트
  ipcMain.handle('evidence:submitAll', async (_event, data: {
    userId: string
    queryLogId: number
    questionType: import('../../shared/types').QuestionType
    feedbacks: { evidenceLogId: number; feedback: import('../../shared/types').EvidenceFeedbackType }[]
    totalEvidenceCount: number
  }) => {
    // 1. 각 피드백을 개별 저장
    for (const item of data.feedbacks) {
      adaptiveParamsRepository.createFeedback(
        data.userId,
        data.queryLogId,
        item.evidenceLogId,
        item.feedback,
        data.questionType
      )
    }

    // 2. 피드백 배열을 집계하여 파라미터 한 번만 업데이트
    const feedbackTypes = data.feedbacks.map(f => f.feedback)
    const updatedParams = updateParamsFromBatch(
      data.userId, 
      data.questionType, 
      feedbackTypes,
      data.totalEvidenceCount
    )

    return { success: true, updatedParams }
  })

  // 사용자의 현재 적응형 파라미터 조회
  ipcMain.handle('adaptive:getParams', (_event, userId: string) => {
    return adaptiveParamsRepository.getAllByUser(userId)
  })
}
