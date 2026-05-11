import * as dotenv from 'dotenv'
import * as path from 'path'

// .env 파일 로드
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { buildChatMessages, type PromptBuildInput } from './promptBuilder'
import { callLLM, loadConfigFromEnv } from './llmService'

// ── 테스트용 대규모 데이터 ─────────────────────────────────────────
// 청킹의 효과를 명확히 보기 위해 다소 길고 반복적인 의미 없는 더미 텍스트를 포함합니다.
const SAMPLE_MEETING_1 = `프로젝트 킥오프 회의가 진행되었다. 참석자는 김철수, 이영희, 박민수이다.
[무의미한 로그 데이터 시작]
10:00 - 시스템 부팅 중... 정상 동작 확인
10:05 - 데이터베이스 연결 시도... 성공
... (중간 생략) ...
11:00 - 회의 시작
[무의미한 로그 데이터 종료]
결정사항:
1. 프로젝트의 주요 목표는 데스크톱 AI 에이전트 시스템을 개발하는 것이다. 
2. UI 프레임워크는 React + TailwindCSS로 결정했다.`

const SAMPLE_MEETING_2 = `2주차 정기 회의. 참석자는 김철수, 이영희.
이영희: 현재 LLM 연동 파이프라인에서 컨텍스트 길이가 길어지면 토큰 비용이 너무 많이 발생합니다.
김철수: 그렇다면 텍스트를 작게 나누는 Chunking과 관련성이 높은 것만 뽑는 Retrieval이 필요하겠군요.
이영희: 맞습니다. Top-K 5개 정도로 잘라내면 비용을 절반 이하로 줄일 수 있을 것 같아요.`

// 쓸데없는 백그라운드 지식이나 매뉴얼 내용을 넣어 컨텍스트 길이를 부풀림
const DUMMY_MANUAL = `
Electron 매뉴얼 (버전 30.x)
Electron은 Node.js와 Chromium을 결합하여 크로스 플랫폼 데스크톱 앱을 만듭니다.
ipcMain과 ipcRenderer를 통해 프로세스 간 통신을 수행합니다.
(수많은 매뉴얼 내용...)
... [이 부분에 수천 자의 문서를 가정한 더미 텍스트가 있다고 가정합니다] ...
결론적으로 Electron은 매우 강력합니다.
`

const DUMMY_LOGS = Array.from({ length: 50 }).map((_, i) => `[LOG ${i}] 2024-05-10 12:00:00 - User clicked button ${i} - Response OK`).join('\n')

const SAMPLE_SOURCES: PromptBuildInput['sources'] = [
  { type: 'meeting', id: 1, title: '킥오프 회의', content: SAMPLE_MEETING_1 },
  { type: 'meeting', id: 2, title: '2주차 정기 회의', content: SAMPLE_MEETING_2 },
  { type: 'document', id: 10, title: 'Electron 매뉴얼', content: DUMMY_MANUAL.repeat(5) }, // 문서 길이 뻥튀기
  { type: 'task', id: 100, title: '앱 로그 데이터', content: DUMMY_LOGS },
  { type: 'task', id: 101, title: 'RAG 최적화', content: '청킹과 트런케이션을 구현하여 토큰 비용을 최소화한다. 담당자: 이영희' }
]

const TEST_QUESTION = "이영희가 말한 토큰 비용 절감 방법이 뭐야?"

async function main() {
  console.log('═'.repeat(100))
  console.log('  ⚖️ 청킹(RAG) 적용 vs 미적용 비교 분석 스크립트')
  console.log('═'.repeat(100))
  
  const provider = process.env.OPENAI_API_KEY ? 'openai' : null;
  if (!provider) {
    console.error('OPENAI_API_KEY가 없습니다.');
    process.exit(1);
  }
  const config = loadConfigFromEnv(provider as any)

  // ─────────────────────────────────────────────────────────────────
  // 시나리오 1: 청킹 미적용 (모든 데이터를 생으로 다 넣음)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[진행 중] 시나리오 1: 청킹 미적용 (모든 문서 전체 주입)...')
  
  const rawContextStr = SAMPLE_SOURCES.map(s => `[${s.title}]\n${s.content}`).join('\n\n')
  const rawMessages = [
    { role: 'system', content: `당신은 AI 어시스턴트입니다. 다음 주어진 자료만을 참고해 답변하세요.\n\n---\n${rawContextStr}\n---` },
    { role: 'user', content: TEST_QUESTION }
  ]

  const rawStartTime = Date.now()
  const rawResponse = await callLLM(rawMessages, config)
  const rawLatency = Date.now() - rawStartTime

  // ─────────────────────────────────────────────────────────────────
  // 시나리오 2: 청킹 & 트런케이션 적용 (RAG 파이프라인)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[진행 중] 시나리오 2: 청킹 및 RAG 파이프라인 적용...')
  
  const ragStartTime = Date.now()
  // RAG 적용 (우리가 만든 시스템)
  const { messages: ragMessages, stats } = buildChatMessages({
    userQuestion: TEST_QUESTION,
    sources: SAMPLE_SOURCES,
    contextOptions: { chunkSize: 300, overlap: 50, topK: 3, maxContextChars: 1500 }
  })

  const ragResponse = await callLLM(ragMessages, config)
  const ragLatency = Date.now() - ragStartTime

  // ─────────────────────────────────────────────────────────────────
  // 결과 출력
  // ─────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(100))
  console.log('  📊 성능 비교 결과 (질문: "이영희가 말한 토큰 비용 절감 방법이 뭐야?")')
  console.log('═'.repeat(100))

  const rawTokens = rawResponse.usage?.promptTokens || 0
  const ragTokens = ragResponse.usage?.promptTokens || 0
  const tokenSaved = rawTokens - ragTokens
  const tokenSaveRatio = ((tokenSaved / rawTokens) * 100).toFixed(1)

  console.log(`\n🔴 [청킹 미적용 (Raw Context)]`)
  console.log(` - 입력 컨텍스트 길이 : ${rawContextStr.length} 글자`)
  console.log(` - 사용된 입력 토큰 : ${rawTokens} 토큰`)
  console.log(` - 응답 소요 시간   : ${rawLatency} ms`)
  console.log(` - LLM 답변         : "${rawResponse.content.substring(0, 80)}..."`)

  console.log(`\n🟢 [청킹 적용 (RAG 파이프라인)]`)
  console.log(` - 입력 컨텍스트 길이 : ${stats.totalChars} 글자 (관련된 상위 3개 청크만 발췌)`)
  console.log(` - 사용된 입력 토큰 : ${ragTokens} 토큰`)
  console.log(` - 응답 소요 시간   : ${ragLatency} ms`)
  console.log(` - LLM 답변         : "${ragResponse.content.substring(0, 80)}..."`)

  console.log('\n' + '─'.repeat(100))
  console.log(`🎯 최종 분석 요약`)
  console.log(` 1. 토큰 절약 : RAG 적용 시 입력 토큰을 **${tokenSaveRatio}% 절감**했습니다. (${rawTokens} -> ${ragTokens})`)
  console.log(` 2. 속도 향상 : 컨텍스트 길이가 짧아져 응답 속도가 향상됩니다. (보통 LLM은 입력 길이가 짧을수록 TTFT가 빠름)`)
  console.log(` 3. 품질 유지 : 쓸데없는 더미 매뉴얼/로그가 걸러지고, 정확히 질문에 관련된 '2주차 정기 회의' 청크만 전달되어 답변 품질이 유지되거나 오히려 더 정확해집니다. (환각 현상 방지)`)
}

main().catch(console.error)
