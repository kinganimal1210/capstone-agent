import { contextBridge, ipcRenderer } from 'electron'
import type { QueryRequest } from '../shared/types'

// renderer에서 사용할 수 있는 API를 window.api로 노출
contextBridge.exposeInMainWorld('api', {
  // 프로젝트
  getProjects: () => ipcRenderer.invoke('projects:getAll'),
  createProject: (data: { name: string; description?: string; gitPath?: string }) =>
    ipcRenderer.invoke('projects:create', data),

  // 회의록
  getMeetings: (projectId: number) => ipcRenderer.invoke('meetings:getByProject', projectId),
  createMeeting: (data: { projectId: number; title: string; content: string; date: string }) =>
    ipcRenderer.invoke('meetings:create', data),

  // 태스크
  getTasks: (projectId: number) => ipcRenderer.invoke('tasks:getByProject', projectId),
  createTask: (data: {
    projectId: number
    title: string
    status: string
    priority: string
    assignee?: string
  }) => ipcRenderer.invoke('tasks:create', data),
  updateTaskStatus: (id: number, status: string) =>
    ipcRenderer.invoke('tasks:updateStatus', id, status),

  // 질의
  query: (request: QueryRequest) => ipcRenderer.invoke('query:run', request)
})
