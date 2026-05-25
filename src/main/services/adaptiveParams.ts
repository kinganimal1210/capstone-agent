/**
 * 적응형 청킹/트런케이션 파라미터 관리 모듈
 *
 * 사용자별 + 질문유형별로 청킹 파라미터를 관리하고,
 * evidence 피드백에 따라 파라미터를 자동 조절합니다.
 *
 * 학습 원리:
 *   한 질문에 대한 여러 evidence 피드백을 배치로 집계한 뒤
 *   긍정/부정 비율에 따라 한 번만 파라미터를 업데이트합니다.
 *
 *   score = (interested 수 - not_interested 수) / 전체 evidence 수
 *   → score > 0: 전략 확대 방향 (topK, maxContextChars 증가)
 *   → score < 0: 전략 축소 방향 (topK, maxContextChars 감소, overlap 증가)
 *   → score = 0: 변경 없음
 */

import type { QuestionType, ChunkingParams, EvidenceFeedbackType } from '../../shared/types'
import { adaptiveParamsRepository } from '../database/repositories'

// ── 기본값 ───────────────────────────────────────────────────────

/** 질문 유형별 초기 기본 파라미터 */
const DEFAULT_PARAMS: Record<QuestionType, ChunkingParams> = {
  short_simple:  { chunkSize: 400, overlap: 60,  topK: 3, maxContextChars: 2000 },
  short_complex: { chunkSize: 500, overlap: 80,  topK: 5, maxContextChars: 3000 },
  long_simple:   { chunkSize: 500, overlap: 60,  topK: 4, maxContextChars: 2500 },
  long_complex:  { chunkSize: 600, overlap: 100, topK: 7, maxContextChars: 4000 },
}

// ── 파라미터 범위 제한 ───────────────────────────────────────────

const PARAM_BOUNDS = {
  chunkSize:       { min: 200,  max: 1000 },
  overlap:         { min: 20,   max: 200 },
  topK:            { min: 1,    max: 15 },
  maxContextChars: { min: 1000, max: 8000 },
}

/** 학습률 */
const LEARNING_RATE = 0.1

// ── 핵심 함수 ────────────────────────────────────────────────────

/**
 * 사용자의 질문 유형에 맞는 청킹 파라미터를 조회합니다.
 * DB에 저장된 값이 없으면 질문 유형별 기본값을 반환합니다.
 */
export function getParams(userId: string, questionType: QuestionType): ChunkingParams {
  const saved = adaptiveParamsRepository.getByUserAndType(userId, questionType)

  if (saved) {
    return {
      chunkSize: saved.chunk_size as number,
      overlap: saved.overlap as number,
      topK: saved.top_k as number,
      maxContextChars: saved.max_context_chars as number,
    }
  }

  return { ...DEFAULT_PARAMS[questionType] }
}

/**
 * 기본 파라미터를 반환합니다. (비교/로그용)
 */
export function getDefaultParams(questionType: QuestionType): ChunkingParams {
  return { ...DEFAULT_PARAMS[questionType] }
}

/**
 * 값을 min/max 범위로 제한합니다.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * 여러 evidence에 대한 피드백을 배치로 집계하여 파라미터를 한 번만 업데이트합니다.
 *
 * @param feedbacks 한 질문의 모든 evidence에 대한 피드백 배열
 *
 * @param feedbacks          사용자가 실제로 피드백한 항목들의 배열
 * @param totalEvidenceCount 전체 evidence 수 (미응답 포함)
 *
 * @example
 * // evidence 10개 중 5개 interested, 2개 not_interested, 3개 미응답
 * updateParamsFromBatch('user1', 'short_simple',
 *   ['interested', 'interested', 'interested', 'interested', 'interested',
 *    'not_interested', 'not_interested'],
 *   10  // 전체 evidence 수
 * )
 * // → score = (5 - 2) / 10 = 0.3 → 소폭 확대 방향
 */
export function updateParamsFromBatch(
  userId: string,
  questionType: QuestionType,
  feedbacks: EvidenceFeedbackType[],
  totalEvidenceCount: number
): ChunkingParams {
  const current = getParams(userId, questionType)

  // 전체 evidence 수가 0이거나 피드백이 없으면 변경 없음
  const total = Math.max(totalEvidenceCount, feedbacks.length)
  if (total === 0 || feedbacks.length === 0) return current

  // 집계: 전체 evidence 수를 분모로 사용 (미응답 = 중립)
  const interestedCount = feedbacks.filter(f => f === 'interested').length
  const notInterestedCount = feedbacks.length - interestedCount
  const score = (interestedCount - notInterestedCount) / total

  // score가 0이면 변경 없음
  if (score === 0) return current

  const α = LEARNING_RATE

  // score의 부호와 크기에 비례하여 조절
  // score > 0: 확대 (topK↑, maxContextChars↑)
  // score < 0: 축소 (topK↓, maxContextChars↓, overlap↑)
  current.topK = clamp(
    Math.round(current.topK + α * score * current.topK),
    PARAM_BOUNDS.topK.min,
    PARAM_BOUNDS.topK.max
  )
  current.maxContextChars = clamp(
    Math.round(current.maxContextChars + α * score * current.maxContextChars),
    PARAM_BOUNDS.maxContextChars.min,
    PARAM_BOUNDS.maxContextChars.max
  )

  // 부정 피드백 비율이 높을 때만 overlap 증가 (정밀도 향상)
  if (score < 0) {
    current.overlap = clamp(
      Math.round(current.overlap + α * Math.abs(score) * current.overlap),
      PARAM_BOUNDS.overlap.min,
      PARAM_BOUNDS.overlap.max
    )
  }

  // DB에 저장
  adaptiveParamsRepository.upsert(userId, questionType, current)

  return current
}

