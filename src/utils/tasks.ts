import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { RUNTIME_DIR } from '../constant'
import type { PlannerOutput } from '../planner'

// 跨会话记忆：计划的持久化。文件即状态——tasks.md 里的勾选就是断点，预算烧穿也不丢
const TASKS_PATH = `${RUNTIME_DIR}/tasks.md`

// planner 的计划落盘成勾选清单；writer 完成一项，用 Edit 把对应项的 [ ] 改成 [x]
export const saveTasks = (plan: PlannerOutput) => {
  mkdirSync(RUNTIME_DIR, { recursive: true })
  writeFileSync(TASKS_PATH, `# 计划：${plan.summary}\n\n` + plan.tasks.map((t) => `- [ ] ${t.description}\n`).join(''))
}

// 读未完成的任务；文件不存在返回空数组（首轮）
export const loadOpenTasks = (): string[] => {
  if (!existsSync(TASKS_PATH)) {
    return []
  }
  return readFileSync(TASKS_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('- [ ] '))
    .map((line) => line.slice('- [ ] '.length))
}

// 快照/恢复：回炉轮开始前记下勾选状态，闸门失败就写回——
// writer 打的勾只是自评，闸门说不行就撤，烧穿预算后留在磁盘的才是真实进度
export const snapshotTasks = (): string => {
  if (!existsSync(TASKS_PATH)) {
    return ''
  }
  return readFileSync(TASKS_PATH, 'utf8')
}

export const restoreTasks = (snapshot: string) => {
  if (snapshot) {
    writeFileSync(TASKS_PATH, snapshot)
  }
}
