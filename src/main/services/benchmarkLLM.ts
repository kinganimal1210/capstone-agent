/**
 * RAG 청킹 최적화 — 실제 LLM API Before/After 비교
 *
 * 구 구현(개선 전)과 신 구현(개선 후)으로 각각 컨텍스트를 빌드하고
 * OpenAI API에 실제 전송하여 토큰 사용량, 응답 품질, 지연시간을 비교합니다.
 *
 * 실행: npx tsx src/main/services/benchmarkLLM.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { buildContext, chunkText, scoreChunk, estimateTokens, truncate, type Chunk } from './contextChunker'
import { callLLM, loadConfigFromEnv } from './llmService'

// ── 구 구현 인라인 (개선 전 로직) ───────────────────────────────

function OLD_estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0
  const len = text.length
  const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) || []).length
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length
  const koreanRatio = koreanChars / len
  const englishRatio = englishChars / len
  const symbolRatio = (len - koreanChars - englishChars) / len
  return Math.ceil(len * ((koreanRatio / 1.6) + (englishRatio / 3.5) + (symbolRatio / 1.2)))
}

function OLD_chunkText(text: string, chunkSize = 500, overlap = 80): string[] {
  if (!text || text.length === 0) return []
  if (text.length <= chunkSize) return [text.trim()]
  const chunks: string[] = []
  const safeStep = Math.max(chunkSize - overlap, 1)
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length)
    if (end < text.length) {
      const slice = text.substring(start, end)
      const lastSentenceEnd = Math.max(
        slice.lastIndexOf('.\n'), slice.lastIndexOf('. '),
        slice.lastIndexOf('다.'), slice.lastIndexOf('요.'), slice.lastIndexOf('\n\n')
      )
      if (lastSentenceEnd > chunkSize * 0.5) end = start + lastSentenceEnd + 2
    }
    const chunk = text.substring(start, end).trim()
    if (chunk.length > 0) chunks.push(chunk)
    start = Math.max(start + safeStep, start + 1)
  }
  return chunks
}

function OLD_scoreChunk(chunk: Chunk, keywords: string[]): number {
  let score = 0
  const textLower = chunk.text.toLowerCase()
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase()
    if (textLower.includes(kwLower)) {
      score += 1
      const regex = new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      const matches = chunk.text.match(regex)
      if (matches && matches.length > 1) score += Math.min(matches.length - 1, 3) * 0.3
    }
  }
  if (chunk.chunkIndex === 0) score += 1
  if (chunk.sourceType === 'meeting') score *= 1.2
  if (chunk.sourceType === 'task') score *= 1.1
  return Math.round(score * 100) / 100
}

function OLD_buildContext(
  sources: { type: 'meeting'|'task'|'document'|'git'; id: number|string; title: string; content: string }[],
  keywords: string[],
  options?: { chunkSize?: number; overlap?: number; topK?: number; maxContextChars?: number }
) {
  const chunkSize = options?.chunkSize ?? 500
  const overlap = options?.overlap ?? 80
  const topK = options?.topK ?? 5
  const maxContextChars = options?.maxContextChars ?? 3000

  const allChunks: Chunk[] = []
  for (const source of sources) {
    const textChunks = OLD_chunkText(source.content, chunkSize, overlap)
    for (let i = 0; i < textChunks.length; i++) {
      const chunk: Chunk = {
        sourceType: source.type, sourceId: source.id, sourceTitle: source.title,
        text: textChunks[i], chunkIndex: i, score: 0,
      }
      chunk.score = OLD_scoreChunk(chunk, keywords)
      allChunks.push(chunk)
    }
  }
  allChunks.sort((a, b) => b.score - a.score)
  const selected: Chunk[] = []
  let totalChars = 0
  for (const chunk of allChunks) {
    if (selected.length >= topK) break
    if (chunk.score <= 0) break  // 구 구현: break (버그)
    if (totalChars + chunk.text.length > maxContextChars) {
      const remaining = maxContextChars - totalChars
      if (remaining > 100) {
        selected.push({ ...chunk, text: chunk.text.substring(0, remaining) + '...(이하 생략)' })
        totalChars += remaining
      }
      break
    }
    selected.push(chunk)
    totalChars += chunk.text.length
  }
  // 구 구현: git 타입 라벨 없음 → '문서'로 표시
  const typeLabel = (t: string) => t === 'meeting' ? '회의록' : t === 'task' ? '태스크' : '문서'
  const contextBlock = selected.map((c, i) => `[${i+1}] (${typeLabel(c.sourceType)}) ${c.sourceTitle}\n${c.text}`).join('\n---\n')
  return { contextBlock, selectedChunks: selected, totalChars, estimatedTokens: OLD_estimateTokens(contextBlock) }
}

// ── 테스트 데이터 ─────────────────────────────────────────────────
// compareChunking.ts와 유사하지만, 더 현실적인 데이터 사용

const SAMPLE_MEETING_1 = `1주차 킥오프 회의 (2024-03-04)
참석자: 김철수, 이영희, 박민수

김철수: 오늘은 프로젝트 목표와 역할을 정하겠습니다. 우리가 만들 것은 데스크톱 AI 에이전트입니다.
이영희: LLM 연동 부분을 제가 담당하면 좋겠습니다. RAG 파이프라인도 포함해서요.
박민수: 저는 DB와 파일 스캔 쪽을 맡겠습니다. SQLite로 설계할 예정입니다.
김철수: 좋습니다. UI는 제가 맡겠습니다. React와 TailwindCSS를 사용하겠습니다.

결정사항:
- UI 프레임워크: React + TailwindCSS
- DB: SQLite (sql.js)
- LLM: OpenAI GPT-4o-mini (비용 절감 목적)
- 매주 월요일 오후 2시 정기 회의`

const SAMPLE_MEETING_2 = `7주차 정기 회의 (2024-04-22)
참석자: 김철수, 이영희

이영희: RAG 파이프라인 구현을 시작했습니다. 현재 컨텍스트가 너무 길어서 토큰 비용이 많이 나옵니다.
김철수: 구체적으로 얼마나 나오나요?
이영희: 질문 하나에 약 2000토큰이 들어갑니다. GPT-4o-mini 기준으로 1000건 질의하면 약 2달러입니다.
김철수: 청킹(Chunking)과 트런케이션(Truncation)을 적용하면 줄일 수 있지 않을까요?
이영희: 맞습니다. Top-K 방식으로 관련 청크만 선택하면 토큰을 60-70% 절감할 수 있을 것 같아요.
이영희: 추가로 키워드 전처리와 스코어링을 결합하면 답변 품질도 유지할 수 있습니다.
김철수: 그러면 이번 주 안에 프로토타입을 만들어봐요.

액션아이템:
- 이영희: contextChunker.ts 구현 (마감: 4/26)
- 이영희: promptBuilder.ts 구현 (마감: 4/26)
- 김철수: Dashboard UI에 RAG 결과 연동 (마감: 4/29)`

const SAMPLE_TASKS = `1. RAG 파이프라인 구현
   담당: 이영희 | 상태: 진행중 | 마감: 9주차 | 우선순위: HIGH
   세부: contextChunker, promptBuilder, promptPreprocessor 모듈 개발

2. UI 대시보드 완성
   담당: 김철수 | 상태: 완료 | 마감: 6주차 | 우선순위: HIGH
   세부: 로그인, 메인 대시보드, 태스크 목록 페이지 구현 완료

3. SQLite DB 스키마 설계
   담당: 박민수 | 상태: 완료 | 마감: 3주차 | 우선순위: HIGH
   세부: meetings, tasks, documents, evidence_logs 테이블 설계

4. 토큰 최적화 벤치마크
   담당: 이영희 | 상태: 대기 | 마감: 10주차 | 우선순위: MEDIUM
   세부: 청킹 적용 전/후 토큰 사용량 비교 분석`

const DUMMY_NOISE = Array.from({ length: 30 })
  .map((_, i) => `[시스템 로그 ${i}] 2024-04-22 ${10+i}:00 - 정상 동작 확인. 응답시간: ${100+i}ms. 오류 없음.`)
  .join('\n')

const SOURCES = [
  { type: 'meeting' as const, id: 1, title: '1주차 킥오프 회의', content: SAMPLE_MEETING_1 },
  { type: 'meeting' as const, id: 2, title: '7주차 정기 회의', content: SAMPLE_MEETING_2 },
  { type: 'task' as const, id: 10, title: '프로젝트 태스크 목록', content: SAMPLE_TASKS },
  { type: 'document' as const, id: 20, title: '시스템 로그 (노이즈)', content: DUMMY_NOISE },
]

const TEST_CASES = [
  {
    question: '이영희가 말한 토큰 비용 절감 방법이 뭐야?',
    keywords: ['이영희', '토큰', '비용', '절감'],
  },
  {
    question: 'RAG 파이프라인 담당자와 마감일 알려줘',
    keywords: ['RAG', '파이프라인', '담당', '마감'],
  },
  {
    question: '킥오프 회의에서 결정된 기술 스택은?',
    keywords: ['킥오프', '회의', '결정', '기술'],
  },
]

const CTX_OPTIONS = { chunkSize: 400, overlap: 60, topK: 3, maxContextChars: 1800 }

// ── 유틸 ──────────────────────────────────────────────────────────

function sep(c = '─', n = 90) { return c.repeat(n) }
function pct(a: number, b: number) {
  if (b === 0) return 'N/A'
  const d = ((a - b) / b * 100)
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`
}

// ── 메인 ──────────────────────────────────────────────────────────

async function main() {
  const config = loadConfigFromEnv('openai')
  console.log(sep('═'))
  console.log('  🚀 RAG 청킹 최적화 — 실제 OpenAI API Before/After 비교')
  console.log(`  모델: ${config.model ?? 'gpt-4o-mini'}`)
  console.log(sep('═'))

  const results: Array<{
    q: string
    oldPromptTokens: number; oldCompletion: number; oldLatency: number; oldAnswer: string; oldCtxChars: number; oldEstTokens: number
    newPromptTokens: number; newCompletion: number; newLatency: number; newAnswer: string; newCtxChars: number; newEstTokens: number
    oldSelectedChunks: number; newSelectedChunks: number
  }> = []

  for (const tc of TEST_CASES) {
    console.log(`\n${sep()}`)
    console.log(`❓ 질문: "${tc.question}"`)
    console.log(sep())

    // ── 구 구현 ──
    const oldCtx = OLD_buildContext(SOURCES, tc.keywords, CTX_OPTIONS)
    const oldMessages = [
      { role: 'system' as const, content: '프로젝트 관리 AI. 아래 참고자료 기반으로 답변. 자료에 없으면 "해당 정보 없음" 표기.' },
      { role: 'user' as const, content: `## 참고 자료\n${oldCtx.contextBlock}\n\n## 질문\n${tc.question}` },
    ]

    console.log(`\n  [구 구현] 컨텍스트 빌드 완료`)
    console.log(`    선택 청크: ${oldCtx.selectedChunks.length}개 | 컨텍스트: ${oldCtx.totalChars}자 | 예상토큰: ${oldCtx.estimatedTokens}`)

    const t0 = Date.now()
    const oldRes = await callLLM(oldMessages, config)
    const oldLatency = Date.now() - t0

    console.log(`    실제토큰: 입력 ${oldRes.usage?.promptTokens} | 출력 ${oldRes.usage?.completionTokens} | 응답: ${oldLatency}ms`)
    console.log(`    답변: "${oldRes.content.substring(0, 100).replace(/\n/g, ' ')}..."`)

    await new Promise(r => setTimeout(r, 800))

    // ── 신 구현 ──
    const newCtx = buildContext(SOURCES, tc.keywords, CTX_OPTIONS)
    const newMessages = [
      { role: 'system' as const, content: '프로젝트 관리 AI. 아래 참고자료 기반으로 답변. 자료에 없으면 "해당 정보 없음" 표기.' },
      { role: 'user' as const, content: `## 참고 자료\n${newCtx.contextBlock}\n\n## 질문\n${tc.question}` },
    ]

    console.log(`\n  [신 구현] 컨텍스트 빌드 완료`)
    console.log(`    선택 청크: ${newCtx.stats.selectedChunks}개 | 컨텍스트: ${newCtx.stats.totalChars}자 | 예상토큰: ${newCtx.stats.estimatedTokens}`)

    const t1 = Date.now()
    const newRes = await callLLM(newMessages, config)
    const newLatency = Date.now() - t1

    console.log(`    실제토큰: 입력 ${newRes.usage?.promptTokens} | 출력 ${newRes.usage?.completionTokens} | 응답: ${newLatency}ms`)
    console.log(`    답변: "${newRes.content.substring(0, 100).replace(/\n/g, ' ')}..."`)

    results.push({
      q: tc.question,
      oldPromptTokens: oldRes.usage?.promptTokens ?? 0,
      oldCompletion: oldRes.usage?.completionTokens ?? 0,
      oldLatency,
      oldAnswer: oldRes.content,
      oldCtxChars: oldCtx.totalChars,
      oldEstTokens: oldCtx.estimatedTokens,
      newPromptTokens: newRes.usage?.promptTokens ?? 0,
      newCompletion: newRes.usage?.completionTokens ?? 0,
      newLatency,
      newAnswer: newRes.content,
      newCtxChars: newCtx.stats.totalChars,
      newEstTokens: newCtx.stats.estimatedTokens,
      oldSelectedChunks: oldCtx.selectedChunks.length,
      newSelectedChunks: newCtx.stats.selectedChunks,
    })

    await new Promise(r => setTimeout(r, 800))
  }

  // ── 결과 종합 ─────────────────────────────────────────────────

  console.log('\n\n' + sep('═'))
  console.log('  📊 최종 비교 분석 결과')
  console.log(sep('═'))

  let totalOldPrompt = 0, totalNewPrompt = 0
  let totalOldComp = 0, totalNewComp = 0
  let totalOldLatency = 0, totalNewLatency = 0

  for (const r of results) {
    totalOldPrompt += r.oldPromptTokens; totalNewPrompt += r.newPromptTokens
    totalOldComp += r.oldCompletion; totalNewComp += r.newCompletion
    totalOldLatency += r.oldLatency; totalNewLatency += r.newLatency
  }

  console.log('\n  ┌─ 질문별 입력 토큰 비교')
  console.log('  │  ' + '질문'.padEnd(30) + '  구 구현    신 구현    절감량    절감률')
  console.log('  ├' + '─'.repeat(75))
  for (const r of results) {
    const saved = r.oldPromptTokens - r.newPromptTokens
    console.log(`  │  ${r.q.substring(0, 28).padEnd(30)}  ${String(r.oldPromptTokens).padEnd(9)}  ${String(r.newPromptTokens).padEnd(9)}  ${String(saved).padEnd(8)}  ${pct(r.newPromptTokens, r.oldPromptTokens)}`)
  }
  console.log('  └' + '─'.repeat(75))

  console.log('\n  ┌─ 종합 수치')
  console.log(`  │  입력 토큰 합계:  구 ${totalOldPrompt} → 신 ${totalNewPrompt}  (${pct(totalNewPrompt, totalOldPrompt)})`)
  console.log(`  │  출력 토큰 합계:  구 ${totalOldComp} → 신 ${totalNewComp}`)
  console.log(`  │  총 토큰 합계:    구 ${totalOldPrompt+totalOldComp} → 신 ${totalNewPrompt+totalNewComp}  (${pct(totalNewPrompt+totalNewComp, totalOldPrompt+totalOldComp)})`)
  console.log(`  │  평균 응답시간:   구 ${Math.round(totalOldLatency/results.length)}ms → 신 ${Math.round(totalNewLatency/results.length)}ms`)
  console.log('  └' + '─'.repeat(75))

  // 토큰 추정 정확도
  console.log('\n  ┌─ 토큰 추정 정확도 (예상 vs 실제 입력 토큰)')
  for (const r of results) {
    const oldAcc = (1 - Math.abs(r.oldEstTokens - r.oldPromptTokens) / r.oldPromptTokens) * 100
    const newAcc = (1 - Math.abs(r.newEstTokens - r.newPromptTokens) / r.newPromptTokens) * 100
    console.log(`  │  Q: "${r.q.substring(0, 22)}..."`)
    console.log(`  │     구 구현: 예측 ${r.oldEstTokens} / 실제 ${r.oldPromptTokens} → 정확도 ${oldAcc.toFixed(1)}%`)
    console.log(`  │     신 구현: 예측 ${r.newEstTokens} / 실제 ${r.newPromptTokens} → 정확도 ${newAcc.toFixed(1)}%`)
  }
  console.log('  └' + '─'.repeat(75))

  // GPT-4o-mini 비용 환산 (1M 입력토큰 = $0.15)
  const PRICE_PER_TOKEN = 0.15 / 1_000_000
  const oldCostPer1k = totalOldPrompt * PRICE_PER_TOKEN / results.length * 1000
  const newCostPer1k = totalNewPrompt * PRICE_PER_TOKEN / results.length * 1000
  console.log('\n  ┌─ 비용 환산 (gpt-4o-mini 기준, 1000건 질의 시)')
  console.log(`  │  구 구현: $${(oldCostPer1k).toFixed(4)} / 1000건`)
  console.log(`  │  신 구현: $${(newCostPer1k).toFixed(4)} / 1000건`)
  console.log(`  │  절감액:  $${(oldCostPer1k - newCostPer1k).toFixed(4)} / 1000건  (${pct(newCostPer1k, oldCostPer1k)})`)
  console.log('  └' + '─'.repeat(75))

  console.log('\n' + sep('═'))
  console.log('  ✅ 벤치마크 완료')
  console.log(sep('═'))
}

main().catch(console.error)
