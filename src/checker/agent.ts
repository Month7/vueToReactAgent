import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import type { WriterOutput } from '../writer'

// checker 的输出：是否全部核对通过 + 逐条问题
export interface CheckerOutput {
  passed: boolean
  problems: string[]
}

// 输入是 writer 的输出（schema 校验已通过），核对 files 清单与磁盘/git 的实际变动是否一致
// 单向迁移语义：源 Vue 项目只读，合法的 git 变动只有新增文件
export const checkerAgent = (writerOutput: WriterOutput): CheckerOutput => {
  const lines = execSync('git status --porcelain', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
  // 全部实际变动（含未跟踪新文件），rename 取箭头后的新路径
  const changed = new Set(lines.map((line) => line.slice(3).trim().split(' -> ').pop() ?? ''))

  const problems: string[] = []
  // 红线：porcelain 前两位是状态码，只有纯新增（??/A）合法；出现 M/D/R 即动了原有文件，源项目只读
  for (const line of lines) {
    if (!line.startsWith('??') && !line.startsWith('A')) {
      problems.push(`红线：动了原有文件 ${line.slice(3).trim()}，源 Vue 项目只读`)  
    }
  }
  // 正向：writer 上报的每条记录逐一核对；单向迁移不存在删除
  for (const file of writerOutput.files) {
    if (file.action === 'deleted') {
      problems.push(`${file.path} 上报 deleted，单向迁移不允许删除文件`)
      continue
    }
    if (!existsSync(file.path)) {
      problems.push(`${file.path} 声称 ${file.action}，但磁盘上不存在`)
      continue
    }
    if (!changed.has(file.path)) {
      problems.push(`${file.path} 存在，但 git 里没有这次变动的记录`)
    }
  }
  // 反向：git 变了但 writer 没上报的文件
  for (const path of changed) {
    if (!writerOutput.files.some((f) => f.path === path)) {
      problems.push(`${path} 实际有变动，但 writer 未上报`)
    }
  }

  return { passed: problems.length === 0, problems }
}
