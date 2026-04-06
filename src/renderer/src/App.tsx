import { createHashRouter, RouterProvider } from 'react-router'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { MeetingNotes } from './pages/MeetingNotes'
import { Tasks } from './pages/Tasks'
import { Documents } from './pages/Documents'
import { Guide } from './pages/Guide'
import { Settings } from './pages/Settings'
import { GitActivity } from './pages/GitActivity'
import React from 'react'

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding: 32, fontFamily: 'monospace', color: 'red', background: '#fff'}}>
          <h2>Error</h2>
          <pre>{this.state.error.message}</pre>
          <pre>{this.state.error.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

const router = createHashRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: 'meetings', Component: MeetingNotes },
      { path: 'tasks', Component: Tasks },
      { path: 'git', Component: GitActivity },
      { path: 'documents', Component: Documents },
      { path: 'guide', Component: Guide },
      { path: 'settings', Component: Settings },
    ],
  },
])

export default function App() {
  return <ErrorBoundary><RouterProvider router={router} /></ErrorBoundary>
}
