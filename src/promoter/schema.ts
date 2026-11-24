import { z } from 'zod'
/**
 * promoter（提炼闸）的输出：
 * { "rules": [ { "text": "迁移 v-model 必须转为受控组件：value + onChange 缺一不可", "evidence": [1, 3] } ] }
 * evidence 是规则依据的素材行号（1 起）——采纳后对应素材行从 memory.md 毕业
 */
export const promoterOutputSchema = z.object({
  rules: z.array(
    z.object({
      text: z.string(),
      evidence: z.array(z.number()),
    })
  ),
})
export type PromoterOutput = z.infer<typeof promoterOutputSchema>
