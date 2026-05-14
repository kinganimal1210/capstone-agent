import { useEffect, useState } from 'react'
import { DataSourceSelector } from '../components/DataSourceSelector'
import { ToolSelector } from '../components/ToolSelector'
import { PromptInput } from '../components/PromptInput'
import { ResultDisplay } from '../components/ResultDisplay'
import type { DataSource, QueryResponse, ToolType } from '../../../shared/types'

const DASHBOARD_STATE_KEY = 'capstone-agent:dashboard-state'

interface DashboardPersistedState {
  selectedSources: DataSource[]
  selectedTool: ToolType | null
  prompt: string
  result: QueryResponse | null
  error: string | null
}

function loadDashboardState(): DashboardPersistedState {
  if (typeof window === 'undefined') {
    return {
      selectedSources: ['git'],
      selectedTool: 'git-progress-analyzer',
      prompt: '',
      result: null,
      error: null
    }
  }

  try {
    const raw = window.sessionStorage.getItem(DASHBOARD_STATE_KEY)
    if (!raw) throw new Error('missing')
    return JSON.parse(raw) as DashboardPersistedState
  } catch {
    return {
      selectedSources: ['git'],
      selectedTool: 'git-progress-analyzer',
      prompt: '',
      result: null,
      error: null
    }
  }
}

export function Dashboard() {
  const [selectedSources, setSelectedSources] = useState<DataSource[]>(() => loadDashboardState().selectedSources)
  const [selectedTool, setSelectedTool] = useState<ToolType | null>(() => loadDashboardState().selectedTool)
  const [prompt, setPrompt] = useState(() => loadDashboardState().prompt)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<QueryResponse | null>(() => loadDashboardState().result)
  const [error, setError] = useState<string | null>(() => loadDashboardState().error)

  useEffect(() => {
    window.sessionStorage.setItem(
      DASHBOARD_STATE_KEY,
      JSON.stringify({
        selectedSources,
        selectedTool,
        prompt,
        result,
        error
      } satisfies DashboardPersistedState)
    )
  }, [selectedSources, selectedTool, prompt, result, error])

  const handlePromptSubmit = async (nextPrompt: string) => {
    if (!selectedTool || selectedSources.length === 0) return

    setIsLoading(true)
    setError(null)
    setPrompt(nextPrompt)

    try {
      const response = await window.api.query({
        projectId: 1,
        sources: selectedSources,
        tool: selectedTool,
        prompt: nextPrompt
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
          prompt={prompt}
          onPromptChange={setPrompt}
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
