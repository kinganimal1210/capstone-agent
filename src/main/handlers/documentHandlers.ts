/**
 * 문서 핸들러
 * 로컬 프로젝트 파일 스캔 및 document_sources 관리를 위한 IPC 핸들러
 */

import { IpcMain, dialog } from 'electron'
import { documentRepository } from '../database/repositories'
import { indexDocument } from '../services/documentIndexer'
import fs from 'fs'
import path from 'path'

// 지원하는 파일 확장자
const SUPPORTED_EXTENSIONS = new Set([
  // 문서
  '.txt', '.md', '.markdown', '.json', '.csv', '.xml', '.yaml', '.yml', '.toml',
  '.pdf',
  // 코드
  '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
  '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala',
  // 설정
  '.env', '.ini', '.cfg', '.conf',
  // 웹
  '.html', '.css', '.scss', '.less', '.svg',
])

// 무시할 디렉터리
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out',
  '__pycache__', '.next', '.nuxt', '.cache', 'coverage', '.idea', '.vscode',
  'vendor', 'target', 'bin', 'obj',
])

/**
 * 디렉터리를 재귀적으로 스캔하여 지원하는 파일 목록을 반환합니다.
 */
function scanDirectory(dirPath: string, maxDepth: number = 5, currentDepth: number = 0): {
  filePath: string
  fileName: string
  fileType: string
  fileSize: number
}[] {
  if (currentDepth > maxDepth) return []

  const results: {
    filePath: string
    fileName: string
    fileType: string
    fileSize: number
  }[] = []

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        // 무시할 디렉터리 스킵
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        results.push(...scanDirectory(fullPath, maxDepth, currentDepth + 1))
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue

        // 너무 큰 파일 스킵 (PDF는 10MB, 나머지는 1MB 초과)
        try {
          const stat = fs.statSync(fullPath)
          const maxSize = ext === '.pdf' ? 10 * 1024 * 1024 : 1024 * 1024
          if (stat.size > maxSize) continue

          results.push({
            filePath: fullPath,
            fileName: entry.name,
            fileType: ext.slice(1), // 점 제거
            fileSize: stat.size,
          })
        } catch {
          // stat 실패 시 스킵
        }
      }
    }
  } catch {
    // 읽기 권한 없는 디렉터리 등 스킵
  }

  return results
}

export function registerDocumentHandlers(ipcMain: IpcMain): void {
  // 폴더 선택 다이얼로그
  ipcMain.handle('documents:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '프로젝트 문서 폴더를 선택하세요',
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { path: null }
    }
    return { path: result.filePaths[0] }
  })

  // 여러 파일 선택 다이얼로그
  ipcMain.handle('documents:selectFiles', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      title: '추가할 문서/파일들을 선택하세요',
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { filePaths: [] }
    }
    return { filePaths: result.filePaths }
  })

  // 폴더 스캔 → DB 저장
  ipcMain.handle(
    'documents:scan',
    async (_event, data: { projectId: number; folderPath: string }) => {
      const { projectId, folderPath } = data

      if (!fs.existsSync(folderPath)) {
        return { error: '폴더가 존재하지 않습니다.', count: 0 }
      }

      const files = scanDirectory(folderPath)
      const addedDocs = documentRepository.createBatch(
        files.map((f) => ({
          projectId,
          filePath: f.filePath,
          fileName: f.fileName,
          fileType: f.fileType,
          fileSize: f.fileSize,
        }))
      )

      // 동기적 인덱싱 대기 (사용자 질의 전 청크 보장)
      await Promise.all(
        addedDocs.map(async (doc) => {
          try {
            await indexDocument(doc.id, doc.filePath)
          } catch (e) {
            console.error('인덱싱 실패:', e)
          }
        })
      )

      return { error: null, count: addedDocs.length, total: files.length }
    }
  )

  // 선택한 여러 파일 목록을 직접 DB에 저장
  ipcMain.handle(
    'documents:addFiles',
    async (_event, data: { projectId: number; filePaths: string[] }) => {
      const { projectId, filePaths } = data
      
      const filesToAdd = []
      for (const filePath of filePaths) {
        if (!fs.existsSync(filePath)) continue
        try {
          const stat = fs.statSync(filePath)
          const ext = path.extname(filePath).toLowerCase()
          filesToAdd.push({
            projectId,
            filePath,
            fileName: path.basename(filePath),
            fileType: ext ? ext.slice(1) : 'unknown',
            fileSize: stat.size,
          })
        } catch {
          // 권한 등의 문제로 실패한 파일은 스킵
        }
      }

      const addedDocs = documentRepository.createBatch(filesToAdd)
      
      // 동기적 인덱싱 대기 (사용자 질의 전 청크 보장)
      await Promise.all(
        addedDocs.map(async (doc) => {
          try {
            await indexDocument(doc.id, doc.filePath)
          } catch (e) {
            console.error('인덱싱 실패:', e)
          }
        })
      )

      return { error: null, count: addedDocs.length, total: filePaths.length }
    }
  )

  // 프로젝트별 문서 목록 조회
  ipcMain.handle('documents:getByProject', (_event, projectId: number) => {
    return documentRepository.getByProject(projectId)
  })

  // 문서 삭제
  ipcMain.handle('documents:delete', (_event, id: number) => {
    return documentRepository.delete(id)
  })

  // 프로젝트의 문서 전체 삭제
  ipcMain.handle('documents:deleteByProject', (_event, projectId: number) => {
    return documentRepository.deleteByProject(projectId)
  })

  // 파일 내용 읽기
  ipcMain.handle('documents:readContent', async (_event, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { error: '파일이 존재하지 않습니다.', content: null }
      }
      const stat = fs.statSync(filePath)
      const ext = path.extname(filePath).toLowerCase()

      // 바이너리 파일 (PDF 등)은 미리보기 불가
      const binaryExtensions = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.pptx', '.ppt', '.zip', '.rar', '.exe', '.dll'])
      if (binaryExtensions.has(ext)) {
        return { error: null, content: null, binary: true, info: `📄 ${path.basename(filePath)}\n\n파일 형식: ${ext.slice(1).toUpperCase()}\n파일 크기: ${(stat.size / 1024).toFixed(1)} KB\n경로: ${filePath}\n\n이 파일은 바이너리 형식이므로 텍스트 미리보기가 지원되지 않습니다.` }
      }

      // 일반 텍스트 파일 처리
      if (stat.size > 1024 * 1024) {
        return { error: '파일이 너무 큽니다 (1MB 초과).', content: null }
      }
      const content = fs.readFileSync(filePath, 'utf-8')
      return { error: null, content }
    } catch {
      return { error: '파일을 읽을 수 없습니다.', content: null }
    }
  })
}
