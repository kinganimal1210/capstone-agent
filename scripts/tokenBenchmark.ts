/**
 * 토큰 사용량 벤치마크 스크립트
 *
 * git 저장소를 data source로 사용하여 4가지 질문 유형(SS/SC/LS/LC) × 20개 = 총 80개 질문을
 * 자동으로 LLM(OpenAI gpt-4o-mini)에 보내고, 실제 토큰 사용량을 측정합니다.
 *
 * 실행:
 *   npx tsx scripts/tokenBenchmark.ts
 *
 * 출력:
 *   - scripts/token_benchmark_results.csv  (개별 질문별 결과)
 *   - scripts/token_benchmark_summary.csv  (유형별 평균 요약)
 *   - 콘솔에 요약 테이블 출력
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// .env 로드
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { buildChatMessages } from '../src/main/services/promptBuilder'
import { callLLM, loadConfigFromEnv } from '../src/main/services/llmService'
import { getRecentCommits, getRepoInfo } from '../src/main/services/gitService'
import { classifyQuestion } from '../src/main/services/questionClassifier'

// ── 설정 ─────────────────────────────────────────────────────────

const GIT_REPO_PATH = path.resolve(__dirname, '..')
const DELAY_MS = 1500 // API rate limit 방지용 딜레이

// 질문 유형별 기본 파라미터 (adaptiveParams.ts의 DEFAULT_PARAMS 재현)
const DEFAULT_PARAMS: Record<string, { chunkSize: number; overlap: number; topK: number; maxContextChars: number }> = {
  short_simple:  { chunkSize: 400, overlap: 60, topK: 3, maxContextChars: 2000 },
  short_complex: { chunkSize: 500, overlap: 80, topK: 5, maxContextChars: 3000 },
  long_simple:   { chunkSize: 500, overlap: 60, topK: 4, maxContextChars: 2500 },
  long_complex:  { chunkSize: 600, overlap: 100, topK: 7, maxContextChars: 4000 },
}

const DEFAULT_WEIGHTS = {
  wKeywordBase: 1.0,
  wFreqBonus: 0.3,
  wPositionBonus: 0.5,
  wTitleMatch: 0.8,
  wFirstChunk: 1.0,
  wMeetingType: 1.2,
  wTaskType: 1.1,
}

// ── 질문 유형 정의 ──────────────────────────────────────────────

type Category = 'SS' | 'SC' | 'LS' | 'LC'

interface QuestionEntry {
  category: Category
  question: string
}

// ── 질문 목록 (유형별 20개, 총 80개) ────────────────────────────

// SS: Short Simple — 짧고 간단한 질문 (≤50토큰, 복잡도 키워드 없음)
const SS_QUESTIONS: string[] = [
  '최근 커밋 내용 알려줘',
  '마지막 커밋 작성자 누구야?',
  '현재 브랜치 이름 알려줘',
  '전체 커밋 수 몇 개야?',
  '가장 최근 커밋 날짜 알려줘',
  '원격 저장소 URL 알려줘',
  '최근 5개 커밋 요약해줘',
  '커밋 메시지 목록 보여줘',
  '어제 커밋된 내용 있어?',
  '이번 주 커밋 현황 알려줘',
  '가장 많이 커밋한 사람 누구야?',
  '최근 커밋에서 수정된 파일 알려줘',
  '오늘 푸시된 커밋 있어?',
  '마지막 커밋 해시값 알려줘',
  '커밋 히스토리 요약해줘',
  '프로젝트 개발 현황 알려줘',
  '최근 변경사항 요약해줘',
  '코드 수정 내역 보여줘',
  '프로젝트 진행 상태 알려줘',
  '최근 활동 내역 알려줘',
]

// SC: Short Complex — 짧고 복잡한 질문 (≤50토큰, 비교/분석/조건 키워드 포함)
const SC_QUESTIONS: string[] = [
  '최근 커밋과 이전 커밋의 차이점 분석해줘',
  '커밋 빈도와 코드 품질의 관계 분석해줘',
  '만약 새로운 기능을 추가한다면 어떤 파일을 수정해야 할까?',
  '커밋 패턴을 분석해서 개발 속도 평가해줘',
  '최근 커밋의 원인과 영향을 추론해줘',
  '커밋 메시지를 분석해서 작업 유형별로 분류해줘',
  '버그 수정 커밋과 기능 추가 커밋을 비교해줘',
  '코드 변경량을 분석해서 리팩토링 필요 여부 판단해줘',
  '커밋 이력을 분석해서 병목 구간 예측해줘',
  '작성자별 커밋 패턴을 비교해서 기여도 평가해줘',
  '만약 배포한다면 어떤 리스크가 있을지 분석해줘',
  '최근 변경사항의 원인과 근거를 추론해줘',
  '코드 복잡도와 커밋 빈도의 관계를 분석해줘',
  '커밋 히스토리 기반으로 프로젝트 건강도를 평가해줘',
  '기능별 개발 진척도를 비교 분석해줘',
  '최근 커밋이 시스템에 미칠 영향을 예측해줘',
  '커밋 패턴으로 개발팀 생산성을 판단해줘',
  '만약 테스트를 강화한다면 어떤 영역을 우선시해야 할지 분석해줘',
  '변경 빈도가 높은 파일의 원인을 추론해줘',
  '프로젝트 구조의 장단점을 커밋 기반으로 평가해줘',
]

// LS: Long Simple — 길고 간단한 질문 (>50토큰, 복잡도 키워드 없음)
const LS_QUESTIONS: string[] = [
  '이 프로젝트의 git 저장소에서 최근 한 달간 이루어진 커밋들의 내용을 시간 순서대로 정리해서 보여줘. 각 커밋의 작성자와 날짜도 포함해줘.',
  '프로젝트 저장소의 전체 커밋 히스토리를 살펴보고, 주요한 마일스톤이 될 만한 커밋들을 날짜와 함께 목록으로 정리해줘.',
  '최근 커밋들에서 어떤 파일들이 주로 수정되었는지 파일명과 수정 횟수를 함께 정리해서 보여줘. 가장 자주 수정된 파일부터 순서대로 나열해줘.',
  '프로젝트의 git 로그를 확인해서 각 개발자가 어떤 작업을 했는지 작성자별로 커밋 내용을 분류해서 보여줘.',
  '이 저장소의 브랜치 정보와 최근 커밋 현황을 포함해서 프로젝트의 전반적인 git 활동 상황을 설명해줘.',
  '최근 10개 커밋의 메시지를 읽어보고, 각 커밋이 어떤 기능이나 수정 작업에 해당하는지 카테고리별로 분류해서 정리해줘.',
  '프로젝트 저장소에서 지난 2주간 이루어진 코드 변경 사항을 요약해줘. 새로 추가된 파일과 삭제된 파일도 구분해서 알려줘.',
  '커밋 로그에서 특정 키워드가 포함된 커밋들을 찾아서 해당 커밋의 날짜, 작성자, 메시지를 표 형태로 정리해줘.',
  '이 프로젝트의 git 저장소 정보를 바탕으로 프로젝트의 시작일부터 현재까지의 개발 타임라인을 정리해줘.',
  '최근 커밋 내역을 바탕으로 현재 진행 중인 주요 개발 작업들이 무엇인지 파악해서 목록으로 정리해줘.',
  '프로젝트의 커밋 히스토리를 주 단위로 그룹핑해서 각 주에 어떤 작업이 이루어졌는지 정리해줘.',
  '저장소의 최근 커밋들을 살펴보고, 프론트엔드 관련 작업과 백엔드 관련 작업을 구분해서 각각 정리해줘.',
  '이 프로젝트의 git 로그에서 가장 많은 파일을 변경한 커밋 5개를 찾아서 해당 커밋의 상세 정보를 보여줘.',
  '프로젝트 저장소의 커밋 데이터를 활용해서 개발팀의 주간 활동 보고서 형태로 정리해줘.',
  '최근 커밋 메시지들을 읽고 프로젝트에서 해결된 버그나 이슈들의 목록을 작성해줘.',
  '저장소의 원격 URL 정보와 현재 브랜치 상태를 포함해서 프로젝트의 git 설정 현황을 전체적으로 알려줘.',
  '이 프로젝트에서 지금까지 수행된 모든 개발 작업을 커밋 로그 기반으로 시간순으로 나열하고 각각에 대해 간단한 설명을 붙여줘.',
  '커밋 히스토리를 기반으로 이 프로젝트에서 사용된 주요 기술 스택이나 프레임워크를 파악해서 알려줘.',
  '최근 커밋들의 내용을 분석하여 이 프로젝트의 현재 개발 단계가 초기인지 중반인지 후반인지 판단할 수 있는 근거를 제시해줘.',
  '프로젝트 저장소의 전체 커밋 수, 마지막 커밋 날짜, 현재 브랜치, 원격 URL 등 기본 정보를 깔끔하게 정리해서 보여줘.',
]

// LC: Long Complex — 길고 복잡한 질문 (>50토큰, 비교/분석/조건/다단계 키워드 포함)
const LC_QUESTIONS: string[] = [
  '최근 커밋 히스토리를 분석해서 개발자별 기여도를 비교하고, 각 개발자의 주요 작업 영역과 커밋 패턴의 차이점을 설명해줘.',
  '프로젝트의 커밋 로그를 분석해서 버그 수정과 기능 추가의 비율을 비교하고, 이를 근거로 현재 프로젝트의 안정성을 평가해줘.',
  '만약 이 프로젝트에 새로운 팀원이 합류한다고 가정하면, 커밋 히스토리를 기반으로 어떤 모듈부터 파악해야 하는지 우선순위를 분석해줘.',
  '최근 한 달간의 커밋 패턴을 주 단위로 분석해서 개발 속도의 추이를 파악하고, 앞으로의 개발 일정에 미칠 영향을 예측해줘.',
  '커밋 메시지를 분석해서 기능 개발, 리팩토링, 버그 수정으로 분류한 뒤, 각 카테고리의 비율을 비교하고 프로젝트 건강도를 판단해줘.',
  '이 저장소의 커밋 히스토리에서 변경 빈도가 높은 파일과 낮은 파일을 비교하고, 자주 변경되는 파일의 원인을 추론한 뒤 리팩토링 제안을 해줘.',
  '만약 이 프로젝트를 다른 팀에 인수인계한다고 가정하면, 커밋 로그를 분석해서 핵심 모듈과 의존 관계를 파악하고, 인수인계 문서에 포함할 내용을 정리해줘.',
  '최근 커밋들의 코드 변경량을 분석해서 대규모 변경과 소규모 변경의 패턴을 비교하고, 코드 리뷰 프로세스 개선을 위한 근거를 제시해줘.',
  '프로젝트의 초기 커밋과 최근 커밋을 비교 분석해서 프로젝트 구조가 어떻게 진화했는지 설명하고, 향후 구조 개선 방향을 예측해줘.',
  '커밋 히스토리를 기반으로 이 프로젝트의 개발 프로세스에서 병목이 되는 영역을 분석하고, 만약 개선한다면 어떤 방법이 효과적일지 판단해줘.',
  '작성자별 커밋 빈도와 커밋 메시지의 품질을 비교 분석하고, 이를 근거로 코드 품질 관리 프로세스의 개선점을 제안해줘.',
  '최근 커밋 히스토리에서 동시에 수정된 파일들의 패턴을 분석해서 모듈 간 결합도를 평가하고, 분리가 필요한 부분을 추론해줘.',
  '프로젝트의 커밋 로그를 분석해서 개발 초기, 중기, 현재 단계를 비교하고, 각 단계에서의 개발 특성과 차이점을 설명해줘.',
  '만약 이 프로젝트의 테스트 커버리지를 높인다면, 커밋 히스토리에서 가장 자주 변경되는 파일들을 분석하고 우선적으로 테스트해야 할 영역의 근거를 제시해줘.',
  '커밋 패턴을 시간대별로 분석해서 개발팀의 작업 습관을 파악하고, 이를 기반으로 코드 리뷰 일정 최적화 방안을 예측해줘.',
  '이 프로젝트의 커밋 이력을 분석한 뒤, 기술 부채가 쌓이고 있는 영역을 추론하고, 해결 우선순위를 비교해서 로드맵 형태로 제안해줘.',
  '최근 커밋의 변경 패턴과 과거의 변경 패턴을 비교 분석해서, 프로젝트의 복잡도 증가 추이를 평가하고 향후 유지보수 난이도를 예측해줘.',
  '프로젝트의 커밋 히스토리를 기반으로 각 모듈의 안정성을 분석하고, 안정적인 모듈과 불안정한 모듈을 비교해서 장단점을 평가한 뒤 개선 방향을 제시해줘.',
  '만약 프로젝트의 아키텍처를 재설계한다고 가정하면, 현재 커밋 히스토리에서 나타나는 문제점을 분석하고, 개선 전후의 차이점을 예측해서 설명해줘.',
  '커밋 로그를 분석해서 이 프로젝트에서 가장 활발하게 개발된 기능과 가장 방치된 기능을 비교하고, 그 원인을 추론한 뒤 향후 개발 전략을 제안해줘.',
]

// ── 질문 목록 통합 ──────────────────────────────────────────────

function buildQuestionList(): QuestionEntry[] {
  const entries: QuestionEntry[] = []
  SS_QUESTIONS.forEach(q => entries.push({ category: 'SS', question: q }))
  SC_QUESTIONS.forEach(q => entries.push({ category: 'SC', question: q }))
  LS_QUESTIONS.forEach(q => entries.push({ category: 'LS', question: q }))
  LC_QUESTIONS.forEach(q => entries.push({ category: 'LC', question: q }))
  return entries
}

// ── Git 소스 수집 ───────────────────────────────────────────────

function collectGitSources(): any[] {
  const sources: any[] = []

  const repoInfo = getRepoInfo(GIT_REPO_PATH)
  sources.push({
    type: 'git',
    id: `repo-${repoInfo.currentBranch}`,
    title: `Git 저장소 요약 (${repoInfo.currentBranch})`,
    content: [
      `저장소 경로: ${repoInfo.path}`,
      `현재 브랜치: ${repoInfo.currentBranch}`,
      `전체 커밋 수: ${repoInfo.totalCommits}`,
      `마지막 커밋 날짜: ${repoInfo.lastCommitDate}`,
      repoInfo.remoteUrl ? `원격 저장소: ${repoInfo.remoteUrl}` : null,
    ].filter(Boolean).join('\n'),
  })

  const commits = getRecentCommits(GIT_REPO_PATH, 50)
  commits.forEach(c => {
    sources.push({
      type: 'git',
      id: c.hash,
      title: `${c.shortHash} ${c.message} (작성자: ${c.author}, 날짜: ${c.date.substring(0, 10)})`,
      content: `해시: ${c.shortHash}\n작성자: ${c.author}\n날짜: ${c.date}\n메시지: ${c.message}`,
    })
  })

  return sources
}

// ── 유형별 기본 파라미터 선택 ────────────────────────────────────

function getContextOptions(category: Category) {
  const map: Record<Category, string> = {
    SS: 'short_simple',
    SC: 'short_complex',
    LS: 'long_simple',
    LC: 'long_complex',
  }
  const params = DEFAULT_PARAMS[map[category]]
  return { ...params, scoringWeights: DEFAULT_WEIGHTS }
}

// ── 결과 타입 ───────────────────────────────────────────────────

interface BenchmarkResult {
  index: number
  category: Category
  classifiedType: string
  question: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedTokens: number
  latencyMs: number
  status: 'success' | 'error'
  error?: string
}

// ── 딜레이 유틸 ─────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── 메인 실행 ───────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(80))
  console.log('  📊 토큰 사용량 벤치마크 (Git Data Source × 4 질문 유형 × 20개)')
  console.log('═'.repeat(80))

  // 1. 환경 확인
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY가 .env 파일에 설정되지 않았습니다.')
    process.exit(1)
  }

  const config = loadConfigFromEnv('openai')
  console.log(`\n🔧 모델: ${config.model ?? 'gpt-4o-mini'} (OpenAI)`)

  // 2. Git 소스 수집
  console.log(`📁 Git 저장소: ${GIT_REPO_PATH}`)
  const gitSources = collectGitSources()
  console.log(`📦 수집된 Git 소스: ${gitSources.length}개 (커밋 ${gitSources.length - 1}개 + 저장소 정보 1개)`)

  // 3. 질문 목록 구성
  const questions = buildQuestionList()
  console.log(`📝 총 질문 수: ${questions.length}개 (SS:20, SC:20, LS:20, LC:20)`)
  console.log('')

  // 4. 벤치마크 실행
  const results: BenchmarkResult[] = []

  for (let i = 0; i < questions.length; i++) {
    const { category, question } = questions[i]
    const idx = i + 1
    const categoryIdx = (i % 20) + 1

    process.stdout.write(`[${idx.toString().padStart(2)}/${questions.length}] ${category}-${categoryIdx.toString().padStart(2)} ... `)

    try {
      // 질문 분류
      const classifiedType = classifyQuestion(question, ['git'])

      // 유형별 파라미터 선택
      const contextOptions = getContextOptions(category)

      // 프롬프트 빌드
      const { messages, stats } = buildChatMessages({
        userQuestion: question,
        sources: gitSources,
        contextOptions,
      })

      // LLM 호출
      const response = await callLLM(messages, config)

      const result: BenchmarkResult = {
        index: idx,
        category,
        classifiedType,
        question,
        promptTokens: response.usage?.promptTokens ?? 0,
        completionTokens: response.usage?.completionTokens ?? 0,
        totalTokens: response.usage?.totalTokens ?? 0,
        estimatedTokens: stats.estimatedTokens,
        latencyMs: response.latencyMs,
        status: 'success',
      }
      results.push(result)

      console.log(
        `✅ prompt=${result.promptTokens} + completion=${result.completionTokens} = total=${result.totalTokens} (${result.latencyMs}ms)`
      )
    } catch (error: any) {
      results.push({
        index: idx,
        category,
        classifiedType: 'error',
        question,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedTokens: 0,
        latencyMs: 0,
        status: 'error',
        error: error.message,
      })
      console.log(`❌ ${error.message}`)
    }

    // API rate limit 방지
    if (i < questions.length - 1) {
      await sleep(DELAY_MS)
    }
  }

  // 5. CSV 저장 (개별 결과)
  const csvHeader = 'index,category,classifiedType,question,promptTokens,completionTokens,totalTokens,estimatedTokens,latencyMs,status,error'
  const csvLines = results.map(r =>
    [
      r.index,
      r.category,
      r.classifiedType,
      `"${r.question.replace(/"/g, '""')}"`,
      r.promptTokens,
      r.completionTokens,
      r.totalTokens,
      r.estimatedTokens,
      r.latencyMs,
      r.status,
      r.error ? `"${r.error.replace(/"/g, '""')}"` : '',
    ].join(',')
  )
  const csvContent = [csvHeader, ...csvLines].join('\n')
  const csvPath = path.resolve(__dirname, 'token_benchmark_results.csv')
  fs.writeFileSync(csvPath, '\uFEFF' + csvContent, 'utf-8') // BOM for Excel
  console.log(`\n📄 개별 결과 저장: ${csvPath}`)

  // 6. 유형별 통계 계산
  const categories: Category[] = ['SS', 'SC', 'LS', 'LC']
  const summaryRows: {
    category: Category
    count: number
    successCount: number
    avgPromptTokens: number
    avgCompletionTokens: number
    avgTotalTokens: number
    avgEstimatedTokens: number
    avgLatencyMs: number
    minTotalTokens: number
    maxTotalTokens: number
  }[] = []

  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat && r.status === 'success')
    const count = catResults.length

    if (count === 0) {
      summaryRows.push({
        category: cat, count: 0, successCount: 0,
        avgPromptTokens: 0, avgCompletionTokens: 0, avgTotalTokens: 0,
        avgEstimatedTokens: 0, avgLatencyMs: 0, minTotalTokens: 0, maxTotalTokens: 0,
      })
      continue
    }

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)
    const avg = (arr: number[]) => Math.round(sum(arr) / arr.length)

    summaryRows.push({
      category: cat,
      count: results.filter(r => r.category === cat).length,
      successCount: count,
      avgPromptTokens: avg(catResults.map(r => r.promptTokens)),
      avgCompletionTokens: avg(catResults.map(r => r.completionTokens)),
      avgTotalTokens: avg(catResults.map(r => r.totalTokens)),
      avgEstimatedTokens: avg(catResults.map(r => r.estimatedTokens)),
      avgLatencyMs: avg(catResults.map(r => r.latencyMs)),
      minTotalTokens: Math.min(...catResults.map(r => r.totalTokens)),
      maxTotalTokens: Math.max(...catResults.map(r => r.totalTokens)),
    })
  }

  // 전체 평균 계산
  const allSuccess = results.filter(r => r.status === 'success')
  const totalAvg = {
    avgPromptTokens: allSuccess.length ? Math.round(allSuccess.reduce((s, r) => s + r.promptTokens, 0) / allSuccess.length) : 0,
    avgCompletionTokens: allSuccess.length ? Math.round(allSuccess.reduce((s, r) => s + r.completionTokens, 0) / allSuccess.length) : 0,
    avgTotalTokens: allSuccess.length ? Math.round(allSuccess.reduce((s, r) => s + r.totalTokens, 0) / allSuccess.length) : 0,
    avgLatencyMs: allSuccess.length ? Math.round(allSuccess.reduce((s, r) => s + r.latencyMs, 0) / allSuccess.length) : 0,
  }

  // 7. 요약 CSV 저장
  const summaryHeader = 'category,count,successCount,avgPromptTokens,avgCompletionTokens,avgTotalTokens,avgEstimatedTokens,avgLatencyMs,minTotalTokens,maxTotalTokens'
  const summaryLines = summaryRows.map(s =>
    [s.category, s.count, s.successCount, s.avgPromptTokens, s.avgCompletionTokens, s.avgTotalTokens, s.avgEstimatedTokens, s.avgLatencyMs, s.minTotalTokens, s.maxTotalTokens].join(',')
  )
  const summaryPath = path.resolve(__dirname, 'token_benchmark_summary.csv')
  fs.writeFileSync(summaryPath, '\uFEFF' + [summaryHeader, ...summaryLines].join('\n'), 'utf-8')
  console.log(`📄 요약 결과 저장: ${summaryPath}`)

  // 8. 콘솔 요약 테이블
  console.log('\n' + '═'.repeat(100))
  console.log('  📊 유형별 토큰 사용량 요약 (평균)')
  console.log('═'.repeat(100))
  console.log(
    '유형'.padEnd(8) +
    '성공/전체'.padEnd(10) +
    'Prompt'.padStart(10) +
    'Completion'.padStart(12) +
    'Total'.padStart(10) +
    'Est.'.padStart(10) +
    'Min'.padStart(8) +
    'Max'.padStart(8) +
    'Latency'.padStart(10)
  )
  console.log('─'.repeat(100))

  const categoryLabels: Record<Category, string> = {
    SS: 'SS(짧단)',
    SC: 'SC(짧복)',
    LS: 'LS(긴단)',
    LC: 'LC(긴복)',
  }

  for (const row of summaryRows) {
    console.log(
      categoryLabels[row.category].padEnd(10) +
      `${row.successCount}/${row.count}`.padEnd(10) +
      row.avgPromptTokens.toString().padStart(8) +
      row.avgCompletionTokens.toString().padStart(12) +
      row.avgTotalTokens.toString().padStart(10) +
      row.avgEstimatedTokens.toString().padStart(10) +
      row.minTotalTokens.toString().padStart(8) +
      row.maxTotalTokens.toString().padStart(8) +
      `${row.avgLatencyMs}ms`.padStart(10)
    )
  }

  console.log('─'.repeat(100))
  console.log(
    '전체 평균'.padEnd(10) +
    `${allSuccess.length}/${results.length}`.padEnd(10) +
    totalAvg.avgPromptTokens.toString().padStart(8) +
    totalAvg.avgCompletionTokens.toString().padStart(12) +
    totalAvg.avgTotalTokens.toString().padStart(10) +
    ''.padStart(10) +
    ''.padStart(8) +
    ''.padStart(8) +
    `${totalAvg.avgLatencyMs}ms`.padStart(10)
  )
  console.log('═'.repeat(100))

  // 9. 분류 정확도 확인
  console.log('\n📋 질문 분류 정확도 확인:')
  const expectedMap: Record<Category, string> = {
    SS: 'short_simple_git',
    SC: 'short_complex_git',
    LS: 'long_simple_git',
    LC: 'long_complex_git',
  }

  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat && r.status === 'success')
    const expected = expectedMap[cat]
    const correct = catResults.filter(r => r.classifiedType === expected).length
    const total = catResults.length
    console.log(`  ${cat}: ${correct}/${total} (${total ? Math.round(correct / total * 100) : 0}%) → 기대: ${expected}`)

    // 오분류된 질문 표시
    const misclassified = catResults.filter(r => r.classifiedType !== expected)
    if (misclassified.length > 0) {
      misclassified.forEach(r => {
        console.log(`    ⚠ #${r.index} "${r.question.substring(0, 40)}..." → ${r.classifiedType}`)
      })
    }
  }

  console.log('\n✅ 벤치마크 완료!')
}

main().catch(err => {
  console.error('❌ 벤치마크 실행 중 오류:', err)
  process.exit(1)
})
