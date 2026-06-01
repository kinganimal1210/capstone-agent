import { IpcMain } from 'electron'
import { queryLogRepository, aiLogRepository, evidenceLogRepository, meetingRepository, taskRepository, documentRepository, projectRepository, adaptiveParamsRepository, scoringWeightsRepository } from '../database/repositories'
import type { QueryRequest, QueryResponse, EvidenceFeedbackRequest, ToolType, DataSource, EvidenceItem } from '../../shared/types'
import { buildChatMessages, type PromptBuildInput } from '../services/promptBuilder'
import { callLLM, loadConfigFromEnv, LLMConfig, LLMProvider } from '../services/llmService'
import { getRecentCommits, getRepoInfo, isValidGitRepo } from '../services/gitService'
import { classifyQuestion } from '../services/questionClassifier'
import { getParams, getWeights, updateParamsFromBatch, updateWeightsFromFeedback } from '../services/adaptiveParams'
import { preprocessPrompt } from '../services/promptPreprocessor'
import { getResolvedLLMSettings } from '../services/settingsService'
import * as dotenv from 'dotenv'
import * as path from 'path'

// .env 로드 (실제 빌드 환경에 맞게 경로 조정 필요할 수 있음)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const toolRequiredSources: Record<ToolType, DataSource[]> = {
  'git-progress-analyzer': ['git'],
  'meeting-summarizer': ['meetings'],
  'task-status-query': ['tasks'],
  'cross-source-summary': [],
  'document-search': ['documents'],
  'report-generator': []
}

function validateRequest(request: QueryRequest) {
  const project = projectRepository.getById(request.projectId)
  const projectGitPath = typeof project?.git_path === 'string' ? project.git_path : ''

  if (!request.prompt.trim()) {
    throw new Error('질문을 입력하세요.')
  }

  const requiredSources = toolRequiredSources[request.tool] ?? []
  const missingSources = requiredSources.filter((source) => !request.sources.includes(source))
  if (missingSources.length > 0) {
    throw new Error(`선택한 도구에 필요한 데이터 소스가 부족합니다: ${missingSources.join(', ')}`)
  }

  if (request.sources.includes('git')) {
    if (!projectGitPath) {
      throw new Error('Git 데이터 소스를 사용하려면 Settings에서 기본 Git 저장소 경로를 먼저 저장하세요.')
    }
    if (!isValidGitRepo(projectGitPath)) {
      throw new Error('저장된 Git 경로가 유효한 저장소가 아닙니다. Settings에서 경로를 다시 확인하세요.')
    }
  }

  return { project, projectGitPath }
}

interface CollectSourcesResult {
  sources: PromptBuildInput['sources']
  debugData: {
    retrievedChunks: Record<string, unknown>[]
    searchMode: string
  }
}

