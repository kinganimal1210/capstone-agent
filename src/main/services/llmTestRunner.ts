/**
 * LLM 연동 성능 테스트 스크립트
 *
 * 기존 청킹 & 프롬프트 파이프라인을 실제 LLM API에 연결하여
 * 컨텍스트 청킹/트런케이션 성능을 비교합니다.
 *
 * 실행 방법:
 *   1. .env 파일에 API 키 설정 (아래 중 하나 이상)
 *      OPENAI_API_KEY=sk-...
 *      CLAUDE_API_KEY=sk-ant-...  (또는 ANTHROPIC_API_KEY)
 *      GEMINI_API_KEY=AI...       (또는 GOOGLE_API_KEY)
 *
 *   2. 실행
 *      npx tsx src/main/services/llmTestRunner.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// .env 파일 로드
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { buildChatMessages, type PromptBuildInput } from './promptBuilder'
import { callLLM, loadConfigFromEnv, type LLMProvider, type LLMResponse } from './llmService'

// ── 테스트 데이터 ────────────────────────────────────────────────

const SAMPLE_MEETING = `프로젝트 킥오프 회의가 진행되었다. 참석자는 김철수, 이영희, 박민수이다.

1. 프로젝트 목표 설정
프로젝트의 주요 목표는 데스크톱 AI 에이전트 시스템을 개발하는 것이다. 사용자가 로컬 데이터를 기반으로 질문하고 답변을 받을 수 있는 시스템을 구축한다. 주요 기능으로는 회의록 관리, 태스크 추적, 문서 검색, Git 활동 분석이 포함된다.

2. 역할 분담
김철수: 프론트엔드 UI 개발 및 Electron 앱 구조 설계를 담당한다. React와 TailwindCSS를 활용하여 사용자 인터페이스를 구현한다.
이영희: 백엔드 로직 및 LLM 연동을 담당한다. OpenAI API를 활용하여 RAG 파이프라인을 구축하고 프롬프트 최적화를 수행한다.
박민수: 데이터베이스 설계 및 문서 처리 모듈을 담당한다. SQLite 스키마 설계와 파일 스캔 기능을 구현한다.

3. 일정 계획
1주차~3주차: 기본 앱 구조 및 DB 스키마 구현을 완료한다.
4주차~6주차: 핵심 기능 개발 (회의록, 태스크, 문서 관리)을 진행한다.
7주차~9주차: LLM 연동 및 RAG 파이프라인을 구현한다.
10주차~12주차: 테스트 및 최적화를 수행한다.

4. 결정 사항
- 데이터베이스는 SQLite(sql.js)를 사용하기로 결정했다.
- UI 프레임워크는 React + TailwindCSS로 결정했다.
- LLM은 OpenAI GPT-4를 기본으로 하되, 비용 절감을 위해 GPT-3.5도 지원한다.
- 매주 월요일 오후 2시에 정기 회의를 진행한다.`

const SAMPLE_SOURCES: PromptBuildInput['sources'] = [
  {
    type: 'meeting',
    id: 1,
    title: '프로젝트 킥오프 회의',
    content: SAMPLE_MEETING,
  },
  {
    type: 'task',
    id: 10,
    title: 'LLM 연동 구현',
    content:
      'OpenAI API를 연동하여 RAG 파이프라인을 구축한다. 담당자: 이영희. 마감일: 9주차. 상태: 진행중. 우선순위: high. 세부 내용: 프롬프트 전처리, 컨텍스트 청킹, 토큰 최적화를 포함한다.',
  },
  {
    type: 'task',
    id: 11,
    title: 'UI 디자인 완성',
    content:
      '로그인 화면과 대시보드 UI를 완성한다. 담당자: 김철수. 마감일: 6주차. 상태: done. 우선순위: medium.',
  },
  {
    type: 'task',
    id: 12,
    title: 'DB 스키마 설계',
    content:
      'SQLite 스키마를 설계하고 sql.js로 구현한다. 담당자: 박민수. 마감일: 3주차. 상태: done. 테이블: meetings, tasks, documents, evidence_logs.',
  },
  {
    type: 'document',
    id: 20,
    title: 'README.md',
    content:
      '# Capstone Agent\n데스크톱 AI 에이전트 시스템입니다. Node.js, Electron, React를 사용합니다.\n\n## 주요 기능\n- 회의록 관리\n- 태스크 추적\n- 문서 검색\n- Git 활동 분석\n- LLM 기반 질의응답',
  },
]

const TEST_QUESTIONS = [
  'LLM 연동 담당자가 누구야? 일정도 알려줘',
  '현재 프로젝트에서 진행 중인 태스크는 어떤 것들이 있어?',
  '킥오프 회의에서 결정된 기술 스택 정리해줘',
]

// ── 테스트 시나리오 정의 ─────────────────────────────────────────

interface TestScenario {
  name: string
  description: string
  contextOptions: PromptBuildInput['contextOptions']
}

const SCENARIOS: TestScenario[] = [
  {
    name: '기본 설정',
    description: 'chunkSize=500, overlap=80, topK=5, maxContext=3000',
    contextOptions: {}, // 기본값 사용
  },
  {
    name: '작은 청크 + 적은 컨텍스트',
    description: 'chunkSize=200, overlap=30, topK=3, maxContext=1000',
    contextOptions: { chunkSize: 200, overlap: 30, topK: 3, maxContextChars: 1000 },
  },
  {
    name: '큰 청크 + 많은 컨텍스트',
    description: 'chunkSize=800, overlap=100, topK=7, maxContext=5000',
    contextOptions: { chunkSize: 800, overlap: 100, topK: 7, maxContextChars: 5000 },
  },
  {
    name: '오버랩 없음',
    description: 'chunkSize=500, overlap=0, topK=5, maxContext=3000',
    contextOptions: { chunkSize: 500, overlap: 0, topK: 5, maxContextChars: 3000 },
  },
]

// ── 테스트 실행 ──────────────────────────────────────────────────

interface TestResult {
  scenario: string
  question: string
  provider: LLMProvider
  model: string
  promptChars: number
  estimatedTokens: number
  actualPromptTokens?: number
  actualCompletionTokens?: number
  actualTotalTokens?: number
  latencyMs: number
  selectedChunks: number
  totalChunks: number
  responsePreview: string
}

/**
 * 사용 가능한 provider 목록을 확인합니다.
 */
