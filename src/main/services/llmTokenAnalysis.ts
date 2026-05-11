/**
 * 토큰 추정 정확도 정밀 분석 스크립트
 *
 * 다양한 텍스트 유형·길이에 대해 실제 OpenAI 토큰 수를 측정하고
 * 최적의 토큰 추정 공식을 도출합니다.
 *
 * 실행: npx tsx src/main/services/llmTokenAnalysis.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { callLLM, loadConfigFromEnv } from './llmService'
import { chunkText } from './contextChunker'

// ── 분석용 텍스트 샘플 ───────────────────────────────────────────

interface TextSample {
  label: string
  type: 'korean' | 'english' | 'mixed' | 'code'
  text: string
}

const SAMPLES: TextSample[] = [
  // 순수 한국어
  {
    label: '한국어 - 회의록 (짧은)',
    type: 'korean',
    text: '프로젝트 킥오프 회의가 진행되었다. 참석자는 김철수, 이영희, 박민수이다. 프로젝트의 주요 목표는 데스크톱 AI 에이전트 시스템을 개발하는 것이다.',
  },
  {
    label: '한국어 - 회의록 (중간)',
    type: 'korean',
    text: `프로젝트 킥오프 회의가 진행되었다. 참석자는 김철수, 이영희, 박민수이다.
프로젝트의 주요 목표는 데스크톱 AI 에이전트 시스템을 개발하는 것이다. 사용자가 로컬 데이터를 기반으로 질문하고 답변을 받을 수 있는 시스템을 구축한다.
주요 기능으로는 회의록 관리, 태스크 추적, 문서 검색, Git 활동 분석이 포함된다.
김철수는 프론트엔드 UI 개발 및 Electron 앱 구조 설계를 담당한다. React와 TailwindCSS를 활용하여 사용자 인터페이스를 구현한다.
이영희는 백엔드 로직 및 LLM 연동을 담당한다. OpenAI API를 활용하여 RAG 파이프라인을 구축하고 프롬프트 최적화를 수행한다.`,
  },
  {
    label: '한국어 - 태스크',
    type: 'korean',
    text: 'OpenAI API를 연동하여 RAG 파이프라인을 구축한다. 담당자: 이영희. 마감일: 9주차. 상태: 진행중. 우선순위: high. 세부 내용: 프롬프트 전처리, 컨텍스트 청킹, 토큰 최적화를 포함한다.',
  },
  {
    label: '한국어 - 긴 설명문',
    type: 'korean',
    text: `데이터베이스는 SQLite를 사용하기로 결정했다. UI 프레임워크는 React와 TailwindCSS로 결정했다.
LLM은 OpenAI GPT-4를 기본으로 하되 비용 절감을 위해 GPT-3.5도 지원한다. 매주 월요일 오후 2시에 정기 회의를 진행한다.
일정 계획은 다음과 같다. 1주차부터 3주차까지 기본 앱 구조 및 DB 스키마 구현을 완료한다.
4주차부터 6주차까지 핵심 기능 개발을 진행한다. 여기에는 회의록 관리, 태스크 관리, 문서 관리가 포함된다.
7주차부터 9주차까지 LLM 연동 및 RAG 파이프라인을 구현한다. 10주차부터 12주차까지 테스트 및 최적화를 수행한다.
박민수는 데이터베이스 설계 및 문서 처리 모듈을 담당한다. SQLite 스키마 설계와 파일 스캔 기능을 구현한다.`,
  },

  // 영어
  {
    label: '영어 - README',
    type: 'english',
    text: 'Capstone Agent is a desktop AI agent system built with Node.js, Electron, and React. It provides meeting management, task tracking, document search, and Git activity analysis.',
  },
  {
    label: '영어 - 기술 문서',
    type: 'english',
    text: `The RAG pipeline processes user queries through several stages. First, the prompt preprocessor extracts keywords
by removing Korean stopwords and normalizing the text. Then, the context chunker splits documents into overlapping
chunks of configurable size. Each chunk is scored based on keyword matching with bonus points for title chunks
and source type weighting. Finally, the top-K chunks are selected and truncated to fit within the maximum context
character limit before being assembled into the final prompt.`,
  },

  // 한영 혼합
  {
    label: '혼합 - 기술 회의록',
    type: 'mixed',
    text: `김철수: React와 TailwindCSS를 활용하여 UI를 구현한다. Electron 앱 구조를 설계한다.
이영희: OpenAI API를 연동한다. RAG pipeline을 구축하고 prompt optimization을 수행한다.
박민수: SQLite 스키마를 설계하고 sql.js로 구현한다. file scanning 기능을 개발한다.
database schema에는 meetings, tasks, documents, evidence_logs 테이블이 포함된다.`,
  },
  {
    label: '혼합 - 시스템 프롬프트',
    type: 'mixed',
    text: '프로젝트 관리 AI 어시스턴트. 아래 참고자료 기반으로 답변. 자료에 없으면 "해당 정보 없음" 표기. 간결하게 답변.',
  },

  // 코드 포함
  {
    label: '코드 - TypeScript',
    type: 'code',
    text: `export function chunkText(text: string, chunkSize: number = 500, overlap: number = 80): string[] {
  if (!text || text.length === 0) return []
  if (text.length <= chunkSize) return [text.trim()]
  const chunks: string[] = []
  const step = chunkSize - overlap
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length)
    chunks.push(text.substring(start, end).trim())
    start += step
  }
  return chunks
}`,
  },
]

// ── 토큰 측정 함수 ───────────────────────────────────────────────

async function measureTokens(text: string): Promise<{ promptTokens: number; totalTokens: number }> {
  const config = loadConfigFromEnv('openai')
  // 시스템 메시지를 최소화하여 텍스트 자체의 토큰만 측정
  const response = await callLLM(
    [
      { role: 'system', content: 'Reply with exactly: OK' },
      { role: 'user', content: text },
    ],
    { ...config, maxTokens: 5, temperature: 0 }
  )

  return {
    promptTokens: response.usage?.promptTokens ?? 0,
    totalTokens: response.usage?.totalTokens ?? 0,
  }
}

// ── 텍스트 분석 유틸 ─────────────────────────────────────────────

function analyzeText(text: string) {
  const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) || []).length
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length
  const digits = (text.match(/[0-9]/g) || []).length
  const spaces = (text.match(/\s/g) || []).length
  const punctuation = text.length - koreanChars - englishChars - digits - spaces
  const koreanRatio = koreanChars / text.length
  const englishRatio = englishChars / text.length

  return { koreanChars, englishChars, digits, spaces, punctuation, koreanRatio, englishRatio }
}

// ── 메인 분석 ────────────────────────────────────────────────────

interface AnalysisResult {
  label: string
  type: string
  charCount: number
  koreanRatio: number
  englishRatio: number
  actualTokens: number
  // 추정 공식별 결과
  est_div15: number  // 현재: chars / 1.5
  est_div185: number // 보정1: chars / 1.85
  // 새 공식: 한영 비율 기반
  est_weighted: number
  // 정확도
  acc_div15: number
  acc_div185: number
  acc_weighted: number
}

async function main() {
  console.log('═'.repeat(100))
  console.log('  🔬 토큰 추정 정밀 분석')
  console.log('═'.repeat(100))

  const SYSTEM_OVERHEAD = 9 // "Reply with exactly: OK" 시스템 메시지의 토큰 오버헤드 (측정 필요)

  // 시스템 오버헤드 먼저 측정
  console.log('\n📏 시스템 오버헤드 측정 중...')
  const overhead = await measureTokens('')
  const systemOverhead = overhead.promptTokens
  console.log(`  시스템 메시지 오버헤드: ${systemOverhead} 토큰`)

  const results: AnalysisResult[] = []

  for (const sample of SAMPLES) {
    console.log(`\n🔄 측정 중: ${sample.label} (${sample.text.length}자)`)

    const { promptTokens } = await measureTokens(sample.text)
    // 시스템 오버헤드를 빼서 순수 텍스트 토큰만 추출
    const actualTokens = promptTokens - systemOverhead

    const analysis = analyzeText(sample.text)

    // 추정 공식들
    const est_div15 = Math.ceil(sample.text.length / 1.5)
    const est_div185 = Math.ceil(sample.text.length / 1.85)

    // 새 공식: 한국어 글자는 ~0.7 토큰, 영어 단어는 ~1.3 토큰, 기타는 ~0.5 토큰
    // 간단히: 한국어 비율에 따라 divisor를 조정
    const dynamicDivisor = 1.5 + (analysis.koreanRatio * 0.6) - (analysis.englishRatio * 0.2)
    const est_weighted = Math.ceil(sample.text.length / dynamicDivisor)

    const acc = (est: number, actual: number) =>
      actual > 0 ? Math.round((1 - Math.abs(est - actual) / actual) * 1000) / 10 : 0

    results.push({
      label: sample.label,
      type: sample.type,
      charCount: sample.text.length,
      koreanRatio: Math.round(analysis.koreanRatio * 100) / 100,
      englishRatio: Math.round(analysis.englishRatio * 100) / 100,
      actualTokens,
      est_div15,
      est_div185,
      est_weighted,
      acc_div15: acc(est_div15, actualTokens),
      acc_div185: acc(est_div185, actualTokens),
      acc_weighted: acc(est_weighted, actualTokens),
    })

    console.log(`  ✅ ${actualTokens} 토큰 (한국어 ${Math.round(analysis.koreanRatio * 100)}%, 영어 ${Math.round(analysis.englishRatio * 100)}%)`)

    await new Promise((r) => setTimeout(r, 300))
  }

  // ── 결과 출력 ──────────────────────────────────────────────

  console.log('\n\n')
  console.log('═'.repeat(120))
  console.log('  📊 추정 공식별 정확도 비교')
  console.log('═'.repeat(120))

  console.log('\n  %-30s %5s %5s %5s | %8s %6s | %8s %6s | %8s %6s',
    '텍스트', '글자', '한%', '실제', '÷1.5', '정확도', '÷1.85', '정확도', '가중치', '정확도')
  console.log('  ' + '─'.repeat(110))

  for (const r of results) {
    console.log(
      `  %-30s %5d %4d%% %5d | %8d %5.1f%% | %8d %5.1f%% | %8d %5.1f%%`,
      r.label,
      r.charCount,
      Math.round(r.koreanRatio * 100),
      r.actualTokens,
      r.est_div15, r.acc_div15,
      r.est_div185, r.acc_div185,
      r.est_weighted, r.acc_weighted
    )
  }

  // 평균 정확도
  const avgAcc15 = Math.round(results.reduce((s, r) => s + r.acc_div15, 0) / results.length * 10) / 10
  const avgAcc185 = Math.round(results.reduce((s, r) => s + r.acc_div185, 0) / results.length * 10) / 10
  const avgAccW = Math.round(results.reduce((s, r) => s + r.acc_weighted, 0) / results.length * 10) / 10

  console.log('  ' + '─'.repeat(110))
  console.log(`  %-30s %5s %5s %5s | %8s %5.1f%% | %8s %5.1f%% | %8s %5.1f%%`,
    '평균 정확도', '', '', '', '', avgAcc15, '', avgAcc185, '', avgAccW)

  // ── 최적 divisor 계산 ──────────────────────────────────────

  console.log('\n\n')
  console.log('═'.repeat(100))
  console.log('  🎯 최적 divisor 계산')
  console.log('═'.repeat(100))

  // 전체 데이터에서 최적 고정 divisor
  const ratios = results.map((r) => r.charCount / r.actualTokens)
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length
  const medianRatio = [...ratios].sort((a, b) => a - b)[Math.floor(ratios.length / 2)]

  console.log(`\n  글자/토큰 비율:`)
  for (const r of results) {
    const ratio = r.charCount / r.actualTokens
    console.log(`    ${r.label}: ${ratio.toFixed(3)} (${r.type})`)
  }
  console.log(`\n  평균: ${avgRatio.toFixed(3)}`)
  console.log(`  중앙값: ${medianRatio.toFixed(3)}`)
  console.log(`\n  → 최적 고정 divisor: ${avgRatio.toFixed(2)}`)

  // 텍스트 타입별 최적 divisor
  const typeGroups = new Map<string, number[]>()
  for (const r of results) {
    if (!typeGroups.has(r.type)) typeGroups.set(r.type, [])
    typeGroups.get(r.type)!.push(r.charCount / r.actualTokens)
  }

  console.log(`\n  타입별 최적 divisor:`)
  for (const [type, typeRatios] of typeGroups) {
    const avg = typeRatios.reduce((a, b) => a + b, 0) / typeRatios.length
    console.log(`    ${type}: ${avg.toFixed(3)}`)
  }

  // ── 개선된 공식 제안 ───────────────────────────────────────

  console.log('\n\n')
  console.log('═'.repeat(100))
  console.log('  💡 개선 제안')
  console.log('═'.repeat(100))
  console.log(`
  현재 공식: Math.ceil(totalChars / 1.5)
  
  개선 옵션 1 (단순): Math.ceil(totalChars / ${avgRatio.toFixed(2)})
  개선 옵션 2 (가중치): 한국어 비율 기반 동적 divisor
    divisor = 1.5 + (koreanRatio * 0.6) - (englishRatio * 0.2)
  `)

  console.log('\n✅ 분석 완료!')
}

main().catch((err) => {
  console.error('분석 중 오류:', err)
  process.exit(1)
})
