import * as fs from 'fs'
import * as path from 'path'
import { initDB } from '../src/main/db'
import { documentRepository } from '../src/main/database/repositories/documentRepository'
import { preprocessPrompt } from '../src/main/services/promptPreprocessor'
import { buildContext } from '../src/main/services/contextChunker'

// 간단한 토큰 수 추정 함수 (1토큰 = 약 4글자)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

async function runMeasurement() {
  await initDB()
  
  // 전체 문서 크기 (Baseline)
  const { getDB } = require('../src/main/db')
  const db = getDB()
  const allChunksStmt = db.prepare('SELECT content FROM document_chunks')
  const allChunks = []
  while (allChunksStmt.step()) {
    allChunks.push(allChunksStmt.getAsObject())
  }
  allChunksStmt.free()
  
  let totalDbTokens = 0
  allChunks.forEach((c: any) => {
    totalDbTokens += estimateTokens(c.content || '')
  })
  
  console.log(`\n=== 토큰 사용량 실험 (Token Usage Experiment) ===`)
  console.log(`[Baseline] 전체 프로젝트 문서 컨텍스트 (Total DB Size): ${totalDbTokens.toLocaleString()} tokens`)
  
  const datasetPath = path.join(__dirname, 'eval_dataset.json')
  let dataset: any[] = []
  try {
    dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'))
  } catch(e) {
    console.log("No eval_dataset.json found. Creating a dummy dataset.")
    dataset = [{ id: 1, question: "데이터베이스는 어떻게 구성되어 있어?" }]
  }

  let totalAgentTokens = 0

  for (const item of dataset) {
    const { keywords } = preprocessPrompt(item.question)
    const matchedChunks = documentRepository.searchChunks(1, keywords, 30)
    
    const sources = matchedChunks.map((c: any) => ({
      type: 'document' as const,
      id: c.document_id,
      title: c.file_name as string,
      content: c.content as string
    }))
    
    // 기본 topK 5로 세팅
    const contextResult = buildContext(sources, keywords, { topK: 5 })
    const agentTokens = estimateTokens(contextResult.contextBlock)
    
    totalAgentTokens += agentTokens
  }
  
  const avgAgentTokens = Math.ceil(totalAgentTokens / dataset.length)
  
  console.log(`[Capstone Agent] ${dataset.length}개 질문에 대한 평균 컨텍스트 크기: ${avgAgentTokens.toLocaleString()} tokens`)
  
  const ratio = ((avgAgentTokens / totalDbTokens) * 100).toFixed(2)
  console.log(`\n=> 결론: 기존 방식 대비 평균 토큰 사용량이 약 ${ratio}% 수준으로 감소했습니다.`)
}

runMeasurement().catch(console.error)
