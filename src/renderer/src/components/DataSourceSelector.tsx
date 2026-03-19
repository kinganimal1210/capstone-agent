import { GitBranch, MessageSquare, CheckSquare, FileText } from 'lucide-react'

const dataSources = [
  { id: 'git', name: 'Git Repository', icon: GitBranch, description: 'Commits, branches, and code changes' },
  { id: 'meetings', name: 'Meeting Notes', icon: MessageSquare, description: 'Discussion records and decisions' },
  { id: 'tasks', name: 'Tasks', icon: CheckSquare, description: 'Project tasks and milestones' },
  { id: 'documents', name: 'Local Documents', icon: FileText, description: 'Design docs, README, reports' },
]

interface DataSourceSelectorProps {
  selectedSources: string[]
  onSourcesChange: (sources: string[]) => void
}

export function DataSourceSelector({ selectedSources, onSourcesChange }: DataSourceSelectorProps) {
  const toggle = (id: string) => {
    if (selectedSources.includes(id)) {
      onSourcesChange(selectedSources.filter((s) => s !== id))
    } else {
      onSourcesChange([...selectedSources, id])
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-foreground text-base">Data Sources</h3>
        <span className="text-xs text-muted-foreground">{selectedSources.length} selected</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {dataSources.map((source) => {
          const isSelected = selectedSources.includes(source.id)
          const Icon = source.icon
          return (
            <button
              key={source.id}
              onClick={() => toggle(source.id)}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/30'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-md ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-foreground">{source.name}</span>
                    {isSelected && <div className="w-1.5 h-1.5 bg-primary rounded-full" />}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">{source.description}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
