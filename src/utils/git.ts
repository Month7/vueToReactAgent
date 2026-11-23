import { execSync } from 'node:child_process'

// 目标目录是否 git 仓库：pipeline 第一步调，提前拦下（fail fast）
export const isGitRepo = (): boolean => {
  try {
    execSync('git rev-parse --is-inside-work-tree')
    return true
  } catch {
    return false
  }
}
