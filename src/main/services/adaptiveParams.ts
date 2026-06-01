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

import type {
  BayesianWeights,
  ChunkFeatures,
  ChunkingParams,
  EvidenceFeedbackType,
  QuestionType,
  ScoringWeights
} from '../../shared/types'
import { adaptiveParamsRepository, scoringWeightsRepository } from '../database/repositories'

// ── 기본값 ───────────────────────────────────────────────────────

/** 질문 유형별 초기 기본 파라미터 */
const DEFAULT_PARAMS: Record<QuestionType, ChunkingParams> = {
  short_simple_git: { chunkSize: 400, overlap: 60, topK: 3, maxContextChars: 2000 },
  short_simple_meeting: { chunkSize: 400, overlap: 60, topK: 3, maxContextChars: 2000 },
  short_simple_document: { chunkSize: 400, overlap: 60, topK: 3, maxContextChars: 2000 },
  short_simple_mixed: { chunkSize: 400, overlap: 60, topK: 3, maxContextChars: 2000 },
  short_complex_git: { chunkSize: 500, overlap: 80, topK: 5, maxContextChars: 3000 },
  short_complex_meeting: { chunkSize: 500, overlap: 80, topK: 5, maxContextChars: 3000 },
  short_complex_document: { chunkSize: 500, overlap: 80, topK: 5, maxContextChars: 3000 },
  short_complex_mixed: { chunkSize: 500, overlap: 80, topK: 5, maxContextChars: 3000 },
  long_simple_git: { chunkSize: 500, overlap: 60, topK: 4, maxContextChars: 2500 },
  long_simple_meeting: { chunkSize: 500, overlap: 60, topK: 4, maxContextChars: 2500 },
  long_simple_document: { chunkSize: 500, overlap: 60, topK: 4, maxContextChars: 2500 },
  long_simple_mixed: { chunkSize: 500, overlap: 60, topK: 4, maxContextChars: 2500 },
  long_complex_git: { chunkSize: 600, overlap: 100, topK: 7, maxContextChars: 4000 },
  long_complex_meeting: { chunkSize: 600, overlap: 100, topK: 7, maxContextChars: 4000 },
  long_complex_document: { chunkSize: 600, overlap: 100, topK: 7, maxContextChars: 4000 },
  long_complex_mixed: { chunkSize: 600, overlap: 100, topK: 7, maxContextChars: 4000 },
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  wKeywordBase: 1.0,
  wFreqBonus: 0.3,
  wPositionBonus: 0.5,
  wTitleMatch: 0.8,
  wFirstChunk: 1.0,
  wMeetingType: 1.2,
  wTaskType: 1.1
}

const DEFAULT_BAYESIAN_WEIGHTS: BayesianWeights = {
  ...DEFAULT_WEIGHTS,
  wKeywordBase_n: 5,
  wFreqBonus_n: 5,
  wPositionBonus_n: 5,
  wTitleMatch_n: 5,
  wFirstChunk_n: 5,
  wMeetingType_n: 5,
  wTaskType_n: 5
}

// ── 파라미터 범위 제한 ───────────────────────────────────────────

const PARAM_BOUNDS = {
  chunkSize:       { min: 200,  max: 1000 },
  overlap:         { min: 20,   max: 200 },
  topK:            { min: 1,    max: 15 },
  maxContextChars: { min: 1000, max: 8000 },
}

const WEIGHT_BOUNDS = {
  wKeywordBase: { min: 0.5, max: 3.0 },  // 0.1→0.5: 저구간 절벽 효과 방지
  wFreqBonus: { min: 0.0, max: 1.0 },
  wPositionBonus: { min: 0.0, max: 1.5 },
  wTitleMatch: { min: 0.3, max: 2.0 },   // 0.1→0.3: 제목 매칭도 동일 이유
  wFirstChunk: { min: 0.0, max: 2.0 },
  wMeetingType: { min: 0.8, max: 2.0 },
  wTaskType: { min: 0.8, max: 1.8 },
}

/** 학습률 */
const LEARNING_RATE = 0.1
const WEIGHT_LR_POSITIVE = 0.5 // 긍정 피드백
const WEIGHT_LR_NEGATIVE = 0.5  // 부정 피드백: 긍정보다 보수적으로 (과잉 수정 방지)
const MAX_N = 20                  // n 상한선: 이 이상 커지면 시스템이 frozen됨

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

  return { ...getDefaultParams(questionType) }
}

/**
 * 기본 파라미터를 반환합니다. (비교/로그용)
 */
export function getDefaultParams(questionType: QuestionType): ChunkingParams {
  const fallbackMap: Record<string, QuestionType> = {
    short_simple: 'short_simple_mixed',
    short_complex: 'short_complex_mixed',
    long_simple: 'long_simple_mixed',
    long_complex: 'long_complex_mixed'
  }
  const normalizedType = (DEFAULT_PARAMS[questionType] ? questionType : fallbackMap[questionType]) ?? 'short_simple_mixed'
  return { ...DEFAULT_PARAMS[normalizedType] }
}

