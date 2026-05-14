import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Circle, CheckCircle2, Clock, AlertCircle, X, Trash2, Loader2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'

interface Task {
  id: number
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  assignee: string
  dueDate: string
}

// DB 레코드를 Task 형식으로 변환
function toTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as number,
    title: (row.title as string) || '',
    description: (row.description as string) || '',
    status: (row.status as Task['status']) || 'todo',
    priority: (row.priority as Task['priority']) || 'medium',
    assignee: (row.assignee as string) || '',
    dueDate: (row.due_date as string) || '',
  }
}

const DEFAULT_PROJECT_ID = 1

const statusConfig = {
  todo: { label: 'To Do', icon: Circle, color: 'text-muted-foreground' },
  in_progress: { label: 'In Progress', icon: Clock, color: 'text-blue-500' },
  done: { label: 'Done', icon: CheckCircle2, color: 'text-green-500' },
}

const priorityColor = {
  high: 'text-red-500 bg-red-500/10 border-red-500/20',
  medium: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  low: 'text-green-500 bg-green-500/10 border-green-500/20',
}

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | Task['status']>('all')
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'todo' as Task['status'],
    priority: 'medium' as Task['priority'],
    assignee: '',
    dueDate: '',
  })

  // DB에서 태스크 로드
  const loadTasks = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.api.getTasks(DEFAULT_PROJECT_ID)
      setTasks(rows.map(toTask))
    } catch (err) {
      console.error('태스크 로드 실패:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const [editingId, setEditingId] = useState<number | null>(null)

  // 새 태스크 폼 열기
  const handleOpenCreate = () => {
    setEditingId(null)
    setForm({ title: '', description: '', status: 'todo', priority: 'medium', assignee: '', dueDate: '' })
  }

  // 태스크 수정 폼 열기
  const handleOpenEdit = (t: Task) => {
    setEditingId(t.id)
    setForm({
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      assignee: t.assignee,
      dueDate: t.dueDate,
    })
    setIsOpen(true)
  }

  // 태스크 생성 및 수정
  const handleSubmit = async () => {
    if (!form.title) return
    try {
      if (editingId) {
        // 수정 모드
        await window.api.updateTask(editingId, {
          title: form.title,
          description: form.description || undefined,
          status: form.status,
          priority: form.priority,
          assignee: form.assignee || undefined,
          dueDate: form.dueDate || undefined,
        })
      } else {
        // 생성 모드
        await window.api.createTask({
          projectId: DEFAULT_PROJECT_ID,
          title: form.title,
          description: form.description || undefined,
          status: form.status,
          priority: form.priority,
          assignee: form.assignee || undefined,
          dueDate: form.dueDate || undefined,
        })
      }
      setIsOpen(false)
      handleOpenCreate()
      await loadTasks()
    } catch (err) {
      console.error('태스크 저장 실패:', err)
    }
  }

  // 상태 변경
  const handleStatusChange = async (id: number, newStatus: Task['status']) => {
    try {
      await window.api.updateTaskStatus(id, newStatus)
      await loadTasks()
    } catch (err) {
      console.error('상태 변경 실패:', err)
    }
  }

  // 태스크 삭제
  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await window.api.deleteTask(id)
      await loadTasks()
    } catch (err) {
      console.error('태스크 삭제 실패:', err)
    }
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
                <button onClick={handleOpenCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm">
                  <Plus className="w-4 h-4" />New Task
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
                <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-lg p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <Dialog.Title className="text-lg mb-1">{editingId ? '태스크 수정' : '새 태스크 생성'}</Dialog.Title>
                      <Dialog.Description className="text-sm text-muted-foreground">{editingId ? '작업 정보를 수정하세요' : '작업 정보를 입력하세요'}</Dialog.Description>
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
                          <option value="in_progress">In Progress</option>
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
                    <button onClick={handleSubmit} disabled={!form.title} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      {editingId ? '수정 완료' : '생성'}
                    </button>
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
              {(['all', 'todo', 'in_progress', 'done'] as const).map((s) => (
                <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 rounded text-sm transition-colors ${filterStatus === s ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}>
                  {s === 'all' ? 'All' : s === 'todo' ? 'To Do' : s === 'in_progress' ? 'In Progress' : 'Done'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-8">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span className="text-sm">로딩 중...</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-6">
              {(['todo', 'in_progress', 'done'] as const).map((status) => {
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
                      {statusTasks.length === 0 ? (
                        <div className="border border-dashed border-border rounded-lg p-6 text-center text-muted-foreground text-xs">
                          태스크 없음
                        </div>
                      ) : (
                        statusTasks.map((task) => (
                          <div
                            key={task.id}
                            className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow group flex flex-col"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <h4 className="text-sm flex-1 pr-2 leading-tight">{task.title}</h4>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${priorityColor[task.priority]}`}>
                                  {task.priority.toUpperCase()}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleOpenEdit(task); }}
                                  className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all"
                                  title="수정"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-edit-2 w-3.5 h-3.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                </button>
                                <button
                                  onClick={(e) => handleDelete(task.id, e)}
                                  className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                                  title="삭제"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            {task.description && (
                              <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{task.description}</p>
                            )}
                            <div className="flex justify-between items-center text-xs mt-auto pt-2">
                              <span className="text-muted-foreground truncate max-w-[100px]">{task.assignee || '담당자 없음'}</span>
                              {task.dueDate && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <AlertCircle className="w-3 h-3" />
                                  <span>{task.dueDate}</span>
                                </div>
                              )}
                            </div>
                            
                            {/* 상태 변경 토글 컨트롤 */}
                            <div className="flex bg-muted/40 rounded-md p-1 mt-3 border border-border/50">
                              {(['todo', 'in_progress', 'done'] as const).map((s) => (
                                <button
                                  key={s}
                                  onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, s); }}
                                  className={`flex-1 text-[10px] py-1 rounded transition-all duration-200 ${
                                    task.status === s 
                                      ? 'bg-background shadow-sm text-foreground font-medium' 
                                      : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                                  }`}
                                >
                                  {s === 'todo' ? 'To Do' : s === 'in_progress' ? 'In Progress' : 'Done'}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
