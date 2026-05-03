/**
 * 컨텍스트 청킹 & 트런케이션 모듈
 *
 * RAG 파이프라인에서 검색된 문서·회의록·태스크 등의 텍스트를
 * 적절한 크기의 청크로 나누고, LLM에 전송할 컨텍스트의
 * 총 크기를 제한하여 토큰 사용량을 최적화합니다.
 */

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
  sourceType: 'meeting' | 'task' | 'document'
  sourceId: number
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
  selectedChunks: Chunk[]

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
  overlap: number = DEFAULT_OVERLAP
): string[] {
  if (!text || text.length === 0) return []
  if (text.length <= chunkSize) return [text.trim()]

  const chunks: string[] = []
  const step = chunkSize - overlap  // 한 번에 전진하는 글자 수

  // overlap이 chunkSize 이상이면 의미 없으므로 보정
  const safeStep = step > 0 ? step : chunkSize

  let start = 0

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length)

    // 텍스트 중간이면 문장 경계(마침표·줄바꿈)에서 자르기 시도
    if (end < text.length) {
      const slice = text.substring(start, end)

      // 뒤에서부터 문장 끝 기호를 찾음
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

      // 청크의 50% 이후 지점에서 경계를 찾은 경우에만 적용
      if (lastSentenceEnd > chunkSize * 0.5) {
        end = start + lastSentenceEnd + 2  // +2: 마침표 + 뒤 문자 포함
      }
    }

    const chunk = text.substring(start, end).trim()
    if (chunk.length > 0) {
      chunks.push(chunk)
    }

    // 다음 청크 시작점: 항상 최소 safeStep 만큼 전진 (무한루프 방지)
    const nextStart = start + safeStep
    start = Math.max(nextStart, start + 1)  // 최소 1글자는 전진
  }

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

  if (lastPeriod > maxChars * 0.7) {
    return truncated.substring(0, lastPeriod + 1) + '\n...(이하 생략)'
  }

  return truncated + '...(이하 생략)'
}

// ── 핵심 함수: 청크 스코어링 ─────────────────────────────────────

/**
 * 청크와 키워드 목록 간의 관련도 점수를 계산합니다.
 *
 * 스코어링 기준:
 * - 키워드가 청크에 포함되면 기본 1점
 * - 동일 키워드 등장 횟수에 따라 추가 점수 (0.3점/회, 최대 3회)
 * - 청크 앞부분(제목·요약)일수록 가중치 (chunkIndex 0이면 +1점)
 */
export function scoreChunk(chunk: Chunk, keywords: string[]): number {
  let score = 0
  const textLower = chunk.text.toLowerCase()

  for (const keyword of keywords) {
    const kwLower = keyword.toLowerCase()
    if (textLower.includes(kwLower)) {
      // 기본 매칭 점수
      score += 1

      // 등장 횟수 보너스 (최대 3회까지)
      const regex = new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      const matches = chunk.text.match(regex)
      if (matches && matches.length > 1) {
        score += Math.min(matches.length - 1, 3) * 0.3
      }
    }
  }

  // 첫 번째 청크 보너스 (보통 제목·요약이 포함됨)
  if (chunk.chunkIndex === 0) {
    score += 1
  }

  // 소스 타입별 가중치
  if (chunk.sourceType === 'meeting') score *= 1.2
  if (chunk.sourceType === 'task') score *= 1.1

  return Math.round(score * 100) / 100
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
    type: 'meeting' | 'task' | 'document'
    id: number
    title: string
    content: string
  }[],
  keywords: string[],
  options?: {
    chunkSize?: number
    overlap?: number
    topK?: number
    maxContextChars?: number
  }
): ContextBuildResult {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE
  const overlap = options?.overlap ?? DEFAULT_OVERLAP
  const topK = options?.topK ?? DEFAULT_TOP_K
  const maxContextChars = options?.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS

  // Step 1: 모든 소스를 청크로 분할
  const allChunks: Chunk[] = []

  for (const source of sources) {
    const textChunks = chunkText(source.content, chunkSize, overlap)

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
      chunk.score = scoreChunk(chunk, keywords)
      allChunks.push(chunk)
    }
  }

  // Step 3: 점수순 정렬 → Top-K 선택
  allChunks.sort((a, b) => b.score - a.score)

  const selected: Chunk[] = []
  let totalChars = 0

  for (const chunk of allChunks) {
    if (selected.length >= topK) break
    if (chunk.score <= 0) break // 매칭 없는 청크 제외
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

  // Step 4: 최종 컨텍스트 블록 포맷팅
  const contextBlock = selected
    .map((c, i) => {
      const typeLabel =
        c.sourceType === 'meeting'
          ? '회의록'
          : c.sourceType === 'task'
            ? '태스크'
            : '문서'
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
      // 한국어 기준 대략 글자 수 ÷ 1.5 ≈ 토큰 수 (근사치)
      estimatedTokens: Math.ceil(totalChars / 1.5),
    },
  }
}
