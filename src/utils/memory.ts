import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { RUNTIME_DIR } from '../constant'

// 宿主自管记忆（区别于 SDK 的 memory 通道）：reviewer 语义问题的原始素材库
const MEMORY_PATH = `${RUNTIME_DIR}/memory.md`
// 文件端清理：只留最近 100 条（一行一条）；注入端另有 20 条上限，两道闸各管各的
const MAX_LINES = 100

// 记忆库落盘：reviewer 语义问题的原始素材。结局（已修复/烧穿）确定那一刻统一写入，
// 每条自带结局标签——修好的是真问题可修，烧穿的是顽固陷阱，都是可信度信号
export const saveMemory = (issues: string[], outcome: '已修复' | '烧穿') => {
  if (issues.length === 0) { return }
  const date = new Date().toISOString().slice(0, 10)
  const lines = issues.map((issue) => `- [${date}] ${issue}（${outcome}）\n`).join('')
  let all = ''
  if (existsSync(MEMORY_PATH)) { all = readFileSync(MEMORY_PATH, 'utf8') }
  writeFileSync(MEMORY_PATH, (all + lines).split('\n').filter(Boolean).slice(-MAX_LINES).join('\n') + '\n')
}

// writer 首轮注入用：最近 n 条历史记忆（素材不提炼，提炼留给将来的提炼闸）
export const loadMemory = (n = 20): string[] => {
  if (!existsSync(MEMORY_PATH)) { return [] }
  return readFileSync(MEMORY_PATH, 'utf8').split('\n').filter(Boolean).slice(-n)
}

// 晋升毕业：删掉已提炼成 SKILL.md 规则的素材行（行号对应 loadMemory 全量列表的 1 起索引）
export const consumeMemory = (lineNumbers: number[]) => {
  if (lineNumbers.length === 0 || !existsSync(MEMORY_PATH)) { return }
  const lines = readFileSync(MEMORY_PATH, 'utf8').split('\n').filter(Boolean)
  const kept = lines.filter((_line, i) => !lineNumbers.includes(i + 1))
  writeFileSync(MEMORY_PATH, kept.join('\n') + '\n')
}
