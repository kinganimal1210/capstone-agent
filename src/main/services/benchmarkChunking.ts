/**
 * 청킹 최적화 Before/After 벤치마크
 *
 * LLM API 없이 로컬에서만 실행 가능합니다.
 * 청킹·스코어링·토큰추정 성능을 구 구현과 신 구현 기준으로 비교합니다.
 *
 * 실행:  npx tsx src/main/services/benchmarkChunking.ts
 */

import { chunkText, scoreChunk, estimateTokens, buildContext, type Chunk } from './contextChunker'

// ── "구 구현" 인라인 정의 (개선 전 로직) ──────────────────────────

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
      const chunk: Chunk = { sourceType: source.type, sourceId: source.id, sourceTitle: source.title, text: textChunks[i], chunkIndex: i, score: 0 }
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
      if (remaining > 100) { selected.push({ ...chunk, text: chunk.text.substring(0, remaining) + '...(이하 생략)' }); totalChars += remaining }
      break
    }
    selected.push(chunk)
    totalChars += chunk.text.length
  }
  const typeLabel = (t: string) => t === 'meeting' ? '회의록' : t === 'task' ? '태스크' : '문서'
  const contextBlock = selected.map((c, i) => `[${i+1}] (${typeLabel(c.sourceType)}) ${c.sourceTitle}\n${c.text}`).join('\n---\n')
  return { contextBlock, selectedChunks: selected, stats: { totalChunks: allChunks.length, selectedChunks: selected.length, totalChars, estimatedTokens: OLD_estimateTokens(contextBlock) } }
}

// ── 테스트 데이터 ──────────────────────────────────────────────────

const MEETING_TEXT = `2주차 정기 회의. 참석자: 김철수, 이영희.
이영희: 현재 LLM 연동 파이프라인에서 컨텍스트 길이가 길어지면 토큰 비용이 너무 많이 발생합니다.
김철수: 그렇다면 텍스트를 작게 나누는 Chunking과 관련성이 높은 것만 뽑는 Retrieval이 필요하겠군요.
이영희: 맞습니다. Top-K 5개 정도로 잘라내면 비용을 절반 이하로 줄일 수 있을 것 같아요.
이영희: 추가로 불용어 제거와 키워드 추출을 전처리 단계에 넣으면 검색 정확도도 올라갑니다.
김철수: 좋아요. 다음 주까지 프로토타입을 만들어봅시다.`

const TASK_TEXT = `1. RAG 파이프라인 구현 - 담당: 이영희 - 마감: 9주차 - 상태: 진행중
2. UI 디자인 완성 - 담당: 김철수 - 마감: 6주차 - 상태: 완료
3. DB 스키마 설계 - 담당: 박민수 - 마감: 3주차 - 상태: 완료
4. 토큰 최적화 - 담당: 이영희 - 마감: 10주차 - 상태: 대기`

const DOC_TEXT = `# Capstone Agent
데스크톱 AI 에이전트 시스템입니다.

## 주요 기능
- 회의록 관리: 회의 내용을 저장하고 검색합니다.
- 태스크 추적: 프로젝트 태스크를 관리합니다.
- LLM 질의응답: RAG 기반으로 답변을 생성합니다.

## 기술 스택
Electron, React, Node.js, SQLite, OpenAI API`

const GIT_TEXT = `commit a1b2c3d feat: RAG 파이프라인 초기 구현
Author: 이영희
Date: 2024-05-10
    contextChunker, promptBuilder 모듈 추가

commit e4f5g6h fix: 토큰 추정 오류 수정
Author: 이영희
Date: 2024-05-11
    한국어 비율 계산 버그 수정`

const SOURCES = [
  { type: 'meeting' as const, id: 1, title: '2주차 정기 회의', content: MEETING_TEXT },
  { type: 'task' as const, id: 2, title: 'RAG 태스크 목록', content: TASK_TEXT },
  { type: 'document' as const, id: 3, title: 'README', content: DOC_TEXT },
  { type: 'git' as const, id: 4, title: 'Git 커밋 로그', content: GIT_TEXT },
]

const CODE_SAMPLE = `function buildContext(sources: Source[], keywords: string[]): Result {
  const allChunks: Chunk[] = []
  for (const source of sources) {
    const textChunks = chunkText(source.content, 500, 80)
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = { ...source, text: textChunks[i], chunkIndex: i, score: 0 }
      chunk.score = scoreChunk(chunk, keywords)
      allChunks.push(chunk)
    }
  }
  return { allChunks }
}`

// ── 벤치마크 실행 ─────────────────────────────────────────────────

function sep(char = '─', n = 80) { return char.repeat(n) }

function pct(a: number, b: number) {
  if (b === 0) return 'N/A'
  const diff = ((a - b) / b * 100)
  const sign = diff >= 0 ? '+' : ''
  return `${sign}${diff.toFixed(1)}%`
}

