import { log } from './log';
import { createWriterSession, writerOutputSchema } from './writer';
import { checkerAgent } from './checker';
import { reviewerAgent, reviewerOutputSchema, issueLines } from './reviewer';
import { relayAgent } from './utils/stream';
import type { AgentChunk } from './utils/stream';
import { parseAgentOutput } from './utils/parse';
import { CHANGES_DIR, MAX_RETRY_COUNT } from './constant';
import { plannerAgent, plannerOutputSchema } from './planner';
import { saveTasks, loadOpenTasks, snapshotTasks, restoreTasks } from './utils/tasks';
import { saveMemory } from './utils/memory';
import { isGitRepo } from './utils/git';

// 编排层：只管流程——闸门顺序、失败回喂、重试上限；收流/解析在 utils，格式化在各 agent 模块
export const runPipeline = async function* (userInput: string) {
  // 回炉预算：writer 带问题清单重做的次数，成功不消耗；闸门验新货不算重试
  let retries = 1;

  // 前置检查放最前面：不是 git 仓库就立刻退出，不要等 writer 干完活才在 checker 那里炸
  if (!isGitRepo()) {
    yield '目标目录不是 git 仓库：先 git init + 建基线提交（git add -A、git commit），再重跑\n';
    return;
  }

  // 跨会话记忆（按变更分目录）：有未完成的变更就续做最近那个，没有才跑 planner 落盘一个新变更
  let changeName = '';
  let tasks: string[] = [];
  const open = loadOpenTasks();
  if (open) {
    // 显式标志：让"复用了上次进度"直接说出口（变更名 + 剩余项数）
    log('记忆恢复', open);
    changeName = open.name;
    if (open.input) {
      // 续做轮的需求用 proposal 存档的原始输入，不依赖重启后用户敲的那句话
      userInput = open.input;
    }
    tasks = open.tasks;
    yield `检测到未完成的变更 ${open.name}（剩 ${open.tasks.length} 项），跳过 planner，断点续做\n`;
  } else {
    const planText = yield* relayAgent(plannerAgent(userInput));
    const plan = parseAgentOutput(plannerOutputSchema, planText, 'planner');
    log('plannerResult', plan);
    if (plan.success) {
      const change = saveTasks(plan.data, userInput);
      changeName = change.name;
      tasks = change.tasks;
    }
  }
  if (tasks.length > 0) {
    yield '任务清单：\n' + tasks.map((t) => `  - [ ] ${t}\n`).join('');
  }
  // 进循环前快照当前变更的勾选状态：writer 的勾只是自评，闸门失败就恢复，烧穿后留在磁盘的才是真实进度
  const tasksSnapshot = snapshotTasks(changeName);

  // writer 会话只建一次：流式回炉在同一会话追加消息，writer 保留上轮上下文（读过什么、写过什么），不靠 feedback 文本重建记忆
  const writer = createWriterSession(userInput, tasks, `${CHANGES_DIR}/${changeName}/tasks.md`);
  // 每轮进 writer 的消息：首轮是完整任务 prompt，任一闸门失败后换成该闸的问题清单
  let round: () => AsyncGenerator<AgentChunk> = writer.run;

  // 记忆库暂存：reviewer 挑出的语义问题先存内存，结局（通过=已修复 / 烧穿）确定那一刻统一落盘——每条自带结局标签
  let pendingMemory: string[] = [];

  // try/finally 兜住所有出口（通过 return / 烧穿 break）：流式会话不会自己结束，不显式 close 的话 CLI 子进程拖着进程不让退
  try {
    while (true) {
      if (retries > MAX_RETRY_COUNT) {
        log('烧穿', { retries });
        // 烧穿 = 修到放弃的问题，最该记的顽固陷阱
        saveMemory(pendingMemory, '烧穿');
        yield '重试预算已用完，放弃。\n';
        break;
      }

      // 第一道闸：writer 干活（事件直播），交付文本过形状校验
      const text = yield* relayAgent(round());
      const writerResult = parseAgentOutput(writerOutputSchema, text, 'writer');
      log('writerResult', writerResult);
      if (!writerResult.success) {
        log('回炉', { 闸门: 'writer schema', retries });
        yield '校验失败，重试中...\n';
        restoreTasks(changeName, tasksSnapshot);
        round = () => writer.refine('你上一轮的最终输出不是合法的交付 JSON。请检查格式（不要 markdown 围栏、不要解释文字），按既定格式重新交付。');
        retries += 1;
        continue;
      }

      // 第二道闸：checker 拿 git/磁盘核对落盘事实
      const report = checkerAgent(writerResult.data);
      log('checkerResult', report);
      if (!report.passed) {
        log('回炉', { 闸门: 'checker', retries });
        yield '落盘核对发现问题：\n' + report.problems.map((p) => `  - ${p}\n`).join('');
        yield '回炉重修...\n';
        restoreTasks(changeName, tasksSnapshot);
        round = () => writer.refine(report.problems.join('\n'));
        retries += 1;
        continue;
      }

      // 第三道闸：reviewer 对照 Vue 源与 React 产物审语义
      const reviewText = yield* relayAgent(reviewerAgent(userInput, writerResult.data));
      const review = parseAgentOutput(reviewerOutputSchema, reviewText, 'reviewer');
      log('reviewerResult', review);
      if (review.success && review.data.verdict === 'pass') {
        // 本轮通过 = 此前 reviewer 挑过的问题已修好，记忆入库
        saveMemory(pendingMemory, '已修复');
        yield `校验通过：${writerResult.data.summary}\n`;
        return;
      }
      let problems: string[] = [];
      if (review.success) {
        problems = issueLines(review.data.issues);
        // 语义问题入记忆暂存（schema 失败不是语义问题，不记）
        pendingMemory.push(...problems);
        yield '语义审查发现问题：\n' + problems.map((p) => `  - ${p}\n`).join('');
      } else {
        yield '审查输出不合 schema，回炉...\n';
        problems = [reviewText];
      }
      yield '回炉重修...\n';
      log('回炉', { 闸门: 'reviewer', retries });
      restoreTasks(changeName, tasksSnapshot);
      round = () => writer.refine(problems.join('\n'));
      retries += 1;
    }
  } finally {
    await writer.close();
  }
}
