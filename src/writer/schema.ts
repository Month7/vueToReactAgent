import { z } from 'zod'

/**
 * writer Agent 的输出，最终就是这样一个 JSON：
 *
 * {
 *   "summary": "把 Button.vue 迁移为 Button.tsx，并更新导出",
 *   "files": [
 *     { "path": "src/components/Button.tsx", "action": "created",  "reason": "新组件入口" },
 *     { "path": "src/components/Button.vue", "action": "deleted",  "reason": "已迁移为 tsx，删除旧文件" },
 *     { "path": "src/components/index.ts",   "action": "modified", "reason": "导出从 .vue 改为 .tsx" }
 *   ]
 * }
 *
 * summary：这次改动做了什么，给用户 / checker 看的一句话
 * files  ：每个被动的文件一条记录，action 三选一
 *   created  = 新增文件
 *   modified = 改动已有文件
 *   deleted  = 删除文件
 * path   ：相对仓库根目录，不要绝对路径
 * reason ：为什么动这个文件，交给 reviewer 判断意图
 */
export const writerOutputSchema = z.object({
  summary: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      action: z.enum(['created', 'modified', 'deleted']),
      reason: z.string(),
    })
  ),
})

export type WriterOutput = z.infer<typeof writerOutputSchema>
export type ChangedFile = WriterOutput['files'][number]
