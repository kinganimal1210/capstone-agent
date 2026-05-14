import { FileText, Folder, Search, FolderOpen, Trash2, RefreshCw, Loader2, AlertCircle, CheckCircle2, X, Code2, Plus } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

interface DocumentItem {
  id: number
  filePath: string
  fileName: string
  fileType: string
  fileSize: number | null
  lastIndexedAt: string | null
}

function toDocument(row: Record<string, unknown>): DocumentItem {
  return {
    id: row.id as number,
    filePath: (row.file_path as string) || '',
    fileName: (row.file_name as string) || '',
    fileType: (row.file_type as string) || '',
    fileSize: (row.file_size as number) || null,
    lastIndexedAt: (row.last_indexed_at as string) || null,
  }
}

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// 파일 타입에 따른 아이콘 색상
function getTypeColor(fileType: string): string {
  const colors: Record<string, string> = {
    ts: 'text-blue-400', tsx: 'text-blue-400', js: 'text-yellow-400', jsx: 'text-yellow-400',
    py: 'text-green-400', java: 'text-orange-400', go: 'text-cyan-400', rs: 'text-orange-500',
    html: 'text-red-400', css: 'text-purple-400', scss: 'text-pink-400',
    json: 'text-yellow-300', yaml: 'text-red-300', yml: 'text-red-300', toml: 'text-orange-300',
    md: 'text-gray-300', txt: 'text-gray-300', csv: 'text-green-300',
    pdf: 'text-red-500',
  }
  return colors[fileType] || 'text-primary'
}

const DEFAULT_PROJECT_ID = 1