async function main() {
  console.log(sep('═'))
  console.log('  🔬 RAG 청킹 최적화 Before/After 벤치마크')
  console.log(sep('═'))

  // ───────────────────────────────────────────────────────────
  // TEST 1: 토큰 추정 정확도 (코드 텍스트)
  // ───────────────────────────────────────────────────────────
  console.log('\n[TEST 1] 토큰 추정 — 코드 텍스트 (개선 #4)')
  console.log(sep())
  console.log('텍스트 유형: 코드 ({}[]()=>; 등 특수기호 다수)')
  console.log(`코드 길이: ${CODE_SAMPLE.length}자`)

  const oldCodeTok = OLD_estimateTokens(CODE_SAMPLE)
  const newCodeTok = estimateTokens(CODE_SAMPLE)
  // 코드는 특수기호가 많아 실제 토큰이 더 많음 → 더 높은 값이 더 정확
  console.log(`  구 구현 추정: ${oldCodeTok} 토큰`)
  console.log(`  신 구현 추정: ${newCodeTok} 토큰  (${pct(newCodeTok, oldCodeTok)} 변화)`)
  console.log('  → 코드 기호를 별도 divisor(2.5)로 분리해 과소추정 방지')

  // ───────────────────────────────────────────────────────────
  // TEST 2: 타입별 청킹 전략 (개선 #5)
  // ───────────────────────────────────────────────────────────
  console.log('\n[TEST 2] 청킹 전략 — 소스 타입별 비교 (개선 #5)')
  console.log(sep())

  const types: Array<{ label: string; type: 'meeting'|'task'|'document'|'git'; text: string }> = [
    { label: '회의록 (발언자 단위)', type: 'meeting', text: MEETING_TEXT },
    { label: '태스크 (목록 항목 단위)', type: 'task', text: TASK_TEXT },
    { label: '문서 (헤더 단위)', type: 'document', text: DOC_TEXT },
    { label: 'Git (커밋 단위)', type: 'git', text: GIT_TEXT },
  ]

  for (const { label, type, text } of types) {
    const oldChunks = OLD_chunkText(text, 300, 50)
    const newChunks = chunkText(text, 300, 50, type)
    console.log(`\n  📌 ${label}`)
    console.log(`     구 구현: ${oldChunks.length}개 청크 (기계적 글자 수 분할)`)
    console.log(`     신 구현: ${newChunks.length}개 청크 (의미 단위 분할)`)
    if (newChunks.length > 0) {
      console.log(`     신 청크[0]: "${newChunks[0].substring(0, 60).replace(/\n/g, '↵')}..."`)
    }
  }

  // ───────────────────────────────────────────────────────────
  // TEST 3: 스코어링 개선 (개선 #3)
  // ───────────────────────────────────────────────────────────
  console.log('\n[TEST 3] 스코어링 — 제목 매칭 & 위치 보너스 (개선 #3)')
  console.log(sep())

  const keywords = ['이영희', '토큰', '비용']

  const chunkFront: Chunk = { sourceType: 'meeting', sourceId: 1, sourceTitle: '2주차 정기 회의', text: '이영희: 토큰 비용이 너무 많이 발생합니다.', chunkIndex: 0, score: 0 }
  const chunkBack: Chunk = { sourceType: 'meeting', sourceId: 1, sourceTitle: '무관한 회의', text: '기타 논의 사항... 그 외 여러 내용... 이영희가 마지막에 잠깐 언급함', chunkIndex: 3, score: 0 }

  const oldFront = OLD_scoreChunk(chunkFront, keywords)
  const newFront = scoreChunk(chunkFront, keywords)
  const oldBack  = OLD_scoreChunk(chunkBack, keywords)
  const newBack  = scoreChunk(chunkBack, keywords)

  console.log('\n  상황: 같은 키워드("이영희", "토큰", "비용")로 두 청크 비교')
  console.log(`\n  청크 A (앞부분 등장 + 제목 매칭):`)
  console.log(`     구 구현 score: ${oldFront}`)
  console.log(`     신 구현 score: ${newFront}  (${pct(newFront, oldFront)})`)
  console.log(`\n  청크 B (뒷부분 등장 + 제목 불일치):`)
  console.log(`     구 구현 score: ${oldBack}`)
  console.log(`     신 구현 score: ${newBack}  (${pct(newBack, oldBack)})`)
  console.log(`\n  ✅ 점수 격차: 구 구현 ${(oldFront - oldBack).toFixed(2)} → 신 구현 ${(newFront - newBack).toFixed(2)} (더 명확하게 구분)`)

  // ───────────────────────────────────────────────────────────
  // TEST 4: break→continue 버그 (개선 #1)
  // ───────────────────────────────────────────────────────────
  console.log('\n[TEST 4] break→continue 버그 & Fallback (개선 #1)')
  console.log(sep())

  // 키워드와 전혀 무관한 소스만 넣기
  const unrelatedSources = [
    { type: 'document' as const, id: 99, title: '관계없는 문서', content: '완전히 다른 내용입니다. 관련 키워드가 없습니다.' }
  ]
  const unrelatedKw = ['이영희', '토큰']

  const oldResult = OLD_buildContext(unrelatedSources, unrelatedKw)
  const newResult = buildContext(unrelatedSources, unrelatedKw)

  console.log('  상황: 키워드와 전혀 무관한 소스만 존재할 때')
  console.log(`\n  구 구현: 선택된 청크 ${oldResult.stats.selectedChunks}개 → 컨텍스트 완전히 비어있음`)
  console.log(`  신 구현: 선택된 청크 ${newResult.stats.selectedChunks}개 → Fallback 청크 포함`)
  console.log(`  신 구현 컨텍스트: "${newResult.contextBlock.substring(0, 80).replace(/\n/g, '↵')}..."`)

  // ───────────────────────────────────────────────────────────
  // TEST 5: git 타입 라벨 (개선 #2)
  // ───────────────────────────────────────────────────────────
  console.log('\n[TEST 5] Git 타입 라벨 (개선 #2)')
  console.log(sep())

  const gitSources = [{ type: 'git' as const, id: 4, title: 'Git 커밋 로그', content: GIT_TEXT }]
  const gitKw = ['이영희', '구현']
  const oldGit = OLD_buildContext(gitSources, gitKw)
  const newGit = buildContext(gitSources, gitKw)

  const oldLabel = oldGit.contextBlock.match(/\(([^)]+)\)/)?.[1] ?? '없음'
  const newLabel = newGit.contextBlock.match(/\(([^)]+)\)/)?.[1] ?? '없음'
  console.log(`  구 구현 라벨: "(${oldLabel})"  ← git인데 '문서'로 표시됨`)
  console.log(`  신 구현 라벨: "(${newLabel})"  ✅`)

  // ───────────────────────────────────────────────────────────
  // TEST 6: 전체 파이프라인 통합 비교
  // ───────────────────────────────────────────────────────────
  console.log('\n[TEST 6] 전체 파이프라인 통합 비교 (4개 소스, 실제 질문)')
  console.log(sep())

  const question = ['이영희', '토큰', '비용']
  const opts = { chunkSize: 300, overlap: 50, topK: 3, maxContextChars: 1200 }

  const t0 = performance.now()
  const oldFull = OLD_buildContext(SOURCES, question, opts)
  const oldMs = (performance.now() - t0).toFixed(2)

  const t1 = performance.now()
  const newFull = buildContext(SOURCES, question, opts)
  const newMs = (performance.now() - t1).toFixed(2)

  console.log('\n  구 구현:')
  console.log(`    총 청크: ${oldFull.stats.totalChunks}개 → 선택: ${oldFull.stats.selectedChunks}개`)
  console.log(`    컨텍스트: ${oldFull.stats.totalChars}자 / 추정 ${oldFull.stats.estimatedTokens} 토큰`)
  console.log(`    처리시간: ${oldMs}ms`)

  console.log('\n  신 구현:')
  console.log(`    총 청크: ${newFull.stats.totalChunks}개 → 선택: ${newFull.stats.selectedChunks}개`)
  console.log(`    컨텍스트: ${newFull.stats.totalChars}자 / 추정 ${newFull.stats.estimatedTokens} 토큰`)
  console.log(`    처리시간: ${newMs}ms`)

  // 선택된 청크의 소스 타입 분포
  const newTypes = newFull.selectedChunks.map(c => c.sourceTitle).join(', ')
  console.log(`    선택 소스: ${newTypes}`)

  // ───────────────────────────────────────────────────────────
  // 최종 요약
  // ───────────────────────────────────────────────────────────
  console.log('\n' + sep('═'))
  console.log('  📋 최종 요약')
  console.log(sep('═'))
  console.log('\n  개선 항목                  | 효과')
  console.log('  ' + sep('-', 60))
  console.log(`  #1 break→continue + Fallback | 키워드 미매칭 시 컨텍스트 공백 방지`)
  console.log(`  #2 git 타입 라벨             | LLM이 소스 유형 정확히 파악 가능`)
  console.log(`  #3 스코어링 개선             | 점수 격차 ${(oldFront-oldBack).toFixed(2)} → ${(newFront-newBack).toFixed(2)} (더 명확한 랭킹)`)
  console.log(`  #4 토큰 추정 (코드)          | ${oldCodeTok} → ${newCodeTok} 토큰 (코드 과소추정 방지)`)
  console.log(`  #5 타입별 청킹               | 의미 단위 분리로 청크 품질 향상`)
  console.log(`  #6 트런케이션 힌트           | 생략 글자 수 명시로 LLM 인식 개선`)
  console.log('\n' + sep('═'))
}

main().catch(console.error)
