import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { CHANGES_DIR } from '../constant'
import type { PlannerOutput } from '../planner'

// 跨会话记忆：按变更分目录（OpenSpec 形态）——每个变更一个目录，新计划不覆盖旧变更；
// 全勾的变更不再入选续做（天然归档）。文件即状态，预算烧穿也不丢
const tasksPath = (name: string) => `${CHANGES_DIR}/${name}/tasks.md`

// 一个进行中的变更：目录名 + 未勾任务 + proposal 存档的原始需求
export interface OpenChange {
  name: string
  tasks: string[]
  input: string
}

// planner 的计划落盘成新变更目录：proposal.md 存原始需求与摘要，tasks.md 是勾选清单
export const saveTasks = (plan: PlannerOutput, userInput: string): OpenChange => {
  const name = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)
  const dir = `${CHANGES_DIR}/${name}`
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/proposal.md`, `# 变更：${plan.summary}\n\n原始需求：${userInput}\n`)
  writeFileSync(tasksPath(name), `# 计划：${plan.summary}\n\n` + plan.tasks.map((t) => `- [ ] ${t.description}\n`).join(''))
  return { name, tasks: plan.tasks.map((t) => t.description), input: userInput }
}

// 读未完成的变更：扫 changes/ 挑有未勾任务且 mtime 最新的（多个未完成时默认续做最近那个）
export const loadOpenTasks = (): OpenChange | null => {
  if (!existsSync(CHANGES_DIR)) {
    return null
  }
  let latest: { name: string; tasks: string[]; input: string; mtime: number } | null = null
  for (const name of readdirSync(CHANGES_DIR)) {
    const path = tasksPath(name)
    if (!existsSync(path)) {
      continue
    }
    const tasks = readFileSync(path, 'utf8').split('\n').filter((l) => l.startsWith('- [ ] ')).map((l) => l.slice('- [ ] '.length))
    if (tasks.length === 0) {
      continue // 全勾 = 已收官的变更，不再入选
    }
    const mtime = statSync(path).mtimeMs
    if (latest && mtime < latest.mtime) {
      continue
    }
    latest = { name, tasks, mtime, input: readInput(name) }
  }
  if (!latest) {
    return null
  }
  return { name: latest.name, tasks: latest.tasks, input: latest.input }
}

// 续做轮的原始需求从 proposal.md 取，不依赖重启后用户敲的那句话
const readInput = (name: string): string => {
  const path = `${CHANGES_DIR}/${name}/proposal.md`
  if (!existsSync(path)) {
    return ''
  }
  const line = readFileSync(path, 'utf8').split('\n').find((l) => l.startsWith('原始需求：'))
  if (line) {
    return line.slice('原始需求：'.length)
  }
  return ''
}

// 快照/恢复（按变更）：回炉轮开始前记下勾选状态，闸门失败就写回——
// writer 打的勾只是自评，闸门说不行就撤，烧穿预算后留在磁盘的才是真实进度
export const snapshotTasks = (name: string): string => {
  if (!existsSync(tasksPath(name))) {
    return ''
  }
  return readFileSync(tasksPath(name), 'utf8')
}

export const restoreTasks = (name: string, snapshot: string) => {
  if (snapshot) {
    writeFileSync(tasksPath(name), snapshot)
  }
}
