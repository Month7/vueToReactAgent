import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'node:fs'
import { RUNTIME_DIR } from './constant'

// 调试日志：ink 占了 stdout，console.log 会撕烂 TUI，所以全部落文件
// 字符串照原样打出（和 console.log 一致），对象/数组转 JSON，其他转 String
const show = (x: unknown) => {
  if (typeof x === 'string') {
    return x
  }
  return String(JSON.stringify(x))
}

// CLI 运行时产物统一住 .vue2react/（appendFileSync 不建目录，先建一次）
mkdirSync(RUNTIME_DIR, { recursive: true })

const LOG_PATH = `${RUNTIME_DIR}/debug.log`
// 启动归档：上次会话的 debug.log 改名封存，本次新开——tail 盯的永远是当前会话，不掺旧内容
const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
if (existsSync(LOG_PATH)) {
  renameSync(LOG_PATH, `${RUNTIME_DIR}/debug-${stamp}.log`)
}
// 归档只留最近 5 份（文件名字典序即时间序）
const archived = readdirSync(RUNTIME_DIR).filter((name) => name.startsWith('debug-')).sort()
while (archived.length > 5) {
  unlinkSync(`${RUNTIME_DIR}/${archived.shift() ?? ''}`)
}
// 先 touch 一下：dev 脚本起日志窗口时文件可能还不存在，Get-Content 会直接报错退出
appendFileSync(LOG_PATH, '')

// 行级时间戳：会话耗时统计的数据源（debugLog 同样带上，归档文件名另有会话起始时间）
const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })
export const log = (...args: unknown[]) => appendFileSync(LOG_PATH, `[${now()}] ${args.map(show).join(' ')}\n`)

// 现象级打点（每消息 type 等时间线素材）：默认静默，排障时 VUE2REACT_DEBUG=1 开启；
// info 级（log）只留结论：闸门判定、num_turns、发现清单——它是日常评测统计的数据源
const VERBOSE = process.env.VUE2REACT_DEBUG === '1'
export const debugLog = (...args: unknown[]) => {
  if (VERBOSE) {
    log(...args)
  }
}
