import { useState } from 'react'
import { DataSourceSelector } from '../components/DataSourceSelector'
import { ToolSelector } from '../components/ToolSelector'
import { PromptInput } from '../components/PromptInput'
import { ResultDisplay } from '../components/ResultDisplay'

const mockResults = {
  summary:
    '프로젝트는 전체 15주 계획 중 현재 3주차를 진행 중입니다. Git 저장소 분석 결과, 지난 2주간 총 47개의 커밋이 이루어졌으며, Electron 데스크톱 앱 기본 구조와 데이터 소스 연동 모듈이 구현되었습니다. 현재 진행률은 약 20%이며, 기본 기능 구현이 순조롭게 진행되고 있습니다.',
  evidence: [
    { source: 'Git', title: 'feat: Implement Electron main process', snippet: '커밋 #a3f2b1c - 2주 전 - Electron 메인 프로세스 구현 및 IPC 통신 설정 완료' },
    { source: 'Git', title: 'feat: Add Git data collector module', snippet: '커밋 #b7d4e2a - 1주 전 - Git 저장소 데이터 수집 모듈 구현, 커밋 히스토리 분석 기능 추가' },
    { source: 'Git', title: 'feat: Create meeting notes storage', snippet: '커밋 #c9e1f3b - 5일 전 - SQLite 기반 회의록 저장 구조 및 CRUD 기능 구현' },
  ],
  suggestedActions: [
    { title: 'Data Source 선택 UI 테스트 완료', description: '사용자가 Git, Meeting Notes, Tasks를 선택할 수 있는 인터페이스 검증 필요', priority: 'high' as const },
    { title: 'Tool/API 라우팅 로직 구현', description: '선택된 데이터 소스와 도구 조합에 따른 쿼리 라우팅 시스템 개발', priority: 'high' as const },
    { title: 'Retrieval 계층 설계 문서 작성', description: 'Keyword search, metadata filtering, recency scoring 등 검색 전략 문서화', priority: 'medium' as const },
  ],
}

export function Dashboard() {
  const [selectedSources, setSelectedSources] = useState<string[]>(['git'])
  const [selectedTool, setSelectedTool] = useState<string | null>('git-progress-analyzer')
  const [isLoading, setIsLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)

  const handlePromptSubmit = (_prompt: string) => {
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      setShowResults(true)
    }, 1500)
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-foreground mb-2">Project Analysis</h1>
        <p className="text-muted-foreground text-sm">데이터 소스와 분석 도구를 선택하여 프로젝트 상태를 확인하세요</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-card border border-border rounded-lg p-6">
          <DataSourceSelector selectedSources={selectedSources} onSourcesChange={setSelectedSources} />
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <ToolSelector selectedTool={selectedTool} onToolChange={setSelectedTool} availableSources={selectedSources} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 mb-8">
        <PromptInput
          onSubmit={handlePromptSubmit}
          disabled={!selectedTool || selectedSources.length === 0}
          isLoading={isLoading}
        />
      </div>

      {showResults && (
        <div className="animate-in fade-in duration-500">
          <div className="mb-4">
            <h2 className="text-foreground">Analysis Results</h2>
          </div>
          <ResultDisplay
            summary={mockResults.summary}
            evidence={mockResults.evidence}
            suggestedActions={mockResults.suggestedActions}
          />
        </div>
      )}
    </div>
  )
}
