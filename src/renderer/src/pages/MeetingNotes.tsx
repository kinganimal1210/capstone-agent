import { useState } from 'react'
import { Plus, Calendar, Users, FileText, Search, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'

interface MeetingNote {
  id: string
  title: string
  date: string
  attendees: string[]
  decisions: string[]
  todos: string[]
  content: string
}

const initial: MeetingNote[] = [
  {
    id: '1',
    title: '3주차 진행상황 점검 회의',
    date: '2026-03-10',
    attendees: ['김철수', '이영희', '박민수', '정지원'],
    decisions: ['Electron 메인 프로세스 구조 확정', 'SQLite를 회의록 및 태스크 저장소로 사용', 'Windows 11 테스트 환경 4주차에 준비'],
    todos: ['Git 데이터 수집 모듈 완성 - 이영희', 'UI 컴포넌트 기본 구조 설계 - 박민수', 'Retrieval 계층 설계 문서 작성 - 김철수'],
    content: '3주차 스프린트 결과를 점검하고 4주차 계획을 수립했습니다. Electron 앱의 기본 구조가 완성되었으며, 다음 주부터는 데이터 소스 연동과 Tool/API 라우팅 작업을 진행합니다.',
  },
  {
    id: '2',
    title: '2주차 기술 스택 확정 회의',
    date: '2026-03-03',
    attendees: ['김철수', '이영희', '박민수'],
    decisions: ['React + TypeScript 프론트엔드 확정', 'Node.js 기반 로컬 백엔드 사용', 'OpenAI API를 LLM 엔진으로 선정'],
    todos: ['Electron 프로젝트 세팅 - 김철수', 'Git 히스토리 분석 로직 연구 - 이영희', 'UI/UX 디자인 스케치 - 박민수'],
    content: '기술 스택을 최종 확정하고 각 팀원의 역할을 분담했습니다.',
  },
  {
    id: '3',
    title: '1주차 킥오프 미팅',
    date: '2026-02-24',
    attendees: ['김철수', '이영희', '박민수', '정지원'],
    decisions: ['프로젝트 주제: 캡스톤 협업 지원 AI 에이전트', '15주 일정으로 MVP 개발', '주 1회 정기 회의 진행'],
    todos: ['요구사항 분석 문서 작성 - 전체', '기술 스택 조사 - 김철수, 이영희', '유사 제품 리서치 - 박민수, 정지원'],
    content: '캡스톤 프로젝트를 시작하며 팀 목표와 방향성을 논의했습니다.',
  },
]

export function MeetingNotes() {
  const [meetings, setMeetings] = useState<MeetingNote[]>(initial)
  const [selected, setSelected] = useState<MeetingNote | null>(initial[0])
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState({ title: '', date: '', attendees: '', content: '', decisions: '', todos: '' })

  const filtered = meetings.filter(
    (m) =>
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleCreate = () => {
    if (!form.title || !form.date) return
    const meeting: MeetingNote = {
      id: Date.now().toString(),
      title: form.title,
      date: form.date,
      attendees: form.attendees.split(',').map((a) => a.trim()).filter(Boolean),
      decisions: form.decisions.split('\n').filter(Boolean),
      todos: form.todos.split('\n').filter(Boolean),
      content: form.content,
    }
    setMeetings([meeting, ...meetings])
    setSelected(meeting)
    setIsOpen(false)
    setForm({ title: '', date: '', attendees: '', content: '', decisions: '', todos: '' })
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
                      <Dialog.Title className="text-lg mb-1">새 회의록 작성</Dialog.Title>
                      <Dialog.Description className="text-sm text-muted-foreground">회의 내용을 기록하세요</Dialog.Description>
                    </div>
                    <Dialog.Close asChild>
                      <button className="p-2 hover:bg-accent rounded-md transition-colors"><X className="w-4 h-4" /></button>
                    </Dialog.Close>
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: '제목', key: 'title', type: 'input', placeholder: '회의 제목을 입력하세요' },
                      { label: '날짜', key: 'date', type: 'date', placeholder: '' },
                      { label: '참석자', key: 'attendees', type: 'input', placeholder: '이름을 쉼표로 구분 (예: 김철수, 이영희)' },
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
                  <div className="flex justify-end gap-3 mt-6">
                    <Dialog.Close asChild>
                      <button className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent transition-colors">취소</button>
                    </Dialog.Close>
                    <button
                      onClick={handleCreate}
                      disabled={!form.title || !form.date}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      작성 완료
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
          {filtered.map((meeting) => (
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
          ))}
        </div>
      </div>

      {/* 상세 패널 */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <div className="max-w-4xl mx-auto p-8">
            <div className="mb-6">
              <h1 className="text-foreground mb-2">{selected.title}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /><span>{selected.date}</span></div>
                <div className="flex items-center gap-2"><Users className="w-4 h-4" /><span>{selected.attendees.length}명 참석</span></div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6 mb-6">
              <h3 className="text-sm mb-3 text-muted-foreground">참석자</h3>
              <div className="flex flex-wrap gap-2">
                {selected.attendees.map((a) => (
                  <span key={a} className="px-3 py-1 bg-muted rounded-full text-sm">{a}</span>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6 mb-6">
              <h3 className="text-sm mb-4 text-muted-foreground">회의 내용</h3>
              <p className="text-foreground leading-relaxed text-sm">{selected.content}</p>
            </div>

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
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            회의록을 선택하세요
          </div>
        )}
      </div>
    </div>
  )
}
