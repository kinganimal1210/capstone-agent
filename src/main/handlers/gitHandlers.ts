import { IpcMain, dialog, BrowserWindow } from 'electron'
import { isValidGitRepo, getRepoInfo, getRecentCommits, getCommitDetail, getBranchRefs, getBranchRepoInfo } from '../services/gitService'

export function registerGitHandlers(ipcMain: IpcMain): void {
  // Git 저장소 유효성 검증
  ipcMain.handle('git:validate', (_event, repoPath: string) => {
    try {
      return { valid: isValidGitRepo(repoPath), error: null }
    } catch (error) {
      return { valid: false, error: (error as Error).message }
    }
  })

  // Git 저장소 기본 정보
  ipcMain.handle('git:repoInfo', (_event, repoPath: string) => {
    try {
      if (!isValidGitRepo(repoPath)) {
        return { data: null, error: '유효한 Git 저장소가 아닙니다.' }
      }
      const info = getRepoInfo(repoPath)
      return { data: info, error: null }
    } catch (error) {
      return { data: null, error: (error as Error).message }
    }
  })

  ipcMain.handle('git:branches', (_event, repoPath: string) => {
    try {
      if (!isValidGitRepo(repoPath)) {
        return { data: [], error: '유효한 Git 저장소가 아닙니다.' }
      }
      return { data: getBranchRefs(repoPath), error: null }
    } catch (error) {
      return { data: [], error: (error as Error).message }
    }
  })

  ipcMain.handle('git:branchRepoInfo', (_event, repoPath: string, ref: string) => {
    try {
      if (!isValidGitRepo(repoPath)) {
        return { data: null, error: '유효한 Git 저장소가 아닙니다.' }
      }
      const info = ref ? getBranchRepoInfo(repoPath, ref) : getRepoInfo(repoPath)
      return { data: info, error: null }
    } catch (error) {
      return { data: null, error: (error as Error).message }
    }
  })

  // 최근 커밋 목록 조회
  ipcMain.handle('git:recentCommits', (_event, repoPath: string, count?: number, ref?: string) => {
    try {
      if (!isValidGitRepo(repoPath)) {
        return { data: [], error: '유효한 Git 저장소가 아닙니다.' }
      }
      const commits = getRecentCommits(repoPath, count ?? 30, ref)
      return { data: commits, error: null }
    } catch (error) {
      return { data: [], error: (error as Error).message }
    }
  })

  // 특정 커밋 상세 정보 (변경 파일 포함)
  ipcMain.handle('git:commitDetail', (_event, repoPath: string, commitHash: string) => {
    try {
      if (!isValidGitRepo(repoPath)) {
        return { data: null, error: '유효한 Git 저장소가 아닙니다.' }
      }
      const commit = getCommitDetail(repoPath, commitHash)
      return { data: commit, error: null }
    } catch (error) {
      return { data: null, error: (error as Error).message }
    }
  })

  // 폴더 선택 다이얼로그
  ipcMain.handle('git:selectFolder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { path: null }

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Git 저장소 폴더 선택'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { path: null }
    }

    const selectedPath = result.filePaths[0]
    const valid = isValidGitRepo(selectedPath)
    return { path: selectedPath, valid }
  })
}
