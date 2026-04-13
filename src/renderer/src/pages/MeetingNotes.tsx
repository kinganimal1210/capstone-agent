import { useState, useEffect, useCallback } from 'react'
import { Plus, Calendar, Users, FileText, Search, X, Trash2, Loader2, AlertCircle } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'

interface MeetingNote {
  id: number
  title: string
  date: string
  content: string
  summary?: string
  attendees: string[]
  decisions: string[]
  todos: string[]
}

// DB 레코드를 MeetingNote 형식으로 변환
function toMeetingNote(row: Record<string, unknown>): MeetingNote {
  const content = (row.content as string) || ''

  // content에서 구조화된 데이터 파싱 시도
  let attendees: string[] = []
  let decisions: string[] = []
  let todos: string[] = []
  let mainContent = content

  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object') {
      attendees = parsed.attendees || []
      decisions = parsed.decisions || []
      todos = parsed.todos || []
      mainContent = parsed.content || ''
    }
  } catch {
    // JSON 파싱 실패 시 전체를 content로 사용
    mainContent = content
  }

  return {
    id: row.id as number,
    title: (row.title as string) || '',
    date: (row.date as string) || '',
    content: mainContent,
    summary: (row.summary as string) || undefined,
    attendees,
    decisions,
    todos,
  }
}

const DEFAULT_PROJECT_ID = 1

