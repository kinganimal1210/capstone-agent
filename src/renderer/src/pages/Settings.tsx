import { Settings as SettingsIcon } from 'lucide-react'

export function Settings() {
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
              <label className="text-sm mb-2 block">API Key</label>
              <input
                type="password"
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-input-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1">LLM API 키를 입력하세요. 로컬에만 저장됩니다.</p>
            </div>
            <div>
              <label className="text-sm mb-2 block">모델</label>
              <select className="w-full px-3 py-2 bg-input-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option>gpt-4o</option>
                <option>gpt-4o-mini</option>
                <option>claude-sonnet-4-6</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-foreground mb-4">Git 설정</h3>
          <div>
            <label className="text-sm mb-2 block">기본 Git 저장소 경로</label>
            <input
              type="text"
              placeholder="/path/to/your/repo"
              className="w-full px-3 py-2 bg-input-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors">
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
