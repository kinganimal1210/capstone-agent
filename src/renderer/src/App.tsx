import { createHashRouter, RouterProvider } from 'react-router'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { MeetingNotes } from './pages/MeetingNotes'
import { Tasks } from './pages/Tasks'
import { Documents } from './pages/Documents'
import { Guide } from './pages/Guide'
import { Settings } from './pages/Settings'

const router = createHashRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: 'meetings', Component: MeetingNotes },
      { path: 'tasks', Component: Tasks },
      { path: 'documents', Component: Documents },
      { path: 'guide', Component: Guide },
      { path: 'settings', Component: Settings },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
