import { z } from 'zod'
/**
 * planner Agent 的输出，最终就是这样一个 JSON：
 * {
 *   "summary": "把 Button 组件单向迁移成 React 项目的一个模块",
 *   "tasks": [
 *     { "description": "迁移 Button.tsx 本体与样式" },
 *     { "description": "创建 index.ts 统一导出" }
 *   ]
 * }
 */
export const plannerOutputSchema = z.object({
  summary: z.string(),
  tasks: z.array(
    z.object({
      description: z.string(),
    })
  ),
})
export type PlannerOutput = z.infer<typeof plannerOutputSchema>
