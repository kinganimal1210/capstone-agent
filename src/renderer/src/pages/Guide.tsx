import { Sparkles, CheckCircle2, Circle } from 'lucide-react'

const weeks = [
  { range: 'Week 1-2', title: '범위 확정 & 아키텍처 설계', done: true },
  { range: 'Week 3-4', title: 'Electron 뼈대 & SQLite DB', done: true },
  { range: 'Week 5-6', title: 'CRUD & 질의 UI', done: false },
  { range: 'Week 7-8', title: 'Git / Meetings / Tasks Retrieval', done: false },
  { range: 'Week 9-10', title: 'Documents & Scoring', done: false },
  { range: 'Week 11-12', title: 'Tool Router & LLM 연동', done: false },
  { range: 'Week 13-15', title: '대시보드, 보고서, 시연 안정화', done: false },
]

export function Guide() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="mb-8 flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-md">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-foreground mb-1">Project Guide</h1>
          <p className="text-muted-foreground text-sm">15주 실행계획 진행 현황</p>
        </div>
      </div>

      <div className="space-y-3">
        {weeks.map((week, i) => (
          <div key={i} className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg">
            {week.done ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
            ) : (
              <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-20">{week.range}</span>
                <span className={`text-sm ${week.done ? 'text-foreground' : 'text-muted-foreground'}`}>{week.title}</span>
              </div>
            </div>
            {week.done && <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-600 rounded border border-green-500/20">완료</span>}
          </div>
        ))}
      </div>

      <div className="mt-8 p-6 bg-card border border-border rounded-lg">
        <h3 className="text-foreground mb-4">핵심 데모 시나리오</h3>
        <div className="space-y-3">
          {[
            { num: 1, desc: 'Git → Git Progress Analyzer → "현재 프로젝트 진행상황 알려줘"' },
            { num: 2, desc: 'Meetings + Tasks → Meeting Summarizer → "지난 회의 이후 아직 안 끝난 일 알려줘"' },
            { num: 3, desc: 'Git + Meetings + Tasks → Cross-source Summary → "중간발표 기준 현재 상태 요약해줘"' },
          ].map((s) => (
            <div key={s.num} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
              <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs flex-shrink-0">{s.num}</span>
              <p className="text-sm text-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
