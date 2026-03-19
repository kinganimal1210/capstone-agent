import { FileText, Folder, Search } from 'lucide-react'
import { useState } from 'react'

const mockDocs = [
  { id: '1', name: 'README.md', type: 'md', size: '4.2 KB', modified: '2026-03-19' },
  { id: '2', name: '시스템 아키텍처.md', type: 'md', size: '8.7 KB', modified: '2026-03-18' },
  { id: '3', name: '15주 실행계획.md', type: 'md', size: '12.1 KB', modified: '2026-03-12' },
  { id: '4', name: 'capstone-agent.db', type: 'db', size: '48 KB', modified: '2026-03-19' },
]

export function Documents() {
  const [searchQuery, setSearchQuery] = useState('')
  const filtered = mockDocs.filter((d) => d.name.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-foreground mb-2">Documents</h1>
        <p className="text-muted-foreground text-sm">로컬 프로젝트 문서 및 파일을 관리하세요</p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="bg-card border border-border rounded-lg">
        <div className="p-4 border-b border-border flex items-center gap-2 text-muted-foreground">
          <Folder className="w-4 h-4" />
          <span className="text-sm">프로젝트 루트</span>
        </div>
        <div className="divide-y divide-border">
          {filtered.map((doc) => (
            <div key={doc.id} className="flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors cursor-pointer">
              <div className="p-2 bg-primary/10 rounded-md">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{doc.name}</p>
                <p className="text-xs text-muted-foreground">{doc.size} · {doc.modified}</p>
              </div>
              <span className="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground">{doc.type}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 p-4 bg-muted/30 border border-border rounded-lg">
        <p className="text-sm text-muted-foreground text-center">
          Document Search 기능은 Week 9-10에서 구현 예정입니다.
        </p>
      </div>
    </div>
  )
}
