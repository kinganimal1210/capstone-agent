/**
 * 커스텀 질문 LLM 테스트 스크립트
 * 
 * 실행 방법:
 *   npx tsx src/main/services/askLLM.ts "질문할 내용"
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// .env 파일 로드
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { buildChatMessages } from './promptBuilder'
import { callLLM, loadConfigFromEnv } from './llmService'

// 테스트용 샘플 소스 (llmTestRunner와 동일)
const SAMPLE_SOURCES: any[] = [
  {
    type: 'meeting',
    id: 1,
    title: '프로젝트 킥오프 회의',
    content: `프로젝트 킥오프 회의가 진행되었다. 참석자는 김철수, 이영희, 박민수이다.
1. 프로젝트 목표 설정: 데스크톱 AI 에이전트 시스템 개발.
2. 역할 분담:
김철수: 프론트엔드 UI 개발 및 Electron 앱 구조 설계 (React, TailwindCSS)
이영희: 백엔드 로직 및 LLM 연동 (OpenAI API, RAG 파이프라인)
박민수: 데이터베이스 설계 및 문서 처리 모듈 (SQLite, sql.js)
3. 일정 계획:
1~3주차: 기본 구조 및 DB
4~6주차: 핵심 기능 개발
7~9주차: LLM 연동 및 RAG
10~12주차: 테스트 및 최적화
4. 결정 사항: DB는 SQLite, UI는 React+TailwindCSS, LLM은 OpenAI.`
  },
  {
    type: 'task',
    id: 10,
    title: 'LLM 연동 구현',
    content: 'OpenAI API를 연동하여 RAG 파이프라인을 구축한다. 담당자: 이영희. 마감일: 9주차. 상태: 진행중. 우선순위: high.'
  },
  {
    type: 'task',
    id: 11,
    title: 'UI 디자인 완성',
    content: '로그인 화면과 대시보드 UI를 완성한다. 담당자: 김철수. 마감일: 6주차. 상태: done. 우선순위: medium.'
  },
  {
    type: 'document',
    id: 20,
    title: 'README.md',
    content: '# Capstone Agent\n데스크톱 AI 에이전트 시스템입니다. Node.js, Electron, React를 사용합니다.\n주요 기능: 회의록 관리, 태스크 추적, 문서 검색, Git 활동 분석, LLM 질의응답.'
  }
]

async function main() {
  const customQuestion = process.argv[2]

  if (!customQuestion) {
    console.log('❌ 질문을 입력해주세요.')
    console.log('사용법: npx tsx src/main/services/askLLM.ts "질문할 내용"')
    process.exit(1)
  }

  console.log('═'.repeat(80))
  console.log(` 💬 질문: "${customQuestion}"`)
  console.log('═'.repeat(80))

  // 1. 프롬프트 및 컨텍스트 빌드
  const { messages, contextResult, stats } = buildChatMessages({
    userQuestion: customQuestion,
    sources: SAMPLE_SOURCES,
    contextOptions: { chunkSize: 500, overlap: 80, topK: 5, maxContextChars: 3000 }
  })

  console.log('\n🔍 [검색된 컨텍스트]')
  if (contextResult.selectedChunks.length === 0) {
    console.log('  관련 문서가 없습니다.')
  } else {
    contextResult.selectedChunks.forEach((c, i) => {
      console.log(`  ${i + 1}. [${c.sourceType}] ${c.sourceTitle} (점수: ${c.score})`)
    })
  }

  // 2. LLM 호출
  console.log('\n🤖 LLM 응답을 기다리는 중...')
  try {
    // OpenAI를 기본으로 사용 (설정에 따라 변경 가능)
    const provider = process.env.OPENAI_API_KEY ? 'openai' : 
                    process.env.GEMINI_API_KEY ? 'gemini' : 
                    process.env.CLAUDE_API_KEY ? 'claude' : null;

    if (!provider) {
      throw new Error('사용 가능한 API 키가 .env 파일에 없습니다.')
    }

    const config = loadConfigFromEnv(provider as any)
    const response = await callLLM(messages, config)

    console.log('\n✅ [LLM 응답]')
    console.log('─'.repeat(80))
    console.log(response.content)
    console.log('─'.repeat(80))
    
    console.log(`\n📊 통계:`)
    console.log(`  - 모델: ${response.model} (${response.provider})`)
    console.log(`  - 예상 토큰: ${stats.estimatedTokens}`)
    console.log(`  - 실제 사용 토큰: 입력 ${response.usage?.promptTokens ?? '?'} + 출력 ${response.usage?.completionTokens ?? '?'} = 총 ${response.usage?.totalTokens ?? '?'}`)
    console.log(`  - 응답 시간: ${response.latencyMs}ms`)

  } catch (error: any) {
    console.error('\n❌ 오류 발생:', error.message)
  }
}

main()
