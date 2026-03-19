import { CheckCircle2, AlertCircle, FileText, ChevronRight } from 'lucide-react'

interface Evidence {
  source: string
  title: string
  snippet: string
}

interface SuggestedAction {
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
}

interface ResultDisplayProps {
  summary: string
  evidence: Evidence[]
  suggestedActions: SuggestedAction[]
}

export function ResultDisplay({ summary, evidence, suggestedActions }: ResultDisplayProps) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-primary/10 rounded-md">
            <CheckCircle2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-foreground mb-1">Summary</h3>
            <p className="text-sm text-muted-foreground">분석 결과 요약</p>
          </div>
        </div>
        <p className="text-foreground leading-relaxed text-sm">{summary}</p>
      </div>

      {/* Evidence */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-accent rounded-md">
            <FileText className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <h3 className="text-foreground mb-1">Evidence</h3>
            <p className="text-sm text-muted-foreground">{evidence.length}개의 관련 항목</p>
          </div>
        </div>
        <div className="space-y-3">
          {evidence.map((item, i) => (
            <div key={i} className="p-4 bg-accent/30 border border-border rounded-lg hover:bg-accent/50 transition-colors">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">{item.source}</span>
                    <span className="text-sm text-foreground">{item.title}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground">{item.snippet}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Suggested Actions */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-destructive/10 rounded-md">
            <AlertCircle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h3 className="text-foreground mb-1">Suggested Actions</h3>
            <p className="text-sm text-muted-foreground">권장 후속 작업</p>
          </div>
        </div>
        <div className="space-y-2">
          {suggestedActions.map((action, i) => (
            <div key={i} className="p-4 bg-background border border-border rounded-lg hover:border-primary/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${
                  action.priority === 'high' ? 'bg-destructive' : action.priority === 'medium' ? 'bg-chart-4' : 'bg-muted-foreground'
                }`} />
                <div className="flex-1">
                  <h4 className="text-sm text-foreground mb-1">{action.title}</h4>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
