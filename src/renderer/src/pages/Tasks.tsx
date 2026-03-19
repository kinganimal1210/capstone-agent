import { useState } from 'react'
import { Plus, Search, Circle, CheckCircle2, Clock, AlertCircle, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'

interface Task {
  id: string
  title: string
  description: string
  status: 'todo' | 'in-progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  assignee: string
  dueDate: string
}

const initialTasks: Task[] = [
  { id: '1', title: 'Git 데이터 수집 모듈 완성', description: 'Git 저장소에서 커밋 히스토리, 변경 파일 목록을 수집하는 모듈 구현', status: 'in-progress', priority: 'high', assignee: '이영희', dueDate: '2026-03-15' },
  { id: '2', title: 'UI 컴포넌트 기본 구조 설계', description: 'Data Source Selector, Tool Selector, Prompt Input 등 주요 컴포넌트 설계', status: 'in-progress', priority: 'high', assignee: '박민수', dueDate: '2026-03-15' },
  { id: '3', title: 'Retrieval 계층 설계 문서 작성', description: 'Keyword search, metadata filtering, recency scoring 전략 문서화', status: 'todo', priority: 'medium', assignee: '김철수', dueDate: '2026-03-17' },
  { id: '4', title: 'Electron 메인 프로세스 구현', description: 'Electron 메인 프로세스 및 IPC 통신 설정', status: 'done', priority: 'high', assignee: '김철수', dueDate: '2026-03-05' },
  { id: '5', title: 'SQLite 데이터베이스 스키마 설계', description: '회의록, 태스크, 프로젝트 정보를 저장할 SQLite 스키마 설계', status: 'done', priority: 'high', assignee: '이영희', dueDate: '2026-03-08' },
  { id: '6', title: 'Windows 11 테스트 환경 준비', description: 'Windows 11 VM에서 앱 테스트 환경 구축', status: 'todo', priority: 'medium', assignee: '정지원', dueDate: '2026-03-20' },
  { id: '7', title: 'LLM API 연동 및 프롬프트 엔지니어링', description: 'OpenAI API 연동 및 프로젝트 분석용 프롬프트 템플릿 작성', status: 'todo', priority: 'high', assignee: '김철수', dueDate: '2026-03-18' },
]

const statusConfig = {
  todo: { label: 'To Do', icon: Circle, color: 'text-muted-foreground' },
  'in-progress': { label: 'In Progress', icon: Clock, color: 'text-blue-500' },
  done: { label: 'Done', icon: CheckCircle2, color: 'text-green-500' },
}

const priorityColor = {
  high: 'text-red-500 bg-red-500/10 border-red-500/20',
  medium: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  low: 'text-green-500 bg-green-500/10 border-green-500/20',
}

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | Task['status']>('all')
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', status: 'todo' as Task['status'], priority: 'medium' as Task['priority'], assignee: '', dueDate: '' })

  const handleCreate = () => {
    if (!form.title || !form.assignee || !form.dueDate) return
    const task: Task = { id: Date.now().toString(), ...form }
    setTasks([...tasks, task])
    setIsOpen(false)
    setForm({ title: '', description: '', status: 'todo', priority: 'medium', assignee: '', dueDate: '' })
  }

  const filtered = tasks.filter((t) => {
    const matchSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchStatus = filterStatus === 'all' || t.status === filterStatus
    return matchSearch && matchStatus
  })

  const byStatus = (status: Task['status']) => filtered.filter((t) => t.status === status)

  return (
    <div className="h-full flex flex-col">
      <div className="p-8 border-b border-border">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-foreground mb-2">Tasks</h1>
              <p className="text-muted-foreground text-sm">프로젝트 작업을 관리하세요</p>
            </div>
            <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
              <Dialog.Trigger asChild>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm">
                  <Plus className="w-4 h-4" />New Task
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
                <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-lg p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <Dialog.Title className="text-lg mb-1">새 태스크 생성</Dialog.Title>
                      <Dialog.Description className="text-sm text-muted-foreground">작업 정보를 입력하세요</Dialog.Description>
                    </div>
                    <Dialog.Close asChild>
                      <button className="p-2 hover:bg-accent rounded-md transition-colors"><X className="w-4 h-4" /></button>
                    </Dialog.Close>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm mb-2 block">제목</label>
                      <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="작업 제목을 입력하세요" className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <div>
                      <label className="text-sm mb-2 block">설명</label>
                      <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="작업 설명" className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-20 resize-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm mb-2 block">상태</label>
                        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Task['status'] })} className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                          <option value="todo">To Do</option>
                          <option value="in-progress">In Progress</option>
                          <option value="done">Done</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm mb-2 block">우선순위</label>
                        <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Task['priority'] })} className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm mb-2 block">담당자</label>
                      <input type="text" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} placeholder="담당자 이름" className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <div>
                      <label className="text-sm mb-2 block">마감일</label>
                      <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                    <Dialog.Close asChild>
                      <button className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent transition-colors">취소</button>
                    </Dialog.Close>
                    <button onClick={handleCreate} disabled={!form.title || !form.assignee || !form.dueDate} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">생성</button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="text" placeholder="Search tasks..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex items-center gap-1 bg-muted rounded-md p-1">
              {(['all', 'todo', 'in-progress', 'done'] as const).map((s) => (
                <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 rounded text-sm transition-colors ${filterStatus === s ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}>
                  {s === 'all' ? 'All' : s === 'todo' ? 'To Do' : s === 'in-progress' ? 'In Progress' : 'Done'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-3 gap-6">
            {(['todo', 'in-progress', 'done'] as const).map((status) => {
              const { label, icon: Icon, color } = statusConfig[status]
              const statusTasks = byStatus(status)
              return (
                <div key={status} className="flex flex-col">
                  <div className={`flex items-center gap-2 mb-4 ${color}`}>
                    <Icon className="w-4 h-4" />
                    <h3 className="text-sm text-foreground">{label}</h3>
                    <span className="ml-auto text-xs text-muted-foreground">{statusTasks.length}</span>
                  </div>
                  <div className="space-y-3">
                    {statusTasks.map((task) => (
                      <div key={task.id} className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-sm flex-1 pr-2">{task.title}</h4>
                          <span className={`px-2 py-0.5 rounded text-xs border ${priorityColor[task.priority]}`}>{task.priority}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{task.description}</p>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{task.assignee}</span>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <AlertCircle className="w-3 h-3" />
                            <span>{task.dueDate}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