function getAvailableProviders(): LLMProvider[] {
  const providers: LLMProvider[] = []

  if (process.env.OPENAI_API_KEY) providers.push('openai')
  if (process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY) providers.push('claude')
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) providers.push('gemini')

  return providers
}

/**
 * 단일 테스트 케이스를 실행합니다.
 */
async function runSingleTest(
  question: string,
  scenario: TestScenario,
  provider: LLMProvider
): Promise<TestResult> {
  // 1. 프롬프트 빌드
  const { messages, contextResult, stats } = buildChatMessages({
    userQuestion: question,
    sources: SAMPLE_SOURCES,
    contextOptions: scenario.contextOptions,
  })

  // 2. LLM 호출
  const config = loadConfigFromEnv(provider)
  let response: LLMResponse

  try {
    response = await callLLM(messages, config)
  } catch (error: any) {
    console.error(`  ❌ ${provider} 호출 실패: ${error.message}`)
    return {
      scenario: scenario.name,
      question,
      provider,
      model: config.model ?? '(default)',
      promptChars: stats.totalChars,
      estimatedTokens: stats.estimatedTokens,
      latencyMs: 0,
      selectedChunks: contextResult.stats.selectedChunks,
      totalChunks: contextResult.stats.totalChunks,
      responsePreview: `ERROR: ${error.message}`,
    }
  }

  return {
    scenario: scenario.name,
    question,
    provider,
    model: response.model,
    promptChars: stats.totalChars,
    estimatedTokens: stats.estimatedTokens,
    actualPromptTokens: response.usage?.promptTokens,
    actualCompletionTokens: response.usage?.completionTokens,
    actualTotalTokens: response.usage?.totalTokens,
    latencyMs: response.latencyMs,
    selectedChunks: contextResult.stats.selectedChunks,
    totalChunks: contextResult.stats.totalChunks,
    responsePreview: response.content.substring(0, 150) + (response.content.length > 150 ? '...' : ''),
  }
}

/**
 * 결과를 테이블 형태로 출력합니다.
 */
