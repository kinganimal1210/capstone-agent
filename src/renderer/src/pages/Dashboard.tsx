import { useState } from 'react'
import { DataSourceSelector } from '../components/DataSourceSelector'
import { ToolSelector } from '../components/ToolSelector'
import { PromptInput } from '../components/PromptInput'
import { ResultDisplay } from '../components/ResultDisplay'
import type { DataSource, QueryResponse, ToolType } from '../../../shared/types'

export function Dashboard() {
  const [selectedSources, setSelectedSources] = useState<DataSource[]>(['git'])
  const [selectedTool, setSelectedTool] = useState<ToolType | null>('git-progress-analyzer')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<QueryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePromptSubmit = async (prompt: string) => {
    if (!selectedTool || selectedSources.length === 0) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await window.api.query({
        projectId: 1,
        sources: selectedSources,
        tool: selectedTool,
        prompt
      })
      setResult(response)
    } catch (err) {
      setResult(null)
      setError((err as Error).message)
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

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="animate-in fade-in duration-500">
          <div className="mb-4">
            <h2 className="text-foreground">Analysis Results</h2>
          </div>
          <ResultDisplay
            summary={result.summary}
            evidence={result.evidence}
            suggestedActions={result.suggestedActions}
          />
        </div>
      )}
    </div>
  )
}