export function MeetingNotes() {
  const [meetings, setMeetings] = useState<MeetingNote[]>([])
  const [selected, setSelected] = useState<MeetingNote | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [form, setForm] = useState({ 
    title: '', 
    date: new Date().toISOString().substring(0, 10), // 오늘 날짜를 기본값으로 설정
    attendees: '', 
    content: '', 
    decisions: '', 
    todos: '' 
  })
  const [errorMsg, setErrorMsg] = useState<string | null>(null) // 생성 에러 메시지 알림용
  const [editingId, setEditingId] = useState<number | null>(null) // 현재 수정 중인 ID

  // 새 회의록 폼 열기
  const handleOpenCreate = () => {
    setEditingId(null)
    setErrorMsg(null)
    setForm({ 
      title: '', 
      date: new Date().toISOString().substring(0, 10), 
      attendees: '', 
      content: '', 
      decisions: '', 
      todos: '' 
    })
  }

  // 수정 폼 열기
  const handleOpenEdit = (m: MeetingNote) => {
    setEditingId(m.id)
    setErrorMsg(null)
    setForm({
      title: m.title,
      date: m.date,
      attendees: m.attendees.join(', '),
      content: m.content,
      decisions: m.decisions.join('\n'),
      todos: m.todos.join('\n')
    })
    setIsOpen(true)
  }

  // DB에서 회의록 로드
  const loadMeetings = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.api.getMeetings(DEFAULT_PROJECT_ID)
      const notes = rows.map(toMeetingNote)
      setMeetings(notes)
      if (notes.length > 0 && !selected) {
        setSelected(notes[0])
      }
    } catch (err) {
      console.error('회의록 로드 실패:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMeetings()
  }, [loadMeetings])

  const filtered = meetings.filter(
    (m) =>
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 회의록 생성 및 수정
  const handleSubmit = async () => {
    if (!form.title || !form.date) return
    setErrorMsg(null)

    const attendees = form.attendees.split(',').map((a) => a.trim()).filter(Boolean)
    const decisions = form.decisions.split('\n').filter(Boolean)
    const todos = form.todos.split('\n').filter(Boolean)

    const structuredContent = JSON.stringify({
      content: form.content,
      attendees,
      decisions,
      todos,
    })

    try {
      if (editingId) {
        // 수정 모드
        await window.api.updateMeeting(editingId, {
          title: form.title,
          content: structuredContent,
          date: form.date,
        })
        setIsOpen(false)
        await loadMeetings()
        
        // 수정 후 선택된 항목 갱신 (목록 리로드 시 자동 갱신 안될 수 있으므로 수동으로)
        const updatedRows = await window.api.getMeetings(DEFAULT_PROJECT_ID)
        const updatedNote = updatedRows.find((r: any) => r.id === editingId)
        if (updatedNote) setSelected(toMeetingNote(updatedNote))
      } else {
        // 생성 모드
        await window.api.createMeeting({
          projectId: DEFAULT_PROJECT_ID,
          title: form.title,
          content: structuredContent,
          date: form.date,
        })
        setIsOpen(false)
        await loadMeetings()

        // 새로 만든 회의록 선택
        const rows = await window.api.getMeetings(DEFAULT_PROJECT_ID)
        if (rows.length > 0) {
          setSelected(toMeetingNote(rows[0]))
        }
      }
    } catch (err) {
      console.error('회의록 저장 실패:', err)
      setErrorMsg((err as Error).message)
    }
  }

  // 회의록 삭제
  const handleDelete = async (id: number) => {
    try {
      await window.api.deleteMeeting(id)
      if (selected?.id === id) setSelected(null)
      await loadMeetings()
    } catch (err) {
      console.error('회의록 삭제 실패:', err)
    }
  }

  return (
    <div className="flex h-full">
      {/* 목록 패널 */}
      <div className="w-80 border-r border-border bg-muted/30 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-foreground text-base">Meeting Notes</h2>
            <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
              <Dialog.Trigger asChild>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm">
                  <Plus className="w-4 h-4" />
                  New Note
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <Dialog.Title className="text-lg mb-1">{editingId ? '회의록 수정' : '새 회의록 작성'}</Dialog.Title>
                      <Dialog.Description className="text-sm text-muted-foreground">{editingId ? '회의 내용을 수정합니다' : '회의 내용을 기록하세요'}</Dialog.Description>
                    </div>
                    <Dialog.Close asChild>
                      <button className="p-2 hover:bg-accent rounded-md transition-colors"><X className="w-4 h-4" /></button>
                    </Dialog.Close>
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: '제목', key: 'title', type: 'text', placeholder: '회의 제목을 입력하세요' },
                      { label: '날짜', key: 'date', type: 'date', placeholder: '' },
                      { label: '참석자', key: 'attendees', type: 'text', placeholder: '이름을 쉼표로 구분 (예: 김철수, 이영희)' },
                    ].map(({ label, key, type, placeholder }) => (
                      <div key={key}>
                        <label className="text-sm mb-2 block">{label}</label>
                        <input
                          type={type}
                          value={form[key as keyof typeof form]}
                          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                          placeholder={placeholder}
                          className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    ))}
                    {[
                      { label: '회의 내용', key: 'content', placeholder: '회의 내용을 입력하세요' },
                      { label: '결정 사항', key: 'decisions', placeholder: '결정 사항을 한 줄에 하나씩' },
                      { label: 'TODO', key: 'todos', placeholder: '할 일을 한 줄에 하나씩' },
                    ].map(({ label, key, placeholder }) => (
                      <div key={key}>
                        <label className="text-sm mb-2 block">{label}</label>
                        <textarea
                          value={form[key as keyof typeof form]}
                          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                          placeholder={placeholder}
                          className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-20 resize-none"
                        />
                      </div>
                    ))}
                  </div>
                  {errorMsg && (
                    <div className="mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}
                  <div className="flex justify-end gap-3 mt-6">
                    <Dialog.Close asChild>
                      <button className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent transition-colors">취소</button>
                    </Dialog.Close>
                    <button
                      onClick={handleSubmit}
                      disabled={!form.title || !form.date}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {editingId ? '수정 완료' : '작성 완료'}
                    </button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search meetings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">로딩 중...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">회의록이 없습니다</p>
              <p className="text-xs mt-1">새 회의록을 작성해보세요</p>
            </div>
          ) : (
            filtered.map((meeting) => (
              <button
                key={meeting.id}
                onClick={() => setSelected(meeting)}
                className={`w-full p-4 text-left border-b border-border hover:bg-accent/50 transition-colors ${selected?.id === meeting.id ? 'bg-accent' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-md mt-0.5">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm mb-1 truncate">{meeting.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>{meeting.date}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 상세 패널 */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <div className="max-w-4xl mx-auto p-8">
            <div className="mb-6">
              <div className="flex items-start justify-between">
                <h1 className="text-foreground mb-2">{selected.title}</h1>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(selected)}
                    className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                    title="수정"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-edit-2 w-4 h-4"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                  </button>
                  <button
                    onClick={() => handleDelete(selected.id)}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                    title="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /><span>{selected.date}</span></div>
                {selected.attendees.length > 0 && (
                  <div className="flex items-center gap-2"><Users className="w-4 h-4" /><span>{selected.attendees.length}명 참석</span></div>
                )}
              </div>
            </div>

            {selected.attendees.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-6 mb-6">
                <h3 className="text-sm mb-3 text-muted-foreground">참석자</h3>
                <div className="flex flex-wrap gap-2">
                  {selected.attendees.map((a) => (
                    <span key={a} className="px-3 py-1 bg-muted rounded-full text-sm">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {selected.content && (
              <div className="bg-card border border-border rounded-lg p-6 mb-6">
                <h3 className="text-sm mb-4 text-muted-foreground">회의 내용</h3>
                <p className="text-foreground leading-relaxed text-sm whitespace-pre-wrap">{selected.content}</p>
              </div>
            )}

            {selected.decisions.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-6 mb-6">
                <h3 className="text-sm mb-4 text-muted-foreground">결정 사항</h3>
                <ul className="space-y-2">
                  {selected.decisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                      <span className="text-foreground flex-1 text-sm">{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selected.todos.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-sm mb-4 text-muted-foreground">TODO</h3>
                <ul className="space-y-3">
                  {selected.todos.map((todo, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <input type="checkbox" className="mt-1" />
                      <span className="text-foreground flex-1 text-sm">{todo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">회의록을 선택하세요</p>
          </div>
        )}
      </div>
    </div>
  )
}
