import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { GitCommit, GitChangedFile, GitRepoInfo } from '../../shared/types'

/**
 * Git CLI를 child_process로 호출하여 저장소 데이터를 추출하는 서비스
 */

// Git 명령어 실행 헬퍼
function execGit(repoPath: string, args: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
  } catch (error) {
    const err = error as Error & { stderr?: string }
    throw new Error(`Git 명령 실행 실패: ${err.stderr || err.message}`)
  }
}

// Git 저장소 유효성 검증
export function isValidGitRepo(repoPath: string): boolean {
  try {
    if (!fs.existsSync(repoPath)) return false
    const gitDir = path.join(repoPath, '.git')
    if (!fs.existsSync(gitDir)) return false
    execGit(repoPath, 'rev-parse --is-inside-work-tree')
    return true
  } catch {
    return false
  }
}

// 저장소 기본 정보 조회
export function getRepoInfo(repoPath: string): GitRepoInfo {
  const currentBranch = execGit(repoPath, 'rev-parse --abbrev-ref HEAD')
  const totalCommitsStr = execGit(repoPath, 'rev-list --count HEAD')
  const lastCommitDate = execGit(repoPath, 'log -1 --format=%aI')

  let remoteUrl: string | undefined
  try {
    remoteUrl = execGit(repoPath, 'remote get-url origin')
  } catch {
    remoteUrl = undefined
  }

  return {
    path: repoPath,
    currentBranch,
    totalCommits: parseInt(totalCommitsStr, 10),
    lastCommitDate,
    remoteUrl
  }
}

// 최근 커밋 조회 (변경 파일 없이)
export function getRecentCommits(repoPath: string, count: number = 20): GitCommit[] {
  // 구분자를 사용하여 한 번의 git log로 모든 커밋 정보를 가져옴
  const separator = '---COMMIT_SEP---'
  const fieldSep = '---FIELD_SEP---'
  const format = `${separator}%H${fieldSep}%h${fieldSep}%s${fieldSep}%an${fieldSep}%aI`

  const output = execGit(repoPath, `log -${count} --format="${format}"`)
  if (!output) return []

  const commits: GitCommit[] = []
  const entries = output.split(separator).filter(e => e.trim())

  for (const entry of entries) {
    const fields = entry.trim().split(fieldSep)
    if (fields.length < 5) continue

    commits.push({
      hash: fields[0],
      shortHash: fields[1],
      message: fields[2],
      author: fields[3],
      date: fields[4]
    })
  }

  return commits
}

// 특정 커밋의 변경 파일 추출
export function getCommitChangedFiles(repoPath: string, commitHash: string): GitChangedFile[] {
  // --numstat으로 추가/삭제 줄 수와 파일명을 가져옴
  const numstatOutput = execGit(repoPath, `diff-tree --no-commit-id -r --numstat ${commitHash}`)
  // --name-status로 변경 상태를 가져옴
  const nameStatusOutput = execGit(repoPath, `diff-tree --no-commit-id -r --name-status ${commitHash}`)

  if (!numstatOutput || !nameStatusOutput) return []

  const numstatLines = numstatOutput.split('\n').filter(l => l.trim())
  const statusLines = nameStatusOutput.split('\n').filter(l => l.trim())

  const files: GitChangedFile[] = []

  for (let i = 0; i < numstatLines.length; i++) {
    const numstatParts = numstatLines[i].split('\t')
    const statusParts = statusLines[i]?.split('\t')

    if (numstatParts.length < 3 || !statusParts) continue

    const additions = numstatParts[0] === '-' ? 0 : parseInt(numstatParts[0], 10)
    const deletions = numstatParts[1] === '-' ? 0 : parseInt(numstatParts[1], 10)
    const filePath = numstatParts[2]

    let status: GitChangedFile['status'] = 'modified'
    const statusChar = statusParts[0]
    if (statusChar === 'A') status = 'added'
    else if (statusChar === 'D') status = 'deleted'
    else if (statusChar.startsWith('R')) status = 'renamed'
    else if (statusChar === 'M') status = 'modified'

    files.push({ path: filePath, status, additions, deletions })
  }

  return files
}

// 커밋 + 변경 파일을 한번에 조회
export function getCommitDetail(repoPath: string, commitHash: string): GitCommit | null {
  const format = '%H%n%h%n%s%n%an%n%aI'
  const output = execGit(repoPath, `log -1 --format="${format}" ${commitHash}`)
  if (!output) return null

  const lines = output.split('\n')
  if (lines.length < 5) return null

  const changedFiles = getCommitChangedFiles(repoPath, commitHash)

  return {
    hash: lines[0],
    shortHash: lines[1],
    message: lines[2],
    author: lines[3],
    date: lines[4],
    changedFiles
  }
}