function collectSources(request: QueryRequest, projectGitPath: string): CollectSourcesResult {
  const sources: PromptBuildInput['sources'] = []
  const debugData = { retrievedChunks: [] as Record<string, unknown>[], searchMode: 'fts' }

  if (request.sources.includes('git') && projectGitPath) {
    try {
      const repoInfo = getRepoInfo(projectGitPath)
      sources.push({
        type: 'git',
        id: `repo-${repoInfo.currentBranch}`,
        title: `Git 저장소 요약 (${repoInfo.currentBranch})`,
        content: [
          `저장소 경로: ${repoInfo.path}`,
          `현재 브랜치: ${repoInfo.currentBranch}`,
          `전체 커밋 수: ${repoInfo.totalCommits}`,
          `마지막 커밋 날짜: ${repoInfo.lastCommitDate}`,
          repoInfo.remoteUrl ? `원격 저장소: ${repoInfo.remoteUrl}` : null
        ].filter(Boolean).join('\n')
      })

      const commits = getRecentCommits(projectGitPath, 50)
      debugData.retrievedChunks = commits.map((commit) => ({
        source: 'git',
        hash: commit.hash,
        message: commit.message,
        author: commit.author,
        date: commit.date
      }))
      debugData.searchMode = 'git_log'
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

  if (request.sources.includes('meetings')) {
    const meetings = meetingRepository.getByProject(request.projectId)
    meetings.forEach(m => sources.push({ type: 'meeting', id: m.id as number, title: `${m.title as string} (일자: ${(m.date as string).substring(0, 10)})`, content: m.content as string }))
  }

  if (request.sources.includes('tasks')) {
    const tasks = taskRepository.getByProject(request.projectId)
    tasks.forEach(t => sources.push({
      type: 'task',
      id: t.id as number,
      title: `${t.title as string} (상태: ${t.status}, 마감: ${t.due_date || '없음'})`,
      content: `상태: ${t.status as string}, 우선순위: ${t.priority as string}, 담당자: ${t.assignee as string || '없음'}, 세부: ${t.description as string || ''}`
    }))
  }

  if (request.sources.includes('documents')) {
    const { keywords } = preprocessPrompt(request.prompt)
    let matchedChunks: Record<string, unknown>[] = []
    if (keywords.length > 0) {
      matchedChunks = documentRepository.searchChunks(request.projectId, keywords, 30)
    }

    if (matchedChunks.length === 0) {
      matchedChunks = documentRepository.getChunksByProject(request.projectId, 30)
    }

    debugData.retrievedChunks = matchedChunks
    debugData.searchMode = (matchedChunks[0] as any)?.searchMode || 'fallback_recent'
    matchedChunks.forEach((c: any) => {
      const contentStr = c.content as string
      const lines = contentStr.split('\n').map(line => line.trim())
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

  return { sources, debugData }
}

async function executeLLM(messages: any[]) {
  const settings = getResolvedLLMSettings()
  let provider: LLMProvider | null = null
  let config: LLMConfig | null = null

  if (settings.apiKey) {
    provider = settings.provider as LLMProvider
    config = {
      provider: settings.provider as LLMProvider,
      model: settings.model,
      apiKey: settings.apiKey,
    }
  } else if (process.env.OPENAI_API_KEY) {
    provider = 'openai'
  } else if (process.env.GEMINI_API_KEY) {
    provider = 'gemini'
  } else if (process.env.CLAUDE_API_KEY) {
    provider = 'claude'
  }

  if (!provider) {
    throw new Error('API 키가 설정되지 않았습니다. Settings에서 설정하거나 .env 파일을 확인하세요.')
  }

  if (!config) {
    config = loadConfigFromEnv(provider)
  }

  return await callLLM(messages, config)
}

function saveQueryLogs(
  queryLogId: number,
  llmResponse: any,
  contextResult: any,
  messages: any[],
  durationMs: number,
  requestDetails: any
): QueryResponse {
  
  aiLogRepository.create({
    queryLogId,
    promptSent: messages[messages.length - 1].content as string,
    rawResponse: JSON.stringify(llmResponse),
    tokenUsed: llmResponse.usage?.totalTokens
  })

  const evidence = contextResult.selectedChunks.map((chunk: any) => {
    const dbId = evidenceLogRepository.create({
      queryLogId,
      source: chunk.sourceType as any,
      title: chunk.sourceTitle,
      content: chunk.text,
      score: chunk.score,
      metadata: JSON.stringify({ features: chunk.features })
    })
    return {
      id: `${chunk.sourceType}-${chunk.sourceId}`,
      dbId,
      source: chunk.sourceType as any,
      title: chunk.sourceTitle,
      content: chunk.text,
      score: chunk.score,
      metadata: { features: chunk.features }
    }
  })

  const response: QueryResponse = {
    queryLogId,
    summary: llmResponse.content,
    evidence,
    suggestedActions: [],
    rawResponse: JSON.stringify(requestDetails)
  }

  queryLogRepository.updateStatus(queryLogId, 'success', JSON.stringify(response), durationMs)
  return response
}

export function registerQueryHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('query:run', async (_event, request: QueryRequest): Promise<QueryResponse> => {
    const startTime = Date.now()
    
    // 1. 유효성 검사
    const { projectGitPath } = validateRequest(request)

    // query_log 저장
    const queryLogId = queryLogRepository.create({
      projectId: request.projectId,
      sources: JSON.stringify(request.sources),
      tool: request.tool,
      prompt: request.prompt
    })

    try {
      const { keywords } = preprocessPrompt(request.prompt)

      // 2. 소스 데이터 수집
      const { sources, debugData } = collectSources(request, projectGitPath)

      // 3. 질문 유형 분류 + 적응형 파라미터 조회
      const questionType = classifyQuestion(request.prompt, request.sources)
      const userId = (request as any).userId ?? 'default'
      const adaptiveContextOptions = getParams(userId, questionType)
      const scoringWeights = getWeights(userId, questionType)

      // 4. RAG 파이프라인 (프롬프트 & 컨텍스트 빌드)
      const { messages, contextResult } = buildChatMessages({
        userQuestion: request.prompt,
        sources,
        contextOptions: {
          ...adaptiveContextOptions,
          scoringWeights
        }
      })

      // 5. LLM 호출
      const llmResponse = await executeLLM(messages)

      const durationMs = Date.now() - startTime

      // 6. 로그 저장 및 응답 반환
      return saveQueryLogs(
        queryLogId,
        llmResponse,
        contextResult,
        messages,
        durationMs,
        { 
          questionType, 
          userId, 
          adaptiveContextOptions, 
          debugInfo: { 
            extractedKeywords: keywords,
            retrievedChunks: debugData.retrievedChunks.length,
            searchMode: debugData.searchMode,
            contextChars: contextResult.stats.totalChars,
            scoringWeights,
            selectedChunks: contextResult.selectedChunks.map(c => ({
              rank: c.score,
              fileName: c.sourceTitle.split(' (')[0],
              title: c.sourceTitle,
              features: c.features
            }))
          } 
        }
      )
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

  // Evidence 개별 피드백 저장
  ipcMain.handle('evidence:feedback', async (_event, data: EvidenceFeedbackRequest) => {
    adaptiveParamsRepository.createFeedback(
      data.userId,
      data.queryLogId,
      data.evidenceLogId,
      data.feedback,
      data.questionType,
      data.chunkFeatures
    )
    return { success: true }
  })

  // 피드백 배치 처리
  ipcMain.handle('evidence:submitAll', async (_event, data: {
    userId: string
    queryLogId: number
    questionType: import('../../shared/types').QuestionType
    feedbacks: { evidenceLogId: number; feedback: import('../../shared/types').EvidenceFeedbackType; chunkFeatures?: import('../../shared/types').ChunkFeatures }[]
    totalEvidenceCount: number
  }) => {
    for (const item of data.feedbacks) {
      adaptiveParamsRepository.createFeedback(
        data.userId,
        data.queryLogId,
        item.evidenceLogId,
        item.feedback,
        data.questionType,
        item.chunkFeatures
      )
    }

    const feedbackTypes = data.feedbacks.map(f => f.feedback)
    const updatedParams = updateParamsFromBatch(
      data.userId, 
      data.questionType, 
      feedbackTypes,
      data.totalEvidenceCount
    )
    const updatedWeights = updateWeightsFromFeedback(
      data.userId,
      data.questionType,
      data.feedbacks.map((item) => ({
        feedback: item.feedback,
        features: item.chunkFeatures
      })),
      data.totalEvidenceCount
    )

    return { success: true, updatedParams, updatedWeights }
  })

  // 사용자 파라미터 조회
  ipcMain.handle('adaptive:getParams', (_event, userId: string) => {
    return adaptiveParamsRepository.getAllByUser(userId)
  })

  // 사용자 학습 데이터 초기화 (청킹 파라미터 + 스코어링 가중치 + 피드백 로그)
  ipcMain.handle('adaptive:reset', (_event, userId: string) => {
    adaptiveParamsRepository.resetUser(userId)
    scoringWeightsRepository.resetUser(userId)
    return { success: true }
  })
}
