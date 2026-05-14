import { IpcMain } from 'electron'
import { queryLogRepository, aiLogRepository, evidenceLogRepository, projectRepository, meetingRepository, taskRepository, documentRepository } from '../database/repositories'
import type { EvidenceItem, QueryRequest, QueryResponse } from '../../shared/types'
import { getRecentCommits, isValidGitRepo } from '../services/gitService'
import { generateProjectAnalysis } from '../services/llmService'

const toolRequiredSources: Record<QueryRequest['tool'], QueryRequest['sources'][number][]> = {
  'git-progress-analyzer': ['git'],
  'meeting-summarizer': ['meetings'],
  'task-status-query': ['tasks'],
  'cross-source-summary': ['git', 'meetings', 'tasks'],
  'document-search': ['documents'],
  'report-generator': ['git', 'meetings', 'tasks']
}

function normalizeMeetingContent(rawContent: unknown): string {
  if (typeof rawContent !== 'string' || !rawContent.trim()) return ''

  try {
    const parsed = JSON.parse(rawContent) as {
      content?: string
      attendees?: string[]
      decisions?: string[]
      todos?: string[]
    }

    const lines = [
      parsed.content ? `내용: ${parsed.content}` : null,
      parsed.attendees?.length ? `참석자: ${parsed.attendees.join(', ')}` : null,
      parsed.decisions?.length ? `결정사항: ${parsed.decisions.join(' / ')}` : null,
      parsed.todos?.length ? `TODO: ${parsed.todos.join(' / ')}` : null
    ].filter((line): line is string => Boolean(line))

    return lines.join('\n') || rawContent
  } catch {
    return rawContent
  }
}

function buildEvidence(request: QueryRequest): EvidenceItem[] {
  const evidence: EvidenceItem[] = []
  const project = projectRepository.getById(request.projectId)
  const projectGitPath = typeof project?.git_path === 'string' ? project.git_path : ''

  if (request.sources.includes('git') && projectGitPath && isValidGitRepo(projectGitPath)) {
    const commits = getRecentCommits(projectGitPath, 6)
    commits.forEach((commit, index) => {
      evidence.push({
        id: `git-${commit.hash}`,
        source: 'git',
        title: commit.message,
        content: `${commit.author}가 ${commit.date}에 남긴 커밋입니다. hash=${commit.shortHash}`,
        date: commit.date,
        score: 1 - index * 0.08,
        metadata: {
          hash: commit.hash,
          shortHash: commit.shortHash
        }
      })
    })
  }

  if (request.sources.includes('meetings')) {
    const meetings = meetingRepository.getByProject(request.projectId).slice(0, 5)
    meetings.forEach((meeting, index) => {
      evidence.push({
        id: `meeting-${meeting.id}`,
        source: 'meetings',
        title: String(meeting.title ?? `회의록 ${meeting.id}`),
        content: normalizeMeetingContent(meeting.content),
        date: typeof meeting.date === 'string' ? meeting.date : undefined,
        score: 0.92 - index * 0.07,
        metadata: {
          meetingId: meeting.id
        }
      })
    })
  }

  if (request.sources.includes('tasks')) {
    const tasks = taskRepository.getIncomplete(request.projectId).slice(0, 5)
    tasks.forEach((task, index) => {
      const status = String(task.status ?? 'todo')
      const assignee = task.assignee ? ` / 담당: ${String(task.assignee)}` : ''
      const priority = task.priority ? ` / 우선순위: ${String(task.priority)}` : ''

      evidence.push({
        id: `task-${task.id}`,
        source: 'tasks',
        title: String(task.title ?? `태스크 ${task.id}`),
        content: `상태: ${status}${assignee}${priority}${task.description ? ` / 설명: ${String(task.description)}` : ''}`,
        date: typeof task.updated_at === 'string' ? task.updated_at : undefined,
        score: 0.88 - index * 0.06,
        metadata: {
          taskId: task.id
        }
      })
    })
  }

  if (request.sources.includes('documents')) {
    const documents = documentRepository.getByProject(request.projectId).slice(0, 5)
    documents.forEach((document, index) => {
      evidence.push({
        id: `document-${document.id}`,
        source: 'documents',
        title: String(document.file_name ?? `문서 ${document.id}`),
        content: `파일 경로: ${String(document.file_path ?? '')} / 형식: ${String(document.file_type ?? 'unknown')}`,
        date: typeof document.updated_at === 'string' ? document.updated_at : undefined,
        score: 0.8 - index * 0.05,
        metadata: {
          documentId: document.id
        }
      })
    })
  }

  return evidence.sort((a, b) => b.score - a.score).slice(0, 12)
}

export function registerQueryHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('query:run', async (_event, request: QueryRequest): Promise<QueryResponse> => {
    const startTime = Date.now()
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

    // query_log 저장
    const queryLogId = queryLogRepository.create({
      projectId: request.projectId,
      sources: JSON.stringify(request.sources),
      tool: request.tool,
      prompt: request.prompt
    })

    try {
      const projectName = typeof project?.name === 'string' ? project.name : `Project ${request.projectId}`
      const evidence = buildEvidence(request)

      const generated = await generateProjectAnalysis({
        projectName,
        tool: request.tool,
        prompt: request.prompt,
        evidence
      })

      const response: QueryResponse = {
        summary: generated.summary,
        evidence,
        suggestedActions:
          generated.suggestedActions.length > 0
            ? generated.suggestedActions
            : ['근거 데이터를 바탕으로 다음 작업 우선순위를 한 번 더 점검하세요.'],
        rawResponse: generated.rawResponse
      }

      if (evidence.length > 0) {
        evidenceLogRepository.createBatch(
          evidence.map((item) => ({
            queryLogId,
            source: item.source,
            title: item.title,
            content: item.content,
            score: item.score,
            metadata: item.metadata ? JSON.stringify(item.metadata) : undefined
          }))
        )
      }

      const durationMs = Date.now() - startTime

      aiLogRepository.create({
        queryLogId,
        model: generated.model,
        promptSent: request.prompt,
        rawResponse: generated.rawResponse,
        tokenUsed: generated.tokenUsed
      })

      queryLogRepository.updateStatus(queryLogId, 'success', JSON.stringify(response), durationMs)

      return response
    } catch (error) {
      const durationMs = Date.now() - startTime
      const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'

      aiLogRepository.create({
        queryLogId,
        promptSent: request.prompt,
        error: message
      })

      queryLogRepository.updateStatus(queryLogId, 'error', message, durationMs)
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
