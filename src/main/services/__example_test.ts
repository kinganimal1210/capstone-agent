/**
 * 청킹 & 프롬프트 최적화 동작 예시 스크립트
 *
 * 실행 방법:
 *   npx esbuild src/main/services/__example_test.ts --bundle --platform=node --outfile=__example_test.cjs && node __example_test.cjs
 */

import { preprocessPrompt, extractKeywords } from './promptPreprocessor'
import { chunkText, buildContext, truncate } from './contextChunker'
import { buildPrompt } from './promptBuilder'

// ═══════════════════════════════════════════════════════════
// 예시 1: 키워드 추출 (전처리)
// ═══════════════════════════════════════════════════════════

console.log('═'.repeat(60))
console.log('예시 1: 키워드 추출')
console.log('═'.repeat(60))

const questions = [
  '현재 프로젝트에서 진행 중인 태스크는 어떤 것들이 있나요?',
  '지난 회의록의 주요 결정사항을 요약해줘',
  '로그인 기능 구현 마감일이 언제야?',
  'UI 디자인 관련 문서 찾아주세요',
]

for (const q of questions) {
  const result = preprocessPrompt(q)
  console.log(`\n입력: "${q}"`)
  console.log(`키워드: [${result.keywords.join(', ')}]`)
  console.log(`정제된 질문: "${result.cleanedQuery}"`)
}

// ═══════════════════════════════════════════════════════════
// 예시 2: 텍스트 청킹
// ═══════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60))
console.log('예시 2: 긴 회의록 텍스트 청킹')
console.log('═'.repeat(60))

const meetingContent = `프로젝트 킥오프 회의가 진행되었다. 참석자는 김철수, 이영희, 박민수이다.

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

const chunks = chunkText(meetingContent, 300, 50)
console.log(`\n원본 길이: ${meetingContent.length}자`)
console.log(`청크 수: ${chunks.length}개 (300자 단위, 50자 겹침)\n`)

chunks.forEach((chunk, i) => {
  console.log(`--- 청크 ${i + 1} (${chunk.length}자) ---`)
  console.log(chunk.substring(0, 80) + (chunk.length > 80 ? '...' : ''))
  console.log()
})

// ═══════════════════════════════════════════════════════════
// 예시 3: 트런케이션
// ═══════════════════════════════════════════════════════════

console.log('═'.repeat(60))
console.log('예시 3: 트런케이션')
console.log('═'.repeat(60))

const longText = '김철수가 프론트엔드 UI 개발을 담당한다. React와 TailwindCSS를 활용하여 사용자 인터페이스를 구현한다. 이영희는 백엔드 로직 및 LLM 연동을 담당한다. OpenAI API를 활용하여 RAG 파이프라인을 구축한다.'
console.log(`\n원본 (${longText.length}자):\n${longText}`)
console.log(`\n100자 트런케이션:\n${truncate(longText, 100)}`)

// ═══════════════════════════════════════════════════════════
// 예시 4: 전체 파이프라인 (buildPrompt)
// ═══════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60))
console.log('예시 4: 전체 파이프라인 — buildPrompt()')
console.log('═'.repeat(60))

const result = buildPrompt({
  userQuestion: 'LLM 연동 담당자가 누구야? 일정도 알려줘',
  sources: [
    {
      type: 'meeting',
      id: 1,
      title: '프로젝트 킥오프 회의',
      content: meetingContent,
    },
    {
      type: 'task',
      id: 10,
      title: 'LLM 연동 구현',
      content: 'OpenAI API를 연동하여 RAG 파이프라인을 구축한다. 담당자: 이영희. 마감일: 9주차. 상태: 진행중. 우선순위: high.',
    },
    {
      type: 'task',
      id: 11,
      title: 'UI 디자인 완성',
      content: '로그인 화면과 대시보드 UI를 완성한다. 담당자: 김철수. 마감일: 6주차. 상태: done.',
    },
    {
      type: 'document',
      id: 20,
      title: 'README.md',
      content: '# Capstone Agent\n데스크톱 AI 에이전트 시스템입니다. Node.js, Electron, React를 사용합니다.',
    },
  ],
  contextOptions: { topK: 3, maxContextChars: 1500 },
})

console.log('\n추출된 키워드:', result.keywords)
console.log('\n--- 최종 프롬프트 ---')
console.log(result.finalPrompt)
console.log('\n--- 통계 ---')
console.log(`시스템 프롬프트: ${result.stats.systemPromptChars}자`)
console.log(`컨텍스트: ${result.stats.contextChars}자`)
console.log(`질문: ${result.stats.questionChars}자`)
console.log(`총: ${result.stats.totalChars}자`)
console.log(`예상 토큰: ~${result.stats.estimatedTokens}`)
console.log(`선택된 청크: ${result.contextResult.stats.selectedChunks}/${result.contextResult.stats.totalChunks}개`)

console.log('\n--- 선택된 청크 상세 ---')
result.contextResult.selectedChunks.forEach((c, i) => {
  console.log(`[${i + 1}] (${c.sourceType}) ${c.sourceTitle} | 점수: ${c.score} | ${c.text.length}자`)
})
