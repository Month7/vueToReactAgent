import { z } from 'zod'

/**
 * writer Agent 的输出，三种交付之一：
 *
 * 全部交付：
 * {
 *   "summary": "把 Button.vue 迁移为 Button.tsx，并更新导出",
 *   "files": [
 *     { "path": "src/components/Button.tsx", "action": "created",  "reason": "新组件入口" },
 *     { "path": "src/components/Button.vue", "action": "deleted",  "reason": "已迁移为 tsx，删除旧文件" },
 *     { "path": "src/components/index.ts",   "action": "modified", "reason": "导出从 .vue 改为 .tsx" }
 *   ]
 * }
 *
 * 中止交付（部分/未交付）：查不到依据的外部依赖卡住时如实交代——files 列已完成部分（未交付给空数组），blockedReason 说卡点
 * { "summary": "Button 已完成，ChartPanel 卡住", "files": [...], "blockedReason": "echarts 4.x 与 React 18 的受控更新写法查不到依据" }
 *
 * summary：这次改动做了什么，给用户 / checker 看的一句话
 * files  ：每个被动的文件一条记录，action 三选一
 *   created  = 新增文件
 *   modified = 改动已有文件
 *   deleted  = 删除文件
 * path   ：相对仓库根目录，不要绝对路径
 * reason ：为什么动这个文件，交给 reviewer 判断意图
 */
const fileSchema = z.object({
  path: z.string(),
  action: z.enum(['created', 'modified', 'deleted']),
  reason: z.string(),
})
const deliverySchema = z.object({
  summary: z.string(),
  files: z.array(fileSchema),
})

// 中止交付与全部交付共用 summary/files 形状（多一个 blockedReason）——union 判别靠 blockedReason 存在性
const abortSchema = z.object({
  summary: z.string(),
  files: z.array(fileSchema),
  blockedReason: z.string(),
})

export const writerOutputSchema = z.union([abortSchema, deliverySchema])

export type WriterOutput = z.infer<typeof deliverySchema>
export type ChangedFile = WriterOutput['files'][number]
