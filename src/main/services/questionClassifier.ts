/**
 * 질문 유형 분류 모듈
 *
 * 사용자 질문을 4가지 유형으로 분류합니다:
 *   - short_simple:  짧고 간단한 질문
 *   - short_complex: 짧고 복잡한 질문
 *   - long_simple:   길고 간단한 질문
 *   - long_complex:  길고 복잡한 질문
 *
 * 길이는 토큰 수 기반, 복잡도는 규칙 기반 heuristic으로 판단합니다.
 */

import { estimateTokens } from './contextChunker'
import type { DataSource, QuestionType, QuestionDomain, QuestionLength, QuestionComplexity } from '../../shared/types'

// ── 설정 상수 ────────────────────────────────────────────────────

/** 짧은/긴 질문 경계 토큰 수 (한국어 약 80글자) */
const LENGTH_THRESHOLD_TOKENS = 50

// ── 복잡도 판단용 키워드 ─────────────────────────────────────────

/** 비교·분석 키워드 */
const COMPARISON_KEYWORDS = [
  '비교', '차이', '차이점', 'vs', '반면', '대비', '장단점', '비교해', '비교하고'
]

/** 전제 조건 키워드 */
const CONDITION_KEYWORDS = [
  '만약', '가정', '경우에', '조건', '상황에서', '전제', '가정하에', '한다면'
]

/** 다단계 요청 키워드 */
const MULTI_STEP_KEYWORDS = [
  '그리고', '또한', '뿐만 아니라', '이후에', '그 다음', '먼저', '그런 다음'
]

/** 분석·추론 키워드 */
const ANALYSIS_KEYWORDS = [
  '분석', '추론', '원인', '이유', '왜', '근거', '영향', '관계',
  '평가', '판단', '예측', '추정'
]

// ── 길이 분류 ────────────────────────────────────────────────────

/**
 * 질문의 토큰 수를 기반으로 길이를 분류합니다.
 *
 * @param question 사용자 질문 텍스트
 * @returns 'short' (50토큰 이하) 또는 'long' (50토큰 초과)
 */
export function classifyLength(question: string): QuestionLength {
  const tokens = estimateTokens(question)
  return tokens <= LENGTH_THRESHOLD_TOKENS ? 'short' : 'long'
}

// ── 복잡도 분류 ──────────────────────────────────────────────────

/**
 * 규칙 기반 heuristic으로 질문의 복잡도를 판단합니다.
 *
 * 판단 기준 (indicator 2개 이상이면 complex):
 *   1. 비교·분석 키워드 포함 여부
 *   2. 전제 조건 키워드 포함 여부
 *   3. 다단계 요청 (접속사 키워드 또는 물음표 2개 이상)
 *   4. 분석·추론 키워드 포함 여부
 *   5. 절(clause) 수 3개 이상
 */
export function classifyComplexity(question: string): QuestionComplexity {
  let indicators = 0

  const q = question.toLowerCase()

  if (COMPARISON_KEYWORDS.some(kw => q.includes(kw))) indicators++
  if (CONDITION_KEYWORDS.some(kw => q.includes(kw))) indicators++
  if (MULTI_STEP_KEYWORDS.some(kw => q.includes(kw)) || (question.match(/\?/g) || []).length >= 2) indicators++
  if (ANALYSIS_KEYWORDS.some(kw => q.includes(kw))) indicators++

  // 절(clause) 수: 쉼표, 마침표, 줄바꿈 기준 분리
  const clauseCount = question.split(/[,.\n]/).filter(s => s.trim().length > 0).length
  if (clauseCount >= 3) indicators++

  return indicators >= 2 ? 'complex' : 'simple'
}

// ── 통합 분류 ────────────────────────────────────────────────────

/**
 * 질문을 길이, 복잡도, 선택 데이터 소스 도메인 기준으로 분류합니다.
 *
 * @example
 * classifyQuestion("현재 태스크 알려줘", ['tasks'])
 * // → 'short_simple_document'
 *
 * classifyQuestion("지난 3주간 커밋 분석해서 팀원별 기여도 비교하고 병목 파악해줘")
 * // → 'long_complex'
 */
export function classifyQuestion(question: string, sources: DataSource[] = []): QuestionType {
  const length = classifyLength(question)
  const complexity = classifyComplexity(question)

  let domain: QuestionDomain
  if (sources.length === 1) {
    const map: Record<DataSource, QuestionDomain> = {
      git: 'git',
      meetings: 'meeting',
      documents: 'document',
      tasks: 'document'
    }
    domain = map[sources[0]]
  } else {
    domain = 'mixed'
  }

  return `${length}_${complexity}_${domain}` as QuestionType
}
