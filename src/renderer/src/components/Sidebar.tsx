import { FileText, GitBranch, MessageSquare, CheckSquare, Settings, FolderOpen, Sparkles } from 'lucide-react'
import { Link, useLocation } from 'react-router'

const navigation = [
  { name: 'Dashboard', path: '/', icon: GitBranch },
  { name: 'Meeting Notes', path: '/meetings', icon: MessageSquare },
  { name: 'Tasks', path: '/tasks', icon: CheckSquare },
  { name: 'Documents', path: '/documents', icon: FileText },
  { name: 'Project Guide', path: '/guide', icon: Sparkles },
]

interface SidebarProps {
  currentProject?: string
}

export function Sidebar({ currentProject = 'Capstone AI Agent' }: SidebarProps) {
  const location = useLocation()

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <div className="w-64 h-full bg-sidebar border-r border-sidebar-border flex flex-col flex-shrink-0">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 bg-sidebar-primary rounded-md flex items-center justify-center">
            <span className="text-sidebar-primary-foreground text-sm font-medium">C</span>
          </div>
          <h2 className="text-sidebar-foreground text-base">Capstone Agent</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Capstone Project Assistant</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Current Project</span>
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="bg-sidebar-accent rounded-lg p-3">
              <p className="text-sm text-sidebar-accent-foreground">{currentProject}</p>
            </div>
          </div>

          <div className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon
              const active = isActive(item.path)
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm ${
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <Link
          to="/settings"
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sidebar-foreground hover:bg-sidebar-accent/50 text-sm"
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </Link>
      </div>
    </div>
  )
}