export function Documents() {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [selected, setSelected] = useState<DocumentItem | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [contentError, setContentError] = useState<string | null>(null)
  const [isLoadingContent, setIsLoadingContent] = useState(false)

  // DB에서 문서 목록 로드
  const loadDocuments = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.api.getDocuments(DEFAULT_PROJECT_ID)
      setDocuments(rows.map(toDocument))
    } catch (err) {
      console.error('문서 로드 실패:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  // 문서 선택 시 파일 내용 로드
  const handleSelect = async (doc: DocumentItem) => {
    setSelected(doc)
    setFileContent(null)
    setContentError(null)
    setIsLoadingContent(true)
    try {
      const result = await window.api.readDocumentContent(doc.filePath)
      if (result.error) {
        setContentError(result.error)
      } else if (result.binary) {
        setFileContent(result.info || '바이너리 파일입니다.')
      } else {
        setFileContent(result.content)
      }
    } catch (err) {
      setContentError((err as Error).message)
    } finally {
      setIsLoadingContent(false)
    }
  }

  // 폴더 선택 & 스캔
  const handleSelectAndScan = async () => {
    try {
      const result = await window.api.selectDocumentFolder()
      if (!result.path) return

      setFolderPath(result.path)
      setIsScanning(true)
      setScanResult(null)

      const scanRes = await window.api.scanDocuments({
        projectId: DEFAULT_PROJECT_ID,
        folderPath: result.path,
      })

      if (scanRes.error) {
        setScanResult({ message: scanRes.error, type: 'error' })
      } else {
        setScanResult({
          message: `${scanRes.count}개의 새 파일을 등록했습니다 (총 ${scanRes.total}개 파일 발견)`,
          type: 'success',
        })
      }

      await loadDocuments()
    } catch (err) {
      setScanResult({ message: (err as Error).message, type: 'error' })
    } finally {
      setIsScanning(false)
    }
  }

  // 여러 파일 직접 선택 추가
  const handleSelectFiles = async () => {
    try {
      const result = await window.api.selectDocumentFiles()
      if (!result.filePaths || result.filePaths.length === 0) return

      setIsScanning(true)
      setScanResult(null)

      const res = await window.api.addDocumentFiles({
        projectId: DEFAULT_PROJECT_ID,
        filePaths: result.filePaths,
      })

      if (res.error) {
        setScanResult({ message: res.error, type: 'error' })
      } else {
        setScanResult({
          message: `${res.count}개의 파일을 추가했습니다 (총 ${res.total}개 중)`,
          type: 'success',
        })
      }

      await loadDocuments()
    } catch (err) {
      setScanResult({ message: (err as Error).message, type: 'error' })
    } finally {
      setIsScanning(false)
    }
  }

  // 재스캔
  const handleRescan = async () => {
    if (!folderPath) return
    setIsScanning(true)
    setScanResult(null)

    try {
      const scanRes = await window.api.scanDocuments({
        projectId: DEFAULT_PROJECT_ID,
        folderPath,
      })

      if (scanRes.error) {
        setScanResult({ message: scanRes.error, type: 'error' })
      } else {
        setScanResult({
          message: `${scanRes.count}개의 새 파일을 등록했습니다`,
          type: 'success',
        })
      }

      await loadDocuments()
    } catch (err) {
      setScanResult({ message: (err as Error).message, type: 'error' })
    } finally {
      setIsScanning(false)
    }
  }

  // 문서 삭제
  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await window.api.deleteDocument(id)
      if (selected?.id === id) {
        setSelected(null)
        setFileContent(null)
      }
      await loadDocuments()
    } catch (err) {
      console.error('문서 삭제 실패:', err)
    }
  }

  // 전체 삭제
  const handleDeleteAll = async () => {
    try {
      await window.api.deleteAllDocuments(DEFAULT_PROJECT_ID)
      setDocuments([])
      setFolderPath(null)
      setScanResult(null)
      setSelected(null)
      setFileContent(null)
    } catch (err) {
      console.error('전체 삭제 실패:', err)
    }
  }

  const filtered = documents.filter((d) =>
    d.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.fileType.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex h-full">
      {/* 좌측 패널: 폴더 스캔 + 파일 목록 */}
      <div className="w-80 border-r border-border bg-muted/30 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-foreground text-base">Documents</h2>
            <div className="flex items-center gap-1">
              {folderPath && (
                <button
                  onClick={handleRescan}
                  disabled={isScanning}
                  className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors disabled:opacity-50"
                  title="재스캔"
                >
                  <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                </button>
              )}
              {documents.length > 0 && (
                <button
                  onClick={handleDeleteAll}
                  className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                  title="전체 삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            <button
              onClick={handleSelectAndScan}
              disabled={isScanning}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isScanning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FolderOpen className="w-4 h-4" />
              )}
              {isScanning ? '스캔 중...' : '폴더 스캔'}
            </button>
            <button
              onClick={handleSelectFiles}
              disabled={isScanning}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-primary text-primary bg-transparent rounded-md text-sm hover:bg-primary/10 transition-colors disabled:opacity-50"
              title="원하는 파일만 개별 추가"
            >
              <Plus className="w-4 h-4" />
              파일 선택
            </button>
          </div>

          {folderPath && (
            <p className="text-[10px] text-muted-foreground truncate mb-2 font-mono" title={folderPath}>
              📁 {folderPath}
            </p>
          )}

          {scanResult && (
            <div className={`flex items-start gap-2 text-xs rounded-md px-2.5 py-2 mb-2 ${
              scanResult.type === 'success'
                ? 'text-emerald-600 bg-emerald-500/10'
                : 'text-destructive bg-destructive/10'
            }`}>
              {scanResult.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              )}
              <span>{scanResult.message}</span>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* 파일 목록 */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">로딩 중...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Folder className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">등록된 문서가 없습니다</p>
              <p className="text-xs mt-1">폴더를 선택하여 스캔하세요</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border">
                {filtered.length}개 파일
              </div>
              {filtered.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => handleSelect(doc)}
                  className={`w-full p-3 text-left border-b border-border hover:bg-accent/50 transition-colors group ${selected?.id === doc.id ? 'bg-accent' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 bg-primary/10 rounded-md ${getTypeColor(doc.fileType)}`}>
                      {['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'cpp', 'c', 'h', 'cs', 'rb', 'php', 'swift', 'kt', 'scala'].includes(doc.fileType) ? (
                        <Code2 className="w-3.5 h-3.5" />
                      ) : (
                        <FileText className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{doc.fileName}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span className="px-1.5 py-0.5 bg-muted rounded">{doc.fileType}</span>
                        <span>{formatSize(doc.fileSize)}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(doc.id, e)}
                      className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* 우측 패널: 파일 내용 뷰어 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            {/* 상단 헤더 */}
            <div className="p-4 border-b border-border bg-card flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 bg-primary/10 rounded-md ${getTypeColor(selected.fileType)}`}>
                  {['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'cpp', 'c', 'h', 'cs', 'rb', 'php', 'swift', 'kt', 'scala'].includes(selected.fileType) ? (
                    <Code2 className="w-4 h-4" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm text-foreground truncate">{selected.fileName}</h2>
                  <p className="text-[11px] text-muted-foreground truncate font-mono">{selected.filePath}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs px-2 py-1 bg-muted rounded text-muted-foreground">{selected.fileType.toUpperCase()}</span>
                <span className="text-xs text-muted-foreground">{formatSize(selected.fileSize)}</span>
                <button
                  onClick={() => { setSelected(null); setFileContent(null); setContentError(null) }}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 파일 내용 */}
            <div className="flex-1 overflow-auto">
              {isLoadingContent ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-sm">파일 읽는 중...</span>
                </div>
              ) : contentError ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mb-3 text-destructive/50" />
                  <p className="text-sm text-destructive">{contentError}</p>
                </div>
              ) : fileContent !== null ? (
                <div className="relative">
                  <pre className="p-6 text-sm font-mono leading-relaxed text-foreground whitespace-pre overflow-x-auto">
                    <code>{fileContent}</code>
                  </pre>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">파일을 선택하세요</p>
            <p className="text-xs mt-1 text-muted-foreground/60">좌측 목록에서 파일을 클릭하면 내용을 미리볼 수 있습니다</p>
          </div>
        )}
      </div>
    </div>
  )
}
