import { useState, useEffect, useCallback } from 'react'
import {
  GitBranch,
  GitCommitHorizontal,
  FolderOpen,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  FilePlus,
  FileX,
  FileEdit,
  Clock,
  User,
  Hash,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react'

interface GitChangedFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
}

interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
  changedFiles?: GitChangedFile[]
}

interface GitRepoInfo {
  path: string
  currentBranch: string
  totalCommits: number
  lastCommitDate: string
  remoteUrl?: string
}

export function GitActivity() {
  const [repoPath, setRepoPath] = useState('')
  const [repoInfo, setRepoInfo] = useState<GitRepoInfo | null>(null)
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [expandedCommits, setExpandedCommits] = useState<Set<string>>(new Set())
  const [commitDetails, setCommitDetails] = useState<Map<string, GitCommit>>(new Map())
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [commitCount, setCommitCount] = useState(30)

  // 저장소 연결
  const connectRepo = useCallback(async (path: string) => {
    if (!path.trim()) return
    setIsLoading(true)
    setError(null)

    try {
      const validation = await window.api.validateGitRepo(path)
      if (!validation.valid) {
        setError('유효한 Git 저장소가 아닙니다. .git 폴더가 있는지 확인해주세요.')
        setIsConnected(false)
        setIsLoading(false)
        return
      }

      const infoResult = await window.api.getGitRepoInfo(path)
      if (infoResult.error || !infoResult.data) {
        setError(infoResult.error || '저장소 정보를 가져올 수 없습니다.')
        setIsConnected(false)
        setIsLoading(false)
        return
      }

      const commitsResult = await window.api.getGitCommits(path, commitCount)
      if (commitsResult.error) {
        setError(commitsResult.error)
      }

      setRepoInfo(infoResult.data as GitRepoInfo)
      setCommits((commitsResult.data as GitCommit[]) || [])
      setIsConnected(true)
      setExpandedCommits(new Set())
      setCommitDetails(new Map())
    } catch (err) {
      setError((err as Error).message)
      setIsConnected(false)
    } finally {
      setIsLoading(false)
    }
  }, [commitCount])

  // 폴더 선택 다이얼로그
  const handleSelectFolder = async () => {
    try {
      const result = await window.api.selectGitFolder()
      if (result.path) {
        setRepoPath(result.path)
        await connectRepo(result.path)
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // 수동 경로 입력 후 연결
  const handleManualConnect = () => {
    connectRepo(repoPath)
  }

  // 새로고침
  const handleRefresh = () => {
    if (repoPath) connectRepo(repoPath)
  }

  // 커밋 확장/축소
  const toggleCommit = async (commit: GitCommit) => {
    const newExpanded = new Set(expandedCommits)

    if (newExpanded.has(commit.hash)) {
      newExpanded.delete(commit.hash)
      setExpandedCommits(newExpanded)
      return
    }

    newExpanded.add(commit.hash)
    setExpandedCommits(newExpanded)

    // 변경 파일이 아직 로드되지 않은 경우에만 조회
    if (!commitDetails.has(commit.hash)) {
      setIsLoadingDetail(commit.hash)
      try {
        const result = await window.api.getGitCommitDetail(repoPath, commit.hash)
        if (result.data) {
          setCommitDetails(prev => new Map(prev).set(commit.hash, result.data as GitCommit))
        }
      } catch (err) {
        console.error('커밋 상세 조회 실패:', err)
      } finally {
        setIsLoadingDetail(null)
      }
    }
  }

  // 날짜 포맷
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '방금 전'
    if (minutes < 60) return `${minutes}분 전`
    if (hours < 24) return `${hours}시간 전`
    if (days < 7) return `${days}일 전`

    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // 변경 파일 상태 아이콘
  const FileStatusIcon = ({ status }: { status: GitChangedFile['status'] }) => {
    switch (status) {
      case 'added':
        return <FilePlus className="w-4 h-4 text-emerald-500" />
      case 'deleted':
        return <FileX className="w-4 h-4 text-red-500" />
      case 'modified':
        return <FileEdit className="w-4 h-4 text-amber-500" />
      case 'renamed':
        return <FileText className="w-4 h-4 text-blue-500" />
      default:
        return <FileText className="w-4 h-4 text-muted-foreground" />
    }
  }

  // 변경 파일 상태 라벨
  const statusLabel = (status: GitChangedFile['status']) => {
    switch (status) {
      case 'added': return 'Added'
      case 'deleted': return 'Deleted'
      case 'modified': return 'Modified'
      case 'renamed': return 'Renamed'
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      {/* 헤더 */}
      <div className="mb-8 flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-md">
          <GitBranch className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-foreground mb-1">Git Activity</h1>
          <p className="text-muted-foreground text-sm">Git 저장소를 연결하고 커밋 히스토리를 분석하세요</p>
        </div>
      </div>

      {/* 저장소 연결 */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h3 className="text-foreground mb-4 flex items-center gap-2">
          <FolderOpen className="w-5 h-5" />
          저장소 연결
        </h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualConnect()}
            placeholder="Git 저장소 경로를 입력하세요 (예: C:\Users\...\my-project)"
            className="flex-1 px-3 py-2 bg-input-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleSelectFolder}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            <FolderOpen className="w-4 h-4" />
            찾아보기
          </button>
          <button
            onClick={handleManualConnect}
            disabled={!repoPath.trim() || isLoading}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GitBranch className="w-4 h-4" />
            )}
            연결
          </button>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mt-4 flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-md px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* 연결 상태 */}
        {isConnected && repoInfo && (
          <div className="mt-4 flex items-center gap-2 text-emerald-600 text-sm bg-emerald-50 rounded-md px-3 py-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            저장소가 연결되었습니다
          </div>
        )}
      </div>

      {/* 저장소 정보 카드 */}
      {isConnected && repoInfo && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
              <GitBranch className="w-3.5 h-3.5" />
              현재 브랜치
            </div>
            <p className="text-foreground font-medium text-sm truncate">{repoInfo.currentBranch}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
              <GitCommitHorizontal className="w-3.5 h-3.5" />
              총 커밋 수
            </div>
            <p className="text-foreground font-medium text-sm">{repoInfo.totalCommits.toLocaleString()}개</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
              <Clock className="w-3.5 h-3.5" />
              마지막 커밋
            </div>
            <p className="text-foreground font-medium text-sm">{formatDate(repoInfo.lastCommitDate)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
              <FolderOpen className="w-3.5 h-3.5" />
              경로
            </div>
            <p className="text-foreground font-medium text-sm truncate" title={repoInfo.path}>
              {repoInfo.path.split(/[/\\]/).slice(-2).join('/')}
            </p>
          </div>
        </div>
      )}

      {/* 커밋 목록 */}
      {isConnected && (
        <div className="bg-card border border-border rounded-lg">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="text-foreground flex items-center gap-2">
              <GitCommitHorizontal className="w-5 h-5" />
              최근 커밋
              <span className="text-xs text-muted-foreground font-normal ml-1">
                ({commits.length}개)
              </span>
            </h3>
            <div className="flex items-center gap-2">
              <select
                value={commitCount}
                onChange={(e) => {
                  setCommitCount(Number(e.target.value))
                }}
                className="px-2 py-1 bg-input-background border border-border rounded text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value={10}>10개</option>
                <option value={20}>20개</option>
                <option value={30}>30개</option>
                <option value={50}>50개</option>
              </select>
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                title="새로고침"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {commits.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              커밋이 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {commits.map((commit) => {
                const isExpanded = expandedCommits.has(commit.hash)
                const detail = commitDetails.get(commit.hash)
                const isDetailLoading = isLoadingDetail === commit.hash

                return (
                  <div key={commit.hash} className="group">
                    {/* 커밋 행 */}
                    <button
                      onClick={() => toggleCommit(commit)}
                      className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors flex items-start gap-3"
                    >
                      <div className="mt-0.5 text-muted-foreground">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm text-foreground font-medium truncate">
                            {commit.message}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            {commit.shortHash}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {commit.author}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(commit.date)}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* 변경 파일 목록 (확장 시) */}
                    {isExpanded && (
                      <div className="px-4 pb-3 pl-11">
                        {isDetailLoading ? (
                          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            변경 파일을 불러오는 중...
                          </div>
                        ) : detail?.changedFiles && detail.changedFiles.length > 0 ? (
                          <div className="bg-accent/30 rounded-lg border border-border/50 overflow-hidden">
                            <div className="px-3 py-2 border-b border-border/50 text-xs text-muted-foreground">
                              {detail.changedFiles.length}개 파일 변경
                            </div>
                            <div className="divide-y divide-border/30">
                              {detail.changedFiles.map((file, idx) => (
                                <div key={idx} className="px-3 py-2 flex items-center gap-3 text-sm hover:bg-accent/40 transition-colors">
                                  <FileStatusIcon status={file.status} />
                                  <span className="flex-1 font-mono text-xs truncate text-foreground">
                                    {file.path}
                                  </span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                    file.status === 'added' ? 'bg-emerald-100 text-emerald-700' :
                                    file.status === 'deleted' ? 'bg-red-100 text-red-700' :
                                    file.status === 'modified' ? 'bg-amber-100 text-amber-700' :
                                    'bg-blue-100 text-blue-700'
                                  }`}>
                                    {statusLabel(file.status)}
                                  </span>
                                  {(file.additions > 0 || file.deletions > 0) && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                                      {file.additions > 0 && (
                                        <span className="text-emerald-600">+{file.additions}</span>
                                      )}
                                      {file.deletions > 0 && (
                                        <span className="text-red-500">-{file.deletions}</span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-sm py-2">변경된 파일이 없습니다.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 초기 안내 */}
      {!isConnected && !isLoading && !error && (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/5 rounded-full mb-4">
            <GitBranch className="w-8 h-8 text-primary/40" />
          </div>
          <h3 className="text-foreground mb-2">Git 저장소를 연결해주세요</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            저장소를 연결하면 커밋 히스토리, 변경 파일 분석 등의 기능을 사용할 수 있습니다.
            위에서 경로를 입력하거나 찾아보기를 클릭하세요.
          </p>
        </div>
      )}
    </div>
  )
}
