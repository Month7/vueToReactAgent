import { appendFileSync, mkdirSync } from 'node:fs'
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
// 先 touch 一下：dev 脚本起日志窗口时文件可能还不存在，Get-Content 会直接报错退出
appendFileSync(LOG_PATH, '')

export const log = (...args: unknown[]) => appendFileSync(LOG_PATH, args.map(show).join(' ') + '\n')
