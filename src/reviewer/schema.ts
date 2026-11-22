import { z } from 'zod'
/**
 * reviewer Agent 的输出，最终就是这样一个 JSON：
 * {
 *   "verdict": "fail",
 *   "issues": [
 *     { "file": "Zheng-UI-React/src/components/Button/Button.tsx", "severity": "critical", "description": "丢了 disabled 分支的 props 校验" }
 *   ]
 * }
 */
export const reviewerOutputSchema = z.object({
  verdict: z.enum(['pass', 'fail']),
  issues: z.array(
    z.object({
      file: z.string(),
      severity: z.enum(['critical', 'minor']),
      description: z.string(),
    })
  ),
})
export type ReviewerOutput = z.infer<typeof reviewerOutputSchema>
export type ReviewIssue = ReviewerOutput['issues'][number]