/**
 * 값을 min/max 범위로 제한합니다.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function signedDelta(value: number, score: number): number {
  const raw = Math.abs(LEARNING_RATE * score * value)
  const delta = Math.max(1, Math.round(raw))
  return score > 0 ? delta : -delta
}

function toScoringWeights(weights: BayesianWeights): ScoringWeights {
  // DB에 저장된 값이 현재 bounds 밖일 수 있으므로 읽을 때도 clamp 적용
  return {
    wKeywordBase: clamp(weights.wKeywordBase, WEIGHT_BOUNDS.wKeywordBase.min, WEIGHT_BOUNDS.wKeywordBase.max),
    wFreqBonus: clamp(weights.wFreqBonus, WEIGHT_BOUNDS.wFreqBonus.min, WEIGHT_BOUNDS.wFreqBonus.max),
    wPositionBonus: clamp(weights.wPositionBonus, WEIGHT_BOUNDS.wPositionBonus.min, WEIGHT_BOUNDS.wPositionBonus.max),
    wTitleMatch: clamp(weights.wTitleMatch, WEIGHT_BOUNDS.wTitleMatch.min, WEIGHT_BOUNDS.wTitleMatch.max),
    wFirstChunk: clamp(weights.wFirstChunk, WEIGHT_BOUNDS.wFirstChunk.min, WEIGHT_BOUNDS.wFirstChunk.max),
    wMeetingType: clamp(weights.wMeetingType, WEIGHT_BOUNDS.wMeetingType.min, WEIGHT_BOUNDS.wMeetingType.max),
    wTaskType: clamp(weights.wTaskType, WEIGHT_BOUNDS.wTaskType.min, WEIGHT_BOUNDS.wTaskType.max),
  }
}

export function getWeights(userId: string, questionType: QuestionType): ScoringWeights {
  const saved = scoringWeightsRepository.getByUserAndType(userId, questionType)
  return saved ? toScoringWeights(saved) : { ...DEFAULT_WEIGHTS }
}

function updateWeight(
  current: BayesianWeights,
  key: keyof ScoringWeights,
  nKey: keyof Pick<
    BayesianWeights,
    'wKeywordBase_n' | 'wFreqBonus_n' | 'wPositionBonus_n' | 'wTitleMatch_n' |
    'wFirstChunk_n' | 'wMeetingType_n' | 'wTaskType_n'
  >,
  direction: 1 | -1,
  featureValue: number
): void {
  if (featureValue <= 0) return
  const n = Math.min(current[nKey], MAX_N)  // n 상한선 적용
  const bounds = WEIGHT_BOUNDS[key]
  const featureStrength = Math.min(1, featureValue / 3)
  // 긍정/부정 비대칭 학습률: 부정 피드백의 과잉 수정 방지
  const lr = direction === 1 ? WEIGHT_LR_POSITIVE : WEIGHT_LR_NEGATIVE
  const target =
    current[key] +
    direction * lr * featureStrength * (bounds.max - bounds.min)
  const next = ((current[key] * n) + clamp(target, bounds.min, bounds.max)) / (n + 1)
  current[key] = Math.round(clamp(next, bounds.min, bounds.max) * 1000) / 1000
  current[nKey] = n + 1
}

export function updateWeightsFromFeedback(
  userId: string,
  questionType: QuestionType,
  feedbackItems: {
    feedback: EvidenceFeedbackType
    features?: ChunkFeatures | null
  }[],
  totalEvidenceCount: number
): ScoringWeights {
  void totalEvidenceCount
  const current = {
    ...DEFAULT_BAYESIAN_WEIGHTS,
    ...(scoringWeightsRepository.getByUserAndType(userId, questionType) ?? {})
  }

  for (const item of feedbackItems) {
    if (!item.features) continue

    const direction = item.feedback === 'interested' ? 1 : -1

    updateWeight(current, 'wKeywordBase', 'wKeywordBase_n', direction, item.features.keywordBase)
    updateWeight(current, 'wFreqBonus', 'wFreqBonus_n', direction, item.features.freqBonus)
    updateWeight(current, 'wPositionBonus', 'wPositionBonus_n', direction, item.features.positionBonus)
    updateWeight(current, 'wTitleMatch', 'wTitleMatch_n', direction, item.features.titleMatch)
    updateWeight(current, 'wFirstChunk', 'wFirstChunk_n', direction, item.features.firstChunkBonus)
    updateWeight(current, 'wMeetingType', 'wMeetingType_n', direction, item.features.meetingBonus)
    updateWeight(current, 'wTaskType',    'wTaskType_n',    direction, item.features.taskBonus)
  }

  scoringWeightsRepository.upsert(userId, questionType, current)
  return toScoringWeights(current)
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
    current.topK + signedDelta(current.topK, score),
    PARAM_BOUNDS.topK.min,
    PARAM_BOUNDS.topK.max
  )
  current.maxContextChars = clamp(
    current.maxContextChars + signedDelta(current.maxContextChars, score),
    PARAM_BOUNDS.maxContextChars.min,
    PARAM_BOUNDS.maxContextChars.max
  )

  // 부정 피드백 비율이 높을 때만 overlap 증가 (정밀도 향상)
  if (score < 0) {
    current.overlap = clamp(
      current.overlap + Math.max(1, Math.round(α * Math.abs(score) * current.overlap)),
      PARAM_BOUNDS.overlap.min,
      PARAM_BOUNDS.overlap.max
    )
  }

  // DB에 저장
  adaptiveParamsRepository.upsert(userId, questionType, current)

  return current
}
