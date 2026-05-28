import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
const pdfParse = require('pdf-parse')
import mammoth from 'mammoth'
const WordExtractor = require('word-extractor')
import { chunkText } from './contextChunker'
import { documentRepository } from '../database/repositories/documentRepository'

/**
 * 로컬 파일을 읽어 텍스트를 추출하고 청킹한 뒤 DB에 저장합니다.
 * 
 * @param documentId document_sources 테이블의 id
 * @param filePath 로컬 파일의 절대 경로
 * @returns 생성된 청크 개수
 */
export async function indexDocument(documentId: number, filePath: string): Promise<number> {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`파일을 찾을 수 없습니다: ${filePath}`)
    }

    const ext = path.extname(filePath).toLowerCase()
    let extractedText = ''

    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath)
      const data = await pdfParse(dataBuffer)
      extractedText = data.text
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath })
      extractedText = result.value
    } else if (ext === '.doc') {
      const extractor = new WordExtractor()
      const extracted = await extractor.extract(filePath)
      extractedText = extracted.getBody()
    } else if (['.txt', '.md', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx', '.py', '.html', '.css'].includes(ext)) {
      extractedText = fs.readFileSync(filePath, 'utf-8')
    } else {
      throw new Error(`지원하지 않는 파일 형식입니다: ${ext}`)
    }

    if (!extractedText || !extractedText.trim()) {
      return 0
    }

    // 해시 계산 및 변경 여부 확인
    const contentHash = crypto.createHash('md5').update(extractedText).digest('hex')
    const existingDoc = documentRepository.getById(documentId)
    
    if (existingDoc && existingDoc.content_hash === contentHash) {
      // 해시가 동일하면 기존 청크 유지 및 인덱싱 건너뛰기
      return 0
    }

    // 기존 청크 삭제 (재색인인 경우)
    if (existingDoc && existingDoc.content_hash) {
      documentRepository.deleteChunks(documentId)
    }

    // 컨텍스트 청커를 사용하여 텍스트 분할
    const chunks = chunkText(extractedText, 500, 80, 'document')

    if (chunks.length > 0) {
      documentRepository.createChunksBatch(documentId, chunks)
    }

    // 해시 및 인덱싱 시간 갱신
    documentRepository.updateContentHash(documentId, contentHash)

    return chunks.length
  } catch (error) {
    console.error(`문서 인덱싱 실패 (${filePath}):`, error)
    throw error
  }
}
