import { z } from 'zod'
import { log } from '../log'

// 模型交付的文本 → 校验结果：原文日志 + JSON.parse + safeParse 一件套
export const parseAgentOutput = <T>(schema: z.ZodType<T>, text: string, label: string) => {
  log(`${label} 原始输出`, text)
  return schema.safeParse(JSON.parse(text.trim()))
}
