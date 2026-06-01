import { Settings as SettingsIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

const DEFAULT_PROJECT_ID = 1

interface LLMSettingsForm {
  provider: 'openai'
  model: string
  baseUrl: string
  apiKey: string
  hasApiKey: boolean
  gitPath: string
}

export function Settings() {
  const [isResetting, setIsResetting] = useState(false)
  const [resetMessage, setResetMessage] = useState('')

  const handleResetLearning = async () => {
    if (!confirm('학습된 가중치와 파라미터를 모두 초기화할까요? 이 작업은 되돌릴 수 없습니다.')) return
    setIsResetting(true)
    setResetMessage('')
    try {
      await window.api.resetAdaptiveLearning('default')
      setResetMessage('학습 데이터가 초기화되었습니다. 다음 질문부터 기본값으로 시작합니다.')
    } catch (e) {
      setResetMessage('초기화 중 오류가 발생했습니다.')
    } finally {
      setIsResetting(false)
    }
  }

  const [form, setForm] = useState<LLMSettingsForm>({
    provider: 'openai',
    model: 'gpt-4.1-mini',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    hasApiKey: false,
    gitPath: ''
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.api.getLLMSettings()
        const project = await window.api.getProjectById(DEFAULT_PROJECT_ID)
        setForm((prev) => ({
          ...prev,
          provider: settings.provider,
          model: settings.model,
          baseUrl: settings.baseUrl,
          hasApiKey: settings.hasApiKey,
          gitPath: typeof project?.git_path === 'string' ? project.git_path : ''
        }))
      } catch (error) {
        setMessage((error as Error).message)
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)

    try {
      if (form.gitPath.trim()) {
        const gitValidation = await window.api.validateGitRepo(form.gitPath.trim())
        if (!gitValidation.valid) {
          throw new Error(gitValidation.error || '유효한 Git 저장소 경로가 아닙니다.')
        }
      }

      const updated = await window.api.updateLLMSettings({
        provider: form.provider,
        model: form.model,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey.trim() ? form.apiKey : undefined
      })

      await window.api.updateProject(DEFAULT_PROJECT_ID, {
        gitPath: form.gitPath.trim()
      })

      setForm((prev) => ({
        ...prev,
        provider: updated.provider,
        model: updated.model,
        baseUrl: updated.baseUrl,
        apiKey: '',
        hasApiKey: updated.hasApiKey,
        gitPath: form.gitPath.trim()
      }))
      setMessage('LLM 설정과 Git 저장소 경로를 저장했습니다.')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSelectGitFolder = async () => {
    try {
      const result = await window.api.selectGitFolder()
      if (!result.path) return
      setForm((prev) => ({
        ...prev,
        gitPath: result.path ?? prev.gitPath
      }))
      setMessage(result.valid === false ? '선택한 폴더가 Git 저장소가 아닙니다.' : null)
    } catch (error) {
      setMessage((error as Error).message)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="mb-8 flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-md">
          <SettingsIcon className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-foreground mb-1">Settings</h1>
          <p className="text-muted-foreground text-sm">앱 설정을 관리하세요</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-foreground mb-4">LLM 설정</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm mb-2 block">Provider</label>
              <select
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value as 'openai' })}
                disabled={isLoading}
                className="w-full px-3 py-2 bg-input-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div>
              <label className="text-sm mb-2 block">API Key</label>
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder={form.hasApiKey ? '이미 저장된 키가 있습니다. 변경할 때만 입력하세요.' : 'sk-...'}
                disabled={isLoading}
                className="w-full px-3 py-2 bg-input-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1">
                LLM API 키를 입력하세요. 로컬에만 저장됩니다.
                {form.hasApiKey ? ' 현재 저장된 키가 있습니다.' : ''}
              </p>
            </div>
            <div>
              <label className="text-sm mb-2 block">모델</label>
              <select
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                disabled={isLoading}
                className="w-full px-3 py-2 bg-input-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                <option value="gpt-4.1">gpt-4.1</option>
                <option value="gpt-5-mini">gpt-5-mini</option>
                <option value="gpt-5">gpt-5</option>
              </select>
            </div>
            <div>
              <label className="text-sm mb-2 block">Base URL</label>
              <input
                type="text"
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                disabled={isLoading}
                placeholder="https://api.openai.com/v1"
                className="w-full px-3 py-2 bg-input-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-foreground mb-4">Git 설정</h3>
          <div>
            <label className="text-sm mb-2 block">기본 Git 저장소 경로</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={form.gitPath}
                onChange={(e) => setForm({ ...form, gitPath: e.target.value })}
                placeholder="/path/to/your/repo"
                disabled={isLoading}
                className="flex-1 px-3 py-2 bg-input-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={handleSelectGitFolder}
                disabled={isLoading}
                className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                찾아보기
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              여기 저장한 경로는 Dashboard와 Git Activity가 함께 사용합니다.
            </p>
          </div>
        </div>

        {message && (
          <div className="rounded-lg border border-border bg-accent/40 px-4 py-3 text-sm text-muted-foreground">
            {message}
          </div>
        )}

        {/* 피드백 학습 초기화 */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-foreground mb-1">피드백 학습 초기화</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Evidence 피드백으로 학습된 스코어링 가중치와 청킹 파라미터를 기본값으로 되돌립니다.
          </p>
          <button
            onClick={handleResetLearning}
            disabled={isResetting}
            className="px-4 py-2 border border-destructive text-destructive rounded-md text-sm hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isResetting ? '초기화 중...' : '학습 데이터 초기화'}
          </button>
          {resetMessage && (
            <p className="text-sm text-muted-foreground mt-3">{resetMessage}</p>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={isLoading || isSaving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
