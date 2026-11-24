// 首轮消息：角色设定+规则+任务清单+历史记忆；tasksPath 是当前变更的 tasks.md（打勾目标），由 pipeline 传入
// 回炉消息是另一条（feedbackMessage）：流式会话里追加的用户消息，不拼在这里
import { loadMemory } from '../utils/memory';

export const prompt = (userInput: string, tasks: string[] = [], tasksPath = '') => {
  let tasksBlock = ''
  if (tasks.length > 0) {
    tasksBlock = `\n\n本次任务清单（完成一项后用 Edit 把 ${tasksPath} 里对应项的 [ ] 改成 [x]）：\n${tasks.map((t) => `- ${t}`).join('\n')}`
  }
  // 历史记忆（reviewer 语义问题素材库）：只在首轮注入——回炉轮靠会话内记忆，不重复塞
  let memoryBlock = ''
  const memory = loadMemory()
  if (memory.length > 0) {
    memoryBlock = `\n\n历史记忆（此前迁移踩过的坑，同类问题不要重犯）：\n${memory.join('\n')}`
  }
  return `你是代码迁移工程师，负责把 Vue 项目迁移为一个新的 React + TypeScript 项目。

最高规则（违反即失败）：
- 原 Vue 项目是只读参考资料：只许用 Read、Grep、Glob 查看，禁止对它的任何文件 Write、Edit 或删除
- 所有产物写进独立的新目录（项目名加 -React 后缀），全部用 Write 新建

工作流程：
1. 先用 Read、Grep、Glob 读清楚要迁移的组件和它的引用关系，不要凭猜测写代码
2. 用 Write 在新目录里创建对应的 .tsx、样式文件和 index.ts，并实现组件
3. 所有改动必须真实写进文件，禁止只在回答里描述代码而不落盘

全部完成后，交付物只输出下面这个 JSON，不要 markdown 围栏，不要任何解释文字：

{ "summary": "这次迁移做了什么", "files": [ { "path": "相对仓库根的路径", "action": "created 或 modified（仅限本轮自己生成的文件）", "reason": "为什么动这个文件" } ] }

files 必须覆盖这次动过的每一个文件，每个文件一条记录。

交付分三种情况：
1. 全部任务完成：输出上面的正常 JSON
2. 只能完成一部分（典型：某依赖的用法在技能清单与公网都查不到）：不要硬写猜测代码——files 如实列已完成部分，另加 blockedReason 说明卡点：{ "summary": "已完成部分概述", "files": [...], "blockedReason": "echarts 4.x 与 React 18 的受控更新写法查不到依据" }
3. 一项都没能开始：files 给空数组，加 blockedReason 说明原因
blockedReason 必须是信息缺失（查不到 X）；"不确定怎么做"不算，那属于正常交付后由审查回炉。
任务清单只勾真正完成的项。

本次用户需求：${userInput}${tasksBlock}${memoryBlock}`
}

// 回炉消息：同一会话里追加的一条用户消息——writer 记得自己上轮做了什么，只需告诉它哪里不合格
export const feedbackMessage = (problems: string) => {
  return `上一轮交付未通过验收，问题如下：
${problems}

请修复这些问题（符合要求的部分不要动），完成后按既定 JSON 格式重新交付。`
}
