import { useState, useEffect } from 'react'
import { DataSourceSelector } from '../components/DataSourceSelector'
import { ToolSelector } from '../components/ToolSelector'
import { PromptInput } from '../components/PromptInput'
import { ResultDisplay } from '../components/ResultDisplay'
import type { DataSource, QueryResponse, ToolType } from '../../../shared/types'

// 삭제 (mockResults)

const DEFAULT_PROJECT_ID = 1

const getInitialDashboardState = () => {
  const saved = localStorage.getItem('dashboardState')
  if (saved) {
    try { return JSON.parse(saved) } catch (e) { return null }
  }
  return null
}

export function Dashboard() {
  const [selectedSources, setSelectedSources] = useState<DataSource[]>(() => getInitialDashboardState()?.selectedSources || ['git'])
  const [selectedTool, setSelectedTool] = useState<ToolType | null>(() => getInitialDashboardState()?.selectedTool || 'git-progress-analyzer')
  const [isLoading, setIsLoading] = useState(false)
  const [showResults, setShowResults] = useState<boolean>(() => getInitialDashboardState()?.showResults || false)
  const [prompt, setPrompt] = useState(() => localStorage.getItem('dashboardPrompt') || '')
  const [error, setError] = useState<string | null>(null)

  const [results, setResults] = useState<{summary: string, evidence: any[], suggestedActions: any[], queryLogId?: number, rawResponse?: string, debugInfo?: any}>(() => 
    getInitialDashboardState()?.results || { summary: '', evidence: [], suggestedActions: [] }
  )

  const [feedbacks, setFeedbacks] = useState<Record<number, 'interested' | 'not_interested'>>({})
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)

  // 상태가 바뀔 때마다 로컬 스토리지에 자동 저장
  useEffect(() => {
    const stateToSave = {
      selectedSources,
      selectedTool,
      showResults,
      results
    }
    localStorage.setItem('dashboardState', JSON.stringify(stateToSave))
  }, [selectedSources, selectedTool, showResults, results])

  useEffect(() => {
    localStorage.setItem('dashboardPrompt', prompt)
  }, [prompt])

  const handlePromptSubmit = async (submittedPrompt: string) => {
    setIsLoading(true)
    setShowResults(false)
    setError(null)
    setFeedbacks({}) // 새로운 쿼리 시 피드백 초기화
    setFeedbackSubmitted(false)
    try {
      if (selectedSources.includes('git')) {
        const savedGitPath = localStorage.getItem('gitRepoPath')
        if (savedGitPath) {
          const validation = await window.api.validateGitRepo(savedGitPath)
          if (validation.valid) {
            await window.api.updateProject(DEFAULT_PROJECT_ID, { gitPath: savedGitPath })
          }
        }
      }

      // API 호출 (기본 프로젝트 ID 1 사용)
      const response = await window.api.query({
        projectId: DEFAULT_PROJECT_ID,
        sources: selectedSources,
        tool: selectedTool || 'report-generator',
        prompt: submittedPrompt
      })
      
      let debugInfo = undefined;
      try {
        if (response.rawResponse) {
          debugInfo = JSON.parse(response.rawResponse).debugInfo;
        }
      } catch (err) {}

      setResults({
        queryLogId: response.queryLogId,
        rawResponse: response.rawResponse,
        summary: response.summary,
        evidence: response.evidence.map(e => ({
          dbId: e.dbId,
          source: e.source,
          title: e.title,
          snippet: e.content,
          score: e.score,
          chunkFeatures: e.metadata?.features
        })),
        suggestedActions: response.suggestedActions || [],
        debugInfo
      })
      setShowResults(true)
      setShowResults(true)
    } catch (e: any) {
      console.error(e)
      setError(e.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFeedbackChange = (dbId: number, type: 'interested' | 'not_interested') => {
    if (feedbackSubmitted) return // 제출 후 변경 불가

    setFeedbacks(prev => {
      // 이미 같은 타입이 눌려있다면 취소
      if (prev[dbId] === type) {
        const next = { ...prev }
        delete next[dbId]
        return next
      }
      return { ...prev, [dbId]: type }
    })
  }

  const handleSubmitFeedback = async () => {
    if (!results.queryLogId || !results.rawResponse || Object.keys(feedbacks).length === 0) return

    setIsSubmittingFeedback(true)
    try {
      const parsed = JSON.parse(results.rawResponse)
      const questionType = parsed.questionType
      const userId = parsed.userId || 'default'

      const feedbackArray = Object.entries(feedbacks).map(([id, feedback]) => {
        const evidence = results.evidence.find((item) => item.dbId === parseInt(id))
        return {
          evidenceLogId: parseInt(id),
          feedback,
          chunkFeatures: evidence?.chunkFeatures
        }
      })

      const feedbackResult = await window.api.submitAllEvidenceFeedback({
        userId,
        queryLogId: results.queryLogId,
        questionType,
        feedbacks: feedbackArray,
        totalEvidenceCount: results.evidence.length
      })

      setResults((prev) => ({
        ...prev,
        debugInfo: {
          ...(prev.debugInfo || {}),
          scoringWeights: feedbackResult.updatedWeights || prev.debugInfo?.scoringWeights,
          updatedWeights: feedbackResult.updatedWeights
        }
      }))

      setFeedbackSubmitted(true)
    } catch (e: any) {
      console.error(e)
      setError('피드백 제출 실패: ' + e.message)
    } finally {
      setIsSubmittingFeedback(false)
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

      {showResults && (
        <div className="animate-in fade-in duration-500">
          <div className="mb-4">
            <h2 className="text-foreground">Analysis Results</h2>
          </div>
          <ResultDisplay
            summary={results.summary}
            evidence={results.evidence}
            suggestedActions={results.suggestedActions}
            feedbacks={feedbacks}
            onFeedbackChange={handleFeedbackChange}
            debugInfo={results.debugInfo}
          />

          {/* 피드백 제출 버튼 */}
          {results.evidence.length > 0 && !feedbackSubmitted && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSubmitFeedback}
                disabled={isSubmittingFeedback || Object.keys(feedbacks).length === 0}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isSubmittingFeedback ? '처리 중...' : '피드백 제출 및 학습'}
              </button>
            </div>
          )}
          {feedbackSubmitted && (
            <div className="mt-4 p-3 bg-primary/10 text-primary border border-primary/20 rounded text-center text-sm">
              ✓ 피드백이 학습에 반영되었습니다.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
