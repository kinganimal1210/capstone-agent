/**
 * 컨텍스트 청킹 & 트런케이션 모듈
 *
 * RAG 파이프라인에서 검색된 문서·회의록·태스크 등의 텍스트를
 * 적절한 크기의 청크로 나누고, LLM에 전송할 컨텍스트의
 * 총 크기를 제한하여 토큰 사용량을 최적화합니다.
 */

import type { ChunkFeatures, ScoredChunk, ScoringWeights } from '../../shared/types'

// ── 토큰 추정 함수 ──────────────────────────────────────────────

/**
 * 텍스트의 토큰 수를 추정합니다.
 *
 * 한국어·영어·코드 비율을 감지하여 동적 divisor를 적용합니다.
 * 실측 데이터 기반 (OpenAI gpt-4o-mini 기준):
 *   - 순수 한국어: 1글자 ≈ 0.56 토큰 (divisor 1.77)
 *   - 순수 영어:   1글자 ≈ 0.19 토큰 (divisor 5.23)
 *   - 코드:        1글자 ≈ 0.27 토큰 (divisor 3.69)
 *   - 혼합:        비율에 따라 가중 평균
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0

  const len = text.length

  // 문자 유형별 카운트
  const koreanChars = (text.match(/[\uAC00-\uD7AF\u3130-\u318F\uAC00-\uD7A3]/g) || []).length
  // [개선 #4] codeIndicators를 실제 토큰 추정에 반영
  // 코드 기호는 영어보다 토큰을 더 많이 소비 (gpt-4o-mini 실측)
  const codeIndicators = (text.match(/[{}()\[\];=><|&!+\-*/^~`@#$%]/g) || []).length
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length

  const koreanRatio = koreanChars / len
  const codeRatio = codeIndicators / len
  const englishRatio = englishChars / len
  // 순수 공백·숫자 비율 (코드 기호 제외)
  const pureSymbolRatio = Math.max(0, (len - koreanChars - englishChars - codeIndicators) / len)

  // OpenAI gpt-4o-mini 실측 기반 보정식 (코드 기호 분리 적용)
  // 한국어: ~1.6글자/토큰, 영어: ~3.5글자/토큰
  // 코드기호: ~2.5글자/토큰 (특수문자는 별도 토큰으로 인식됨)
  // 공백·숫자: ~1.2글자/토큰
  const estimatedTokens = len * (
    (koreanRatio / 1.6) +
    (englishRatio / 3.5) +
    (codeRatio / 2.5) +
    (pureSymbolRatio / 1.2)
  )

  return Math.ceil(estimatedTokens)
}

// ── 설정 상수 ────────────────────────────────────────────────────

/** 청크 하나의 최대 글자 수 */
const DEFAULT_CHUNK_SIZE = 500

/** 청크 간 겹침 글자 수 (문맥 유지) */
const DEFAULT_OVERLAP = 80

/** LLM에 전송할 최대 컨텍스트 총 글자 수 */
const DEFAULT_MAX_CONTEXT_CHARS = 3000

/** 컨텍스트에 포함할 최대 청크 수 */
const DEFAULT_TOP_K = 5

// ── 타입 정의 ────────────────────────────────────────────────────

export interface Chunk {
  /** 청크가 속한 원본 소스의 식별 정보 */
  sourceType: 'meeting' | 'task' | 'document' | 'git'
  sourceId: number | string
  sourceTitle: string

  /** 청크 텍스트 */
  text: string

  /** 원본 내에서 몇 번째 청크인지 (0-based) */
  chunkIndex: number

  /** 키워드 매칭 기반 관련도 점수 */
  score: number
}

export interface ContextBuildResult {
  /** LLM에 전송할 최종 컨텍스트 블록 */
  contextBlock: string

  /** 선택된 청크 목록 (evidence 로그 저장용) */
  selectedChunks: ScoredChunk[]

  /** 통계 */
  stats: {
    totalChunks: number
    selectedChunks: number
    totalChars: number
    estimatedTokens: number
  }
}

// ── 핵심 함수: 텍스트 청킹 ───────────────────────────────────────

/**
 * 긴 텍스트를 일정 크기의 청크로 분할합니다.
 *
 * 단순 글자 수 기준이 아니라 문단·문장 경계를 최대한 존중합니다.
 * 청크 간 overlap을 두어 문맥이 끊기지 않도록 합니다.
 *
 * @param text      분할할 원본 텍스트
 * @param chunkSize 청크 하나의 최대 글자 수
 * @param overlap   청크 간 겹침 글자 수
 * @returns         분할된 텍스트 배열
 */
export function chunkText(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP,
  sourceType?: 'meeting' | 'task' | 'document' | 'git'
): string[] {
  if (!text || text.length === 0) return []
  if (text.length <= chunkSize) return [text.trim()]

  // [개선 #5] 소스 타입별 청킹 전략
  // 회의록: 발언자 단위("이름:") 또는 빈 줄 기준 우선 분리
  // 태스크: 번호 목록("1.", "- ") 기준 우선 분리
  // 문서:   마크다운 헤더(##, ###) 기준 우선 분리
  // git:    커밋 메시지 단위("commit ") 기준 우선 분리
  if (sourceType === 'meeting') {
    const speakerChunks = splitBySpeaker(text, chunkSize)
    if (speakerChunks.length > 1) return speakerChunks
  }
  if (sourceType === 'task') {
    const listChunks = splitByListItem(text, chunkSize)
    if (listChunks.length > 1) return listChunks
  }
  if (sourceType === 'document') {
    const headerChunks = splitByHeader(text, chunkSize, overlap)
    if (headerChunks.length > 1) return headerChunks
  }
  if (sourceType === 'git') {
    const commitChunks = splitByCommit(text, chunkSize)
    if (commitChunks.length > 1) return commitChunks
  }

  // 기본: 문장 경계 기반 청킹
  const chunks: string[] = []
  const step = chunkSize - overlap
  const safeStep = step > 0 ? step : chunkSize
  let start = 0

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length)

    if (end < text.length) {
      const slice = text.substring(start, end)
      const lastSentenceEnd = Math.max(
        slice.lastIndexOf('.\n'),
        slice.lastIndexOf('.\r\n'),
        slice.lastIndexOf('.\r'),
        slice.lastIndexOf('. '),
        slice.lastIndexOf('.\t'),
        slice.lastIndexOf('다.'),
        slice.lastIndexOf('요.'),
        slice.lastIndexOf('음.'),
        slice.lastIndexOf('\n\n')
      )
      if (lastSentenceEnd > chunkSize * 0.5) {
        end = start + lastSentenceEnd + 2
      }
    }

    const chunk = text.substring(start, end).trim()
    if (chunk.length > 0) chunks.push(chunk)

    const nextStart = start + safeStep
    start = Math.max(nextStart, start + 1)
  }

  return chunks
}

/** 회의록: "이름:" 패턴으로 발언자 단위 분리 */
function splitBySpeaker(text: string, chunkSize: number): string[] {
  const lines = text.split('\n')
  const chunks: string[] = []
  let current = ''

  for (const line of lines) {
    const isSpeakerLine = /^[가-힣a-zA-Z]{1,10}\s*:/.test(line.trim())
    if (isSpeakerLine && current.trim().length > 0) {
      if (current.length > chunkSize) {
        // 청크가 너무 길면 추가 분리
        chunks.push(...splitByNewline(current, chunkSize))
      } else {
        chunks.push(current.trim())
      }
      current = ''
    }
    current += line + '\n'
  }
  if (current.trim().length > 0) chunks.push(current.trim())
  return chunks
}

/** 태스크: "1.", "- ", "* " 등 목록 항목 단위 분리 */
function splitByListItem(text: string, chunkSize: number): string[] {
  const lines = text.split('\n')
  const chunks: string[] = []
  let current = ''

  for (const line of lines) {
    const isListItem = /^(\d+\.|-|\*|•)\s/.test(line.trim())
    if (isListItem && current.trim().length > 0) {
      chunks.push(current.trim())
      current = ''
    }
    current += line + '\n'
    if (current.length > chunkSize) {
      chunks.push(current.trim())
      current = ''
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim())
  return chunks
}

/** 문서: 마크다운 헤더(#, ##, ###) 기준 분리 후 chunkSize 초과 시 재분리 */
function splitByHeader(text: string, chunkSize: number, overlap: number): string[] {
  const sections = text.split(/(?=\n#{1,3}\s)/)
  const chunks: string[] = []
  for (const section of sections) {
    if (section.trim().length === 0) continue
    if (section.length <= chunkSize) {
      chunks.push(section.trim())
    } else {
      // 섹션이 너무 크면 일반 청킹으로 재분리
      chunks.push(...chunkText(section, chunkSize, overlap))
    }
  }
  return chunks
}

/** Git: "commit " 해시 단위 분리 */
function splitByCommit(text: string, chunkSize: number): string[] {
  const sections = text.split(/(?=commit\s[0-9a-f]{7,40})/i)
  const chunks: string[] = []
  for (const section of sections) {
    if (section.trim().length === 0) continue
    if (section.length <= chunkSize) {
      chunks.push(section.trim())
    } else {
      chunks.push(...splitByNewline(section, chunkSize))
    }
  }
  return chunks
}

/** 줄바꿈 기준 단순 분리 (내부 헬퍼) */
function splitByNewline(text: string, chunkSize: number): string[] {
  const chunks: string[] = []
  let current = ''
  for (const line of text.split('\n')) {
    if (current.length + line.length > chunkSize && current.trim().length > 0) {
      chunks.push(current.trim())
      current = ''
    }
    current += line + '\n'
  }
  if (current.trim().length > 0) chunks.push(current.trim())
  return chunks
}

// ── 핵심 함수: 트런케이션 ────────────────────────────────────────

/**
 * 텍스트를 지정된 글자 수로 자릅니다.
 * 문장 경계에서 자르는 것을 우선 시도합니다.
 */
export function truncate(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text

  const truncated = text.substring(0, maxChars)

  // 마지막 온전한 문장까지만 포함 시도
  const lastPeriod = Math.max(
    truncated.lastIndexOf('다.'),
    truncated.lastIndexOf('요.'),
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('.\n')
  )

  // [개선 #6] 잘린 글자 수를 힌트로 포함 → LLM이 내용이 잘렸음을 명확히 인식
  const omittedChars = text.length - maxChars
  const hint = `\n...[이하 ${omittedChars}자 생략됨. 내용이 잘렸을 수 있음]`

  if (lastPeriod > maxChars * 0.7) {
    return truncated.substring(0, lastPeriod + 1) + hint
  }

  return truncated + hint
}

// ── 핵심 함수: 청크 스코어링 ─────────────────────────────────────

/**
 * 청크와 키워드 목록 간의 관련도 점수 및 특징 기여도를 계산합니다.
 *
 * 스코어링 기준:
 * - 키워드가 청크에 포함되면 기본 1점
 * - 동일 키워드 등장 횟수에 따라 추가 점수 (0.3점/회, 최대 3회)
 * - 청크 앞부분(제목·요약)일수록 가중치 (chunkIndex 0이면 +1점)
 */
const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  wKeywordBase: 1.0,
  wFreqBonus: 0.3,
  wPositionBonus: 0.5,
  wTitleMatch: 0.8,
  wFirstChunk: 1.0,
  wMeetingType: 1.2,
  wTaskType: 1.1
}

export function scoreChunk(
  chunk: Chunk,
  keywords: string[],
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): { score: number; features: ChunkFeatures } {
  const features: ChunkFeatures = {
    keywordBase: 0,
    freqBonus: 0,
    positionBonus: 0,
    titleMatch: 0,
    firstChunkBonus: 0,
    meetingBonus: 0,
    taskBonus: 0
  }
  const textLower = chunk.text.toLowerCase()
  const titleLower = chunk.sourceTitle.toLowerCase()

  for (const keyword of keywords) {
    const kwLower = keyword.toLowerCase()
    if (textLower.includes(kwLower)) {
      features.keywordBase += 1

      // 등장 횟수 보너스 (최대 3회까지)
      const regex = new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      const matches = chunk.text.match(regex)
      if (matches && matches.length > 1) {
        features.freqBonus += Math.min(matches.length - 1, 3)
      }

      // [개선 #3] 키워드가 청크 앞부분(20% 이내)에 등장하면 위치 보너스
      const position = textLower.indexOf(kwLower) / Math.max(chunk.text.length, 1)
      if (position < 0.2) {
        features.positionBonus += 1
      }
    }

    // [개선 #3] 소스 제목에 키워드가 포함되면 추가 보너스
    // 제목 매칭은 강한 관련성 신호이므로 본문 매칭보다 높은 가중치 부여
    if (titleLower.includes(kwLower)) {
      features.titleMatch += 1
    }
  }

  const baseScore =
    features.keywordBase * weights.wKeywordBase +
    features.freqBonus * weights.wFreqBonus +
    features.positionBonus * weights.wPositionBonus +
    features.titleMatch * weights.wTitleMatch

  // 첫 번째 청크 보너스 (보통 제목·요약이 포함됨) - 단, 키워드 매칭이 성공한 경우에만 부여
  let scoredBase = baseScore
  if (chunk.chunkIndex === 0 && scoredBase > 0) {
    features.firstChunkBonus = 1
    scoredBase += weights.wFirstChunk
  }

  // 소스 타입별 가중치 (meeting/task 각각 독립 추적)
  let score = scoredBase
  if (chunk.sourceType === 'meeting') {
    score *= weights.wMeetingType
    features.meetingBonus = 1
  }
  if (chunk.sourceType === 'task') {
    score *= weights.wTaskType
    features.taskBonus = 1
  }

  return {
    score: Math.round(score * 100) / 100,
    features: {
      keywordBase: Math.round(features.keywordBase * 100) / 100,
      freqBonus: Math.round(features.freqBonus * 100) / 100,
      positionBonus: Math.round(features.positionBonus * 100) / 100,
      titleMatch: Math.round(features.titleMatch * 100) / 100,
      firstChunkBonus: Math.round(features.firstChunkBonus * 100) / 100,
      meetingBonus: features.meetingBonus,
      taskBonus: features.taskBonus
    }
  }
}

// ── 핵심 함수: 컨텍스트 조립 ─────────────────────────────────────

/**
 * 여러 소스에서 청크를 수집하고, 스코어링 후 Top-K를 선택하여
 * LLM에 전송할 최종 컨텍스트 블록을 생성합니다.
 *
 * @param sources   검색된 원본 데이터 목록
 * @param keywords  사용자 질문에서 추출한 키워드
 * @param options   청킹·컨텍스트 설정
 */
export function buildContext(
  sources: {
    type: 'meeting' | 'task' | 'document' | 'git'
    id: number | string
    title: string
    content: string
  }[],
  keywords: string[],
  options?: {
    chunkSize?: number
    overlap?: number
    topK?: number
    maxContextChars?: number
    scoreThreshold?: number
    scoringWeights?: ScoringWeights
  }
): ContextBuildResult {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE
  const overlap = options?.overlap ?? DEFAULT_OVERLAP
  const topK = options?.topK ?? DEFAULT_TOP_K
  const maxContextChars = options?.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS
  const scoreThreshold = options?.scoreThreshold ?? 0.5
  const scoringWeights = options?.scoringWeights ?? DEFAULT_SCORING_WEIGHTS

  // Step 1: 모든 소스를 청크로 분할
  const allChunks: ScoredChunk[] = []

  for (const source of sources) {
    // [개선 #5] 소스 타입을 chunkText에 전달해 타입별 최적 청킹 전략 사용
    const textChunks = chunkText(source.content, chunkSize, overlap, source.type)

    for (let i = 0; i < textChunks.length; i++) {
      const chunk: Chunk = {
        sourceType: source.type,
        sourceId: source.id,
        sourceTitle: source.title,
        text: textChunks[i],
        chunkIndex: i,
        score: 0,
      }

      // Step 2: 키워드 기반 스코어링
      const scored = scoreChunk(chunk, keywords, scoringWeights)
      allChunks.push({
        ...chunk,
        score: scored.score,
        features: scored.features
      })
    }
  }

  // Step 3: 점수순 정렬 → Top-K 선택
  allChunks.sort((a, b) => b.score - a.score)

  const selected: ScoredChunk[] = []
  let totalChars = 0

  for (const chunk of allChunks) {
    if (selected.length >= topK) break
    if (chunk.score < scoreThreshold) continue
    if (totalChars + chunk.text.length > maxContextChars) {
      // 남은 공간에 트런케이션해서 넣을 수 있으면 넣기
      const remaining = maxContextChars - totalChars
      if (remaining > 100) {
        const truncatedChunk = { ...chunk, text: truncate(chunk.text, remaining) }
        selected.push(truncatedChunk)
        totalChars += truncatedChunk.text.length
      }
      break
    }

    selected.push(chunk)
    totalChars += chunk.text.length
  }

  // 선택한 Data Source에 자료가 있지만 키워드 매칭이 전혀 없는 경우에도
  // LLM이 "참고 자료 없음"으로 오판하지 않도록 상위 청크를 fallback으로 포함합니다.
  if (selected.length === 0 && allChunks.length > 0) {
    for (const chunk of allChunks) {
      if (selected.length >= topK) break
      if (totalChars + chunk.text.length > maxContextChars) {
        const remaining = maxContextChars - totalChars
        if (remaining > 100) {
          const truncatedChunk = { ...chunk, text: truncate(chunk.text, remaining) }
          selected.push(truncatedChunk)
          totalChars += truncatedChunk.text.length
        }
        break
      }

      selected.push(chunk)
      totalChars += chunk.text.length
    }
  }

  // Step 4: 최종 컨텍스트 블록 포맷팅
  const contextBlock = selected
    .map((c, i) => {
      // [개선 #2] git 타입 라벨 추가
      const typeLabel =
        c.sourceType === 'meeting' ? '회의록' :
        c.sourceType === 'task'    ? '태스크' :
        c.sourceType === 'git'     ? 'Git커밋' :
        '문서'
      return `[${i + 1}] (${typeLabel}) ${c.sourceTitle}\n${c.text}`
    })
    .join('\n---\n')

  return {
    contextBlock,
    selectedChunks: selected,
    stats: {
      totalChunks: allChunks.length,
      selectedChunks: selected.length,
      totalChars,
      // 한영 비율 기반 동적 토큰 추정 (실측 보정)
      estimatedTokens: estimateTokens(contextBlock),
    },
  }
}
