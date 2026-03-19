// 데이터 소스 타입
export type DataSource = 'git' | 'meetings' | 'tasks' | 'documents'

// 툴 타입
export type ToolType =
  | 'git-progress-analyzer'
  | 'meeting-summarizer'
  | 'task-status-query'
  | 'cross-source-summary'
  | 'document-search'
  | 'report-generator'

// Evidence 아이템 (retrieval 결과 단위)
export interface EvidenceItem {
  id: string
  source: DataSource
  title: string
  content: string
  date?: string
  score: number
  metadata?: Record<string, unknown>
}

// 질의 요청
export interface QueryRequest {
  projectId: number
  sources: DataSource[]
  tool: ToolType
  prompt: string
}

// 질의 응답
export interface QueryResponse {
  summary: string
  evidence: EvidenceItem[]
  suggestedActions: string[]
  rawResponse?: string
}

// 프로젝트
export interface Project {
  id: number
  name: string
  description?: string
  gitPath?: string
  createdAt: string
  updatedAt: string
}

// 회의록
export interface Meeting {
  id: number
  projectId: number
  title: string
  content: string
  date: string
  createdAt: string
}

// 태스크
export interface Task {
  id: number
  projectId: number
  meetingId?: number
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done'
  assignee?: string
  priority: 'low' | 'medium' | 'high'
  createdAt: string
  updatedAt: string
}
