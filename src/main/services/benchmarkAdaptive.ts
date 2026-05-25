import { buildContext } from './contextChunker'
import { classifyQuestion } from './questionClassifier'
import type { EvidenceFeedbackType, ChunkingParams, QuestionType } from '../../shared/types'

// Mock DB for benchmark
const PARAM_BOUNDS = {
  chunkSize:       { min: 200,  max: 1000 },
  overlap:         { min: 20,   max: 200 },
  topK:            { min: 1,    max: 15 },
  maxContextChars: { min: 1000, max: 8000 },
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

let adaptiveParamsState: ChunkingParams = { chunkSize: 400, overlap: 60, topK: 3, maxContextChars: 2000 }

function updateMockParams(feedbacks: EvidenceFeedbackType[], totalEvidenceCount: number) {
  const total = Math.max(totalEvidenceCount, feedbacks.length)
  if (total === 0 || feedbacks.length === 0) return

  const interestedCount = feedbacks.filter(f => f === 'interested').length
  const notInterestedCount = feedbacks.length - interestedCount
  const score = (interestedCount - notInterestedCount) / total

  if (score === 0) return

  const α = 0.1
  adaptiveParamsState.topK = clamp(Math.round(adaptiveParamsState.topK + α * score * adaptiveParamsState.topK), PARAM_BOUNDS.topK.min, PARAM_BOUNDS.topK.max)
  adaptiveParamsState.maxContextChars = clamp(Math.round(adaptiveParamsState.maxContextChars + α * score * adaptiveParamsState.maxContextChars), PARAM_BOUNDS.maxContextChars.min, PARAM_BOUNDS.maxContextChars.max)

  if (score < 0) {
    adaptiveParamsState.overlap = clamp(Math.round(adaptiveParamsState.overlap + α * Math.abs(score) * adaptiveParamsState.overlap), PARAM_BOUNDS.overlap.min, PARAM_BOUNDS.overlap.max)
  }
}

async function runBenchmark() {
  console.log('=== 적응형 파라미터 vs 기존(고정) 파라미터 토큰 사용량 비교 ===\n')

  const question = '이번 주 회의에서 결정된 프론트엔드 프레임워크는 뭐야?'
  const questionType = classifyQuestion(question)

  console.log(`질문: "${question}"`)
  console.log(`분류된 질문 유형: ${questionType}\n`)

  const sampleSources = [
    { type: 'meeting' as const, id: 1, title: '주간 회의록 1', content: '이번 주 회의에서 프론트엔드 프레임워크는 React를 사용하기로 결정했습니다. 백엔드는 Node.js를 사용합니다. '.repeat(40) },
    { type: 'meeting' as const, id: 2, title: '주간 회의록 2', content: '데이터베이스는 SQLite를 사용합니다. UI 라이브러리는 Tailwind CSS를 도입하기로 논의했습니다. '.repeat(40) },
    { type: 'document' as const, id: 3, title: '설계 문서', content: '이 프로젝트는 데스크톱 에이전트 시스템입니다. Electron 기반으로 동작하며 로컬 DB를 가집니다. '.repeat(40) }
  ]

  const STATIC_PARAMS = { chunkSize: 500, overlap: 80, topK: 5, maxContextChars: 3000 }

  let totalStaticTokens = 0
  let totalAdaptiveTokens = 0

  const ITERATIONS = 5

  console.log('가정: "short_simple" 질문에 대해 처음에 3개 정도의 청크가 주어지지만, 사용자는 1개만 "관심있음", 2개는 "관심없음"으로 피드백을 반복한다고 가정.\n')

  for (let i = 1; i <= ITERATIONS; i++) {
    console.log(`[시도 ${i}]`)
    
    // 1. 기존(고정) 방식 컨텍스트 빌드
    const staticResult = buildContext(sampleSources, ['프론트엔드', '프레임워크', '회의', '결정'], STATIC_PARAMS)
    const staticTokens = staticResult.stats.estimatedTokens
    totalStaticTokens += staticTokens

    // 2. 적응형 방식 컨텍스트 빌드
    const adaptiveResult = buildContext(sampleSources, ['프론트엔드', '프레임워크', '회의', '결정'], adaptiveParamsState)
    const adaptiveTokens = adaptiveResult.stats.estimatedTokens
    totalAdaptiveTokens += adaptiveTokens

    console.log(`  ▶ 고정 방식: ${staticTokens} 토큰 (topK: ${STATIC_PARAMS.topK}, maxChars: ${STATIC_PARAMS.maxContextChars})`)
    console.log(`  ▶ 적응형 방식: ${adaptiveTokens} 토큰 (topK: ${adaptiveParamsState.topK}, maxChars: ${adaptiveParamsState.maxContextChars})`)
    
    const diff = staticTokens - adaptiveTokens
    console.log(`  → 💡 절약된 토큰: ${diff > 0 ? '+' : ''}${diff} 토큰 (${((diff / staticTokens) * 100).toFixed(1)}%)\n`)

    // 3. 피드백 시뮬레이션 (적응형 방식 업데이트)
    // 1개 interested, 2개 not_interested 누르고 나머지는 미응답
    const feedbacks: EvidenceFeedbackType[] = ['interested', 'not_interested', 'not_interested']
    const totalEvidence = adaptiveResult.selectedChunks.length

    updateMockParams(feedbacks, totalEvidence)
  }

  console.log('=== 최종 결과 ===')
  console.log(`기존 총 사용 토큰: ${totalStaticTokens}`)
  console.log(`적응형 총 사용 토큰: ${totalAdaptiveTokens}`)
  const savedTokens = totalStaticTokens - totalAdaptiveTokens
  console.log(`✨ 총 절약된 토큰: ${savedTokens} 토큰 (${((savedTokens / totalStaticTokens) * 100).toFixed(1)}% 절약)`)
}

runBenchmark()
