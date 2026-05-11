import { useState } from 'react'
import { DataSourceSelector } from '../components/DataSourceSelector'
import { ToolSelector } from '../components/ToolSelector'
import { PromptInput } from '../components/PromptInput'
import { ResultDisplay } from '../components/ResultDisplay'

// 삭제 (mockResults)

export function Dashboard() {
  const [selectedSources, setSelectedSources] = useState<string[]>(['git'])
  const [selectedTool, setSelectedTool] = useState<string | null>('git-progress-analyzer')
  const [isLoading, setIsLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)

  const [results, setResults] = useState<{summary: string, evidence: any[], suggestedActions: any[]}>({ summary: '', evidence: [], suggestedActions: [] })

  const handlePromptSubmit = async (prompt: string) => {
    setIsLoading(true)
    setShowResults(false)
    try {
      // API 호출 (기본 프로젝트 ID 1 사용)
      const response = await window.api.query({
        projectId: 1, 
        sources: selectedSources as any[],
        tool: selectedTool as any || 'report-generator',
        prompt: prompt
      })
      
      setResults({
        summary: response.summary,
        evidence: response.evidence.map(e => ({
          source: e.source,
          title: e.title,
          snippet: e.content
        })),
        suggestedActions: response.suggestedActions || []
      })
      setShowResults(true)
    } catch (e: any) {
      console.error(e)
      setResults({
        summary: '⚠️ 오류가 발생했습니다: ' + e.message,
        evidence: [],
        suggestedActions: []
      })
      setShowResults(true)
    } finally {
      setIsLoading(false)
    }
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
            summary={results.summary}
            evidence={results.evidence}
            suggestedActions={results.suggestedActions}
          />
        </div>
      )}
    </div>
  )
}
