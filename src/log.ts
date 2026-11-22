import { appendFileSync } from 'node:fs'

// 调试日志：ink 占了 stdout，console.log 会撕烂 TUI，所以全部落文件
// 字符串照原样打出（和 console.log 一致），对象/数组转 JSON，其他转 String
const show = (x: unknown) => {
  if (typeof x === 'string') {
    return x
  }
  return String(JSON.stringify(x))
}

export const log = (...args: unknown[]) => appendFileSync('debug.log', args.map(show).join(' ') + '\n')
