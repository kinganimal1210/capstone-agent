import { Activity, FileSearch, ListChecks, BookOpen, BarChart3 } from 'lucide-react'

const tools = [
  { id: 'git-progress-analyzer', name: 'Git Progress Analyzer', icon: Activity, description: 'Analyze commits and code changes', requiredSources: ['git'] },
  { id: 'meeting-summarizer', name: 'Meeting Summarizer', icon: FileSearch, description: 'Summarize discussions and TODOs', requiredSources: ['meetings'] },
  { id: 'task-status-query', name: 'Task Status Query', icon: ListChecks, description: 'Check task completion status', requiredSources: ['tasks'] },
  { id: 'document-search', name: 'Document Search', icon: BookOpen, description: 'Search through project documents', requiredSources: ['documents'] },
  { id: 'cross-source-summary', name: 'Cross-source Report', icon: BarChart3, description: 'Generate comprehensive reports', requiredSources: ['git', 'meetings', 'tasks'] },
]

interface ToolSelectorProps {
  selectedTool: string | null
  onToolChange: (toolId: string) => void
  availableSources: string[]
}

export function ToolSelector({ selectedTool, onToolChange, availableSources }: ToolSelectorProps) {
  const isAvailable = (tool: (typeof tools)[0]) =>
    tool.requiredSources.every((s) => availableSources.includes(s))

  return (
    <div className="space-y-3">
      <h3 className="text-foreground text-base">Tools & Analysis</h3>
      <div className="space-y-2">
        {tools.map((tool) => {
          const available = isAvailable(tool)
          const selected = selectedTool === tool.id
          const Icon = tool.icon
          return (
            <button
              key={tool.id}
              onClick={() => available && onToolChange(tool.id)}
              disabled={!available}
              className={`w-full p-3 rounded-lg border transition-all text-left ${
                selected
                  ? 'border-primary bg-primary/5'
                  : available
                  ? 'border-border bg-card hover:border-primary/30'
                  : 'border-border bg-muted/30 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-md ${selected ? 'bg-primary text-primary-foreground' : available ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm text-foreground">{tool.name}</span>
                    {selected && <div className="w-1.5 h-1.5 bg-primary rounded-full" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{tool.description}</p>
                  {!available && (
                    <p className="text-xs text-destructive mt-1">Requires: {tool.requiredSources.join(', ')}</p>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
