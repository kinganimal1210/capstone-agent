import * as fs from 'fs'
import * as path from 'path'
import { initDB } from '../src/main/db'
import { documentRepository } from '../src/main/database/repositories/documentRepository'
import { preprocessPrompt } from '../src/main/services/promptPreprocessor'
import { classifyQuestion } from '../src/main/services/questionClassifier'
import { buildContext } from '../src/main/services/contextChunker'

// 데이터베이스 초기화 및 앱 컨텍스트 설정
async function setup() {
  await initDB()
}

interface EvalItem {
  id: number
  type: string
  question: string
  expected_keywords: string[]
  expected_answer_summary: string
  expected_file_name?: string
}

async function runEvaluation(projectId: number) {
  const datasetPath = path.join(__dirname, 'eval_dataset.json')
  const dataset: EvalItem[] = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'))

  console.log(`=== RAG 평가 시작 (프로젝트 ID: ${projectId}) ===`)
  let retrievalRecall30 = 0
  let retrievalRecall10 = 0
  let retrievalRecall5 = 0
  let selectedChunksRecallScore = 0
  
  const evalResults = []

  for (const item of dataset) {
    console.log(`\n[${item.id}] 질문: ${item.question}`)
    console.log(`유형: ${item.type}`)
    
    // 1. 키워드 추출 테스트
    const { keywords } = preprocessPrompt(item.question)
    console.log(`추출된 키워드: ${keywords.join(', ')}`)

    // 2. 검색(Retrieval) 테스트
    const matchedChunks = documentRepository.searchChunks(projectId, keywords, 30)
    console.log(`검색된 청크 수: ${matchedChunks.length}`)
    
    // 3. 기대 키워드 포함 여부 평가 헬퍼 함수
    const calculateRecall = (chunks: Record<string, unknown>[], expectedKeywords: string[]) => {
      const retrievedText = chunks.map(c => c.content as string).join('\n').toLowerCase()
      let matched = 0
      for (const expected of expectedKeywords) {
        if (retrievedText.includes(expected.toLowerCase())) matched++
      }
      return expectedKeywords.length > 0 ? matched / expectedKeywords.length : 1
    }

    const calculateRecallForString = (text: string, expectedKeywords: string[]) => {
      const lowerText = text.toLowerCase()
      let matched = 0
      for (const expected of expectedKeywords) {
        if (lowerText.includes(expected.toLowerCase())) matched++
      }
      return expectedKeywords.length > 0 ? matched / expectedKeywords.length : 1
    }

    const recall30 = calculateRecall(matchedChunks, item.expected_keywords)
    const recall10 = calculateRecall(matchedChunks.slice(0, 10), item.expected_keywords)
    const recall5 = calculateRecall(matchedChunks.slice(0, 5), item.expected_keywords)

    // 4. selectedChunks 테스트 (실제 LLM에 들어갈 텍스트)
    const sources = matchedChunks.map((c: any) => ({
      type: 'document' as const,
      id: c.document_id,
      title: c.file_name as string,
      content: c.content as string
    }))
    
    // 기본 topK 5 (또는 adaptive params 설정)
    const contextResult = buildContext(sources, keywords, { topK: 5 })
    const selectedChunksRecall = calculateRecallForString(contextResult.contextBlock, item.expected_keywords)

    console.log(`Recall@30: ${(recall30 * 100).toFixed(1)}%`)
    console.log(`Recall@10: ${(recall10 * 100).toFixed(1)}%`)
    console.log(`Recall@5:  ${(recall5 * 100).toFixed(1)}%`)
    console.log(`selectedChunks Recall: ${(selectedChunksRecall * 100).toFixed(1)}%`)

    if (item.expected_file_name) {
      const isFileRetrieved = matchedChunks.some(c => (c.file_name as string).includes(item.expected_file_name!))
      console.log(`목표 파일 검색 여부: ${isFileRetrieved ? '성공' : '실패'}`)
    }

    // 질문 복잡도 분류 테스트
    const classifiedType = classifyQuestion(item.question)
    if (classifiedType !== item.type) {
      console.warn(`[Warning] 기대한 분류는 ${item.type}이나, 실제 분류는 ${classifiedType}로 나타났습니다.`)
    }

    retrievalRecall30 += recall30
    retrievalRecall10 += recall10
    retrievalRecall5 += recall5
    selectedChunksRecallScore += selectedChunksRecall
    
    evalResults.push({
      id: item.id,
      question: item.question,
      expected_keywords: item.expected_keywords,
      extracted_keywords: keywords,
      recall_score_30: recall30 * 100,
      recall_score_10: recall10 * 100,
      recall_score_5: recall5 * 100,
      selected_chunks_recall: selectedChunksRecall * 100,
      retrieved_chunks_count: matchedChunks.length
    })
  }

  const avgRecall30 = (retrievalRecall30 / dataset.length) * 100
  const avgRecall10 = (retrievalRecall10 / dataset.length) * 100
  const avgRecall5 = (retrievalRecall5 / dataset.length) * 100
  const avgSelectedChunksRecall = (selectedChunksRecallScore / dataset.length) * 100

  console.log(`\n=== 평가 완료 ===`)
  console.log(`총 질문 수: ${dataset.length}`)
  console.log(`평균 Recall@30: ${avgRecall30.toFixed(2)}%`)
  console.log(`평균 Recall@10: ${avgRecall10.toFixed(2)}%`)
  console.log(`평균 Recall@5:  ${avgRecall5.toFixed(2)}%`)
  console.log(`평균 selectedChunks Recall: ${avgSelectedChunksRecall.toFixed(2)}%`)
  console.log(`\n참고: 이 평가는 LLM의 Generation(생성)을 제외한 Retrieval(검색) 단계의 품질을 측정합니다.`)
  
  const resultFilePath = path.join(__dirname, 'eval_results.json')
  fs.writeFileSync(resultFilePath, JSON.stringify({
    timestamp: new Date().toISOString(),
    total_questions: dataset.length,
    average_recall_30: avgRecall30,
    average_recall_10: avgRecall10,
    average_recall_5: avgRecall5,
    average_selected_chunks_recall: avgSelectedChunksRecall,
    results: evalResults
  }, null, 2))
  console.log(`\n[Saved] 평가 결과가 ${resultFilePath} 에 저장되었습니다.`)
}

async function main() {
  const args = process.argv.slice(2)
  const projectId = args.length > 0 ? parseInt(args[0], 10) : 1

  await setup()
  await runEvaluation(projectId)
}

main().catch(console.error)