function printResults(results: TestResult[]): void {
  console.log('\n')
  console.log('═'.repeat(100))
  console.log('  📊 테스트 결과 종합')
  console.log('═'.repeat(100))

  // 시나리오별 그룹핑
  const byScenario = new Map<string, TestResult[]>()
  for (const r of results) {
    if (!byScenario.has(r.scenario)) byScenario.set(r.scenario, [])
    byScenario.get(r.scenario)!.push(r)
  }

  for (const [scenario, scenarioResults] of byScenario) {
    console.log(`\n┌─ 시나리오: ${scenario}`)
    console.log('├' + '─'.repeat(99))

    for (const r of scenarioResults) {
      console.log(`│  질문: "${r.question.substring(0, 40)}..."`)
      console.log(`│  Provider: ${r.provider} (${r.model})`)
      console.log(`│  프롬프트: ${r.promptChars}자 (예상 ${r.estimatedTokens} 토큰)`)
      if (r.actualTotalTokens) {
        console.log(`│  실제 토큰: 입력 ${r.actualPromptTokens} + 출력 ${r.actualCompletionTokens} = 총 ${r.actualTotalTokens}`)
      }
      console.log(`│  청크: ${r.selectedChunks}/${r.totalChunks}개 선택됨`)
      console.log(`│  지연시간: ${r.latencyMs}ms`)
      console.log(`│  응답: ${r.responsePreview}`)
      console.log('├' + '─'.repeat(99))
    }

    console.log('└' + '─'.repeat(99))
  }

  // 토큰 예측 정확도 분석
  const withActualTokens = results.filter((r) => r.actualPromptTokens !== undefined)
  if (withActualTokens.length > 0) {
    console.log('\n')
    console.log('═'.repeat(100))
    console.log('  🔍 토큰 예측 정확도 분석')
    console.log('═'.repeat(100))

    for (const r of withActualTokens) {
      const ratio = r.actualPromptTokens! / r.estimatedTokens
      const accuracy = (1 - Math.abs(1 - ratio)) * 100
      console.log(
        `  [${r.provider}] ${r.scenario} | 예측: ${r.estimatedTokens} → 실제: ${r.actualPromptTokens} | 비율: ${ratio.toFixed(2)} | 정확도: ${accuracy.toFixed(1)}%`
      )
    }
  }

  // 지연시간 비교
  console.log('\n')
  console.log('═'.repeat(100))
  console.log('  ⏱️  Provider별 평균 지연시간')
  console.log('═'.repeat(100))

  const byProvider = new Map<string, number[]>()
  for (const r of results) {
    if (r.latencyMs === 0) continue // 에러 케이스 제외
    if (!byProvider.has(r.provider)) byProvider.set(r.provider, [])
    byProvider.get(r.provider)!.push(r.latencyMs)
  }

  for (const [provider, latencies] of byProvider) {
    const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    const min = Math.min(...latencies)
    const max = Math.max(...latencies)
    console.log(`  ${provider}: 평균 ${avg}ms (최소 ${min}ms, 최대 ${max}ms)`)
  }
}

// ── 메인 ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═'.repeat(100))
  console.log('  🚀 LLM 연동 컨텍스트 청킹/트런케이션 성능 테스트')
  console.log('═'.repeat(100))

  // 사용 가능한 provider 확인
  const providers = getAvailableProviders()

  if (providers.length === 0) {
    console.error('\n❌ 사용 가능한 LLM API 키가 없습니다!')
    console.error('\n프로젝트 루트에 .env 파일을 생성하고 아래 중 하나 이상을 설정하세요:\n')
    console.error('  OPENAI_API_KEY=sk-...')
    console.error('  CLAUDE_API_KEY=sk-ant-...')
    console.error('  GEMINI_API_KEY=AI...')
    console.error('\n혹은 ANTHROPIC_API_KEY, GOOGLE_API_KEY도 사용 가능합니다.')
    process.exit(1)
  }

  console.log(`\n✅ 사용 가능한 provider: ${providers.join(', ')}`)
  console.log(`📋 테스트 시나리오: ${SCENARIOS.length}개`)
  console.log(`❓ 테스트 질문: ${TEST_QUESTIONS.length}개`)
  console.log(`🔢 총 테스트 수: ${SCENARIOS.length * TEST_QUESTIONS.length * providers.length}개`)

  // 사용자 선택 (CLI 인자로 특정 provider만 테스트 가능)
  const targetProvider = process.argv[2] as LLMProvider | undefined
  const activeProviders = targetProvider ? [targetProvider] : providers

  // 사용자 선택 (CLI 인자로 특정 시나리오만 테스트 가능)
  const targetScenarioIndex = process.argv[3] ? parseInt(process.argv[3], 10) : undefined
  const activeScenarios =
    targetScenarioIndex !== undefined ? [SCENARIOS[targetScenarioIndex]] : SCENARIOS

  const results: TestResult[] = []

  for (const scenario of activeScenarios) {
    console.log(`\n${'─'.repeat(80)}`)
    console.log(`📦 시나리오: ${scenario.name}`)
    console.log(`   ${scenario.description}`)
    console.log('─'.repeat(80))

    for (const question of TEST_QUESTIONS) {
      for (const provider of activeProviders) {
        console.log(`\n  🔄 [${provider}] "${question.substring(0, 35)}..."`)

        const result = await runSingleTest(question, scenario, provider)
        results.push(result)

        if (!result.responsePreview.startsWith('ERROR')) {
          console.log(`  ✅ ${result.latencyMs}ms | 토큰: ${result.actualTotalTokens ?? '?'}`)
        }

        // API rate limit 방지를 위한 짧은 대기
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }

  // 결과 출력
  printResults(results)

  console.log('\n✅ 테스트 완료!')
}

main().catch((err) => {
  console.error('테스트 실행 중 오류:', err)
  process.exit(1)
})
