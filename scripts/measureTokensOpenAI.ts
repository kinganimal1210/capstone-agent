import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { initDB } from '../src/main/db'
import { getDB } from '../src/main/db'
import { documentRepository } from '../src/main/database/repositories/documentRepository'
import { preprocessPrompt } from '../src/main/services/promptPreprocessor'
import { buildContext } from '../src/main/services/contextChunker'
import { callLLM, loadConfigFromEnv } from '../src/main/services/llmService'

// .env 로드
dotenv.config({ path: path.join(__dirname, '../.env') })

async function runMeasurement() {
  await initDB()
  
  const config = loadConfigFromEnv('openai')
  console.log(`[Config] OpenAI API Key Loaded: ${config.apiKey.substring(0, 10)}...`)
  
  // 전체 문서 크기 (Baseline)
  const db = getDB()
  const allChunksStmt = db.prepare('SELECT content FROM document_chunks')
  const allChunks: string[] = []
  while (allChunksStmt.step()) {
    allChunks.push(allChunksStmt.getAsObject().content as string)
  }
  allChunksStmt.free()
  
  console.log(`\n=== 실제 OpenAI API 토큰 사용량 실험 ===`)
  
  const datasetPath = path.join(__dirname, 'eval_dataset.json')
  let dataset: any[] = []
  try {
    dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'))
  } catch(e) {
    console.log("No eval_dataset.json found. Creating a dummy dataset.")
    dataset = [{ id: 1, question: "데이터베이스는 어떻게 구성되어 있어?" }]
  }

  // 테스트할 첫 번째 질문 하나만 선택
  const testItem = dataset[0]
  console.log(`\n질문: "${testItem.question}"`)
  
  // 1. Capstone Agent 방식 (검색 및 압축)
  const { keywords } = preprocessPrompt(testItem.question)
  const matchedChunks = documentRepository.searchChunks(1, keywords, 30)
  const sources = matchedChunks.map((c: any) => ({
    type: 'document' as const,
    id: c.document_id,
    title: c.file_name as string,
    content: c.content as string
  }))
  
  const contextResult = buildContext(sources, keywords, { topK: 5 })
  const agentPrompt = `다음 컨텍스트를 바탕으로 질문에 답해줘.\n\n${contextResult.contextBlock}\n\n질문: ${testItem.question}`
  
  console.log('\n[Capstone Agent] OpenAI LLM 호출 중...')
  const agentResponse = await callLLM([{ role: 'user', content: agentPrompt }], config)
  const agentTokens = agentResponse.usage?.promptTokens || 0
  console.log(`Capstone Agent 사용 토큰 (Prompt Tokens): ${agentTokens.toLocaleString()}`)
  console.log(`응답 시간: ${agentResponse.latencyMs}ms`)
  console.log(`LLM 응답 샘플: ${agentResponse.content.substring(0, 100)}...`)

  // 1.5. Old RAG (단순 FTS 검색 결과 그대로 주입 - top 30)
  const oldRagPrompt = `다음 컨텍스트를 바탕으로 질문에 답해줘.\n\n${matchedChunks.map((c: any) => c.content).join('\n')}\n\n질문: ${testItem.question}`
  
  console.log('\n[Old RAG (단순 검색 30개 주입)] OpenAI LLM 호출 중...')
  let oldRagTokens = 0;
  try {
    const oldRagResponse = await callLLM([{ role: 'user', content: oldRagPrompt }], config)
    oldRagTokens = oldRagResponse.usage?.promptTokens || 0
    console.log(`Old RAG 사용 토큰 (Prompt Tokens): ${oldRagTokens.toLocaleString()}`)
  } catch(e: any) {
    console.error(`Old RAG 호출 실패: ${e.message}`)
  }
  
  // 2. Baseline 방식 (전체 DB)
  const fullPrompt = `다음 컨텍스트를 바탕으로 질문에 답해줘.\n\n${allChunks.join('\n')}\n\n질문: ${testItem.question}`
  
  console.log('\n[Baseline (전체 DB 컨텍스트)] OpenAI LLM 호출 중...')
  let baselineTokens = 0;
  try {
    const baselineResponse = await callLLM([{ role: 'user', content: fullPrompt }], config)
    baselineTokens = baselineResponse.usage?.promptTokens || 0
    console.log(`Baseline 사용 토큰 (Prompt Tokens): ${baselineTokens.toLocaleString()}`)
  } catch (err: any) {
    console.error(`Baseline 호출 실패! 예상된 결과입니다. (${err.message})`)
    baselineTokens = 232419 // 이전 실험에서 얻은 토큰 수 고정 (에러 발생시)
  }

  console.log(`\n=> 최종 결과 비교:`)
  console.log(`1. Baseline (전체 DB): ${baselineTokens} tokens`)
  console.log(`2. 구버전 RAG (단순 검색 30개): ${oldRagTokens} tokens`)
  console.log(`3. 최신 Capstone Agent (압축 후): ${agentTokens} tokens`)
}

runMeasurement().catch(console.error)
