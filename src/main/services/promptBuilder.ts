/**
 * 프롬프트 빌더 모듈
 *
 * 전처리된 키워드와 청킹된 컨텍스트를 조합하여
 * LLM에 전송할 최종 프롬프트를 구성합니다.
 *
 * 시스템 프롬프트는 최대한 간결하게 작성하여 토큰을 절약합니다.
 */

import { preprocessPrompt } from './promptPreprocessor'
import { buildContext, estimateTokens, type ContextBuildResult } from './contextChunker'

// ── 시스템 프롬프트 템플릿 ───────────────────────────────────────
// 간결한 지시로 토큰 절약 (불필요한 수식어 제거)

const SYSTEM_PROMPTS = {
  /** 프로젝트 정보 기반 일반 질의 */
  general: `프로젝트 관리 AI 어시스턴트. 아래 참고자료 기반으로 답변. 자료에 없으면 "해당 정보 없음" 표기. 간결하게 답변.`,

  /** 태스크 관련 질의 */
  task: `태스크 관리 AI. 아래 태스크 자료 기반 답변. 상태·우선순위·마감일 포함. 자료 외 추측 금지.`,

  /** 회의록 요약·검색 */
  meeting: `회의록 분석 AI. 아래 회의 자료 기반 답변. 핵심 결정사항·액션아이템 중심. 자료 외 추측 금지.`,

  /** 문서 내용 질의 */
  document: `문서 분석 AI. 아래 문서 내용 기반 답변. 자료 외 추측 금지.`,
} as const

export type PromptType = keyof typeof SYSTEM_PROMPTS

// ── 타입 정의 ────────────────────────────────────────────────────

export interface PromptBuildInput {
  /** 사용자 원본 질문 */
  userQuestion: string

  /** 검색된 소스 데이터 */
  sources: {
    type: 'meeting' | 'task' | 'document' | 'git'
    id: number | string
    title: string
    content: string
  }[]

  /** 프롬프트 타입 (자동 감지 또는 수동 지정) */
  promptType?: PromptType

  /** 컨텍스트 옵션 (기본값 사용 시 생략) */
  contextOptions?: {
    chunkSize?: number
    overlap?: number
    topK?: number
    maxContextChars?: number
  }
}

export interface PromptBuildResult {
  /** LLM에 전송할 최종 프롬프트 */
  finalPrompt: string

  /** 시스템 프롬프트 (별도 전송 필요 시) */
  systemPrompt: string

  /** 사용자 메시지 (별도 전송 필요 시) */
  userMessage: string

  /** 추출된 키워드 (로그용) */
  keywords: string[]

  /** 컨텍스트 빌드 결과 (evidence 로그 저장용) */
  contextResult: ContextBuildResult

  /** 최종 프롬프트 통계 */
  stats: {
    systemPromptChars: number
    contextChars: number
    questionChars: number
    totalChars: number
    estimatedTokens: number
  }
}

// ── 프롬프트 타입 자동 감지 ──────────────────────────────────────

/**
 * 키워드를 기반으로 질문의 의도를 파악하여 적절한 프롬프트 타입을 반환합니다.
 */
function detectPromptType(keywords: string[]): PromptType {
  const text = keywords.join(' ').toLowerCase()

  if (/태스크|작업|할일|todo|task|진행|마감|담당/.test(text)) return 'task'
  if (/회의|미팅|meeting|논의|결정|안건/.test(text)) return 'meeting'
  if (/문서|파일|코드|document|소스|readme/.test(text)) return 'document'

  return 'general'
}

// ── 메인 함수: 프롬프트 빌드 ─────────────────────────────────────

/**
 * 사용자 질문과 검색된 소스로부터 LLM 전송용 최종 프롬프트를 빌드합니다.
 *
 * 전체 흐름:
 * 1. 사용자 질문 전처리 (키워드 추출)
 * 2. 소스 데이터 청킹 & 스코어링 & Top-K 선택
 * 3. 시스템 프롬프트 + 컨텍스트 + 질문 조립
 *
 * @example
 * const result = buildPrompt({
 *   userQuestion: "현재 진행 중인 태스크 알려줘",
 *   sources: [
 *     { type: 'task', id: 1, title: 'UI 구현', content: '로그인 화면...' },
 *     { type: 'meeting', id: 5, title: '4월 회의', content: '태스크 배분...' },
 *   ],
 * })
 * // result.finalPrompt → LLM에 전송
 * // result.contextResult.selectedChunks → evidence_logs에 저장
 */
export function buildPrompt(input: PromptBuildInput): PromptBuildResult {
  // Step 1: 전처리
  const { keywords, cleanedQuery } = preprocessPrompt(input.userQuestion)

  // Step 2: 컨텍스트 빌드 (청킹 + 스코어링 + Top-K)
  const contextResult = buildContext(input.sources, keywords, input.contextOptions)

  // Step 3: 프롬프트 타입 결정
  const promptType = input.promptType ?? detectPromptType(keywords)
  const systemPrompt = SYSTEM_PROMPTS[promptType]

  // Step 4: 최종 프롬프트 조립
  let userMessage: string

  if (contextResult.selectedChunks.length > 0) {
    userMessage = `## 참고 자료\n${contextResult.contextBlock}\n\n## 질문\n${cleanedQuery}`
  } else {
    userMessage = `## 참고 자료\n(관련 참고 자료가 없습니다.)\n\n## 질문\n${cleanedQuery}`
  }

  const finalPrompt = `${systemPrompt}\n\n${userMessage}`

  // Step 5: 통계 계산
  const stats = {
    systemPromptChars: systemPrompt.length,
    contextChars: contextResult.stats.totalChars,
    questionChars: cleanedQuery.length,
    totalChars: finalPrompt.length,
    estimatedTokens: estimateTokens(finalPrompt),
  }

  return {
    finalPrompt,
    systemPrompt,
    userMessage,
    keywords,
    contextResult,
    stats,
  }
}

/**
 * 시스템 프롬프트와 사용자 메시지를 별도로 반환합니다.
 * OpenAI API처럼 role 기반 메시지를 사용하는 경우에 활용합니다.
 *
 * @example
 * const messages = buildChatMessages({
 *   userQuestion: "회의 내용 요약해줘",
 *   sources: [...],
 * })
 * // → [{ role: 'system', content: '...' }, { role: 'user', content: '...' }]
 */
export function buildChatMessages(input: PromptBuildInput): {
  messages: { role: 'system' | 'user'; content: string }[]
  keywords: string[]
  contextResult: ContextBuildResult
  stats: PromptBuildResult['stats']
} {
  const result = buildPrompt(input)

  return {
    messages: [
      { role: 'system', content: result.systemPrompt },
      { role: 'user', content: result.userMessage },
    ],
    keywords: result.keywords,
    contextResult: result.contextResult,
    stats: result.stats,
  }
}
