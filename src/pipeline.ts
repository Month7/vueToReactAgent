import { log } from './log';
import { writerAgent, writerOutputSchema } from './writer';
import { checkerAgent } from './checker';
import { reviewerAgent, reviewerOutputSchema, issueLines } from './reviewer';
import { relayAgent } from './utils/stream';
import { parseAgentOutput } from './utils/parse';
import { MAX_RETRY_COUNT } from './constant';
import { plannerAgent, plannerOutputSchema } from './planner';
import { saveTasks, loadOpenTasks, snapshotTasks, restoreTasks } from './utils/tasks';
import { isGitRepo } from './utils/git';

// 编排层：只管流程——闸门顺序、失败回喂、重试上限；收流/解析在 utils，格式化在各 agent 模块
export const runPipeline = async function* (userInput: string) {
  // 回炉预算：writer 带问题清单重做的次数，成功不消耗；闸门验新货不算重试
  let retries = 1;
  // 上一轮 checker/reviewer 的失败反馈，回喂给下一轮 writer；空串表示首轮
  let feedback = '';

  // 前置检查放最前面：不是 git 仓库就立刻退出，不要等 writer 干完活才在 checker 那里炸
  if (!isGitRepo()) {
    yield '目标目录不是 git 仓库：先 git init + 建基线提交（git add -A、git commit），再重跑\n';
    return;
  }

  // 跨会话记忆：磁盘上有未勾完的任务就续做（断点恢复），没有才跑 planner 出新计划落盘
  let tasks = loadOpenTasks();
  if (tasks.length === 0) {
    const planText = yield* relayAgent(plannerAgent(userInput));
    const plan = parseAgentOutput(plannerOutputSchema, planText, 'planner');
    log('plannerResult', plan);
    if (plan.success) {
      saveTasks(plan.data);
      tasks = plan.data.tasks.map((t) => t.description);
    }
  } else {
    // 显式标志：让"复用了上次进度"直接说出口，日志与 TUI 一眼可辨（否则只能靠 planner 打点缺席反推）
    log('记忆恢复', tasks);
    yield `检测到 ${tasks.length} 项未完成任务，跳过 planner，断点续做\n`;
  }
  if (tasks.length > 0) {
    yield '任务清单：\n' + tasks.map((t) => `  - [ ] ${t}\n`).join('');
  }
  // 进循环前快照勾选状态：writer 的勾只是自评，闸门失败就恢复，烧穿后留在磁盘的才是真实进度
  const tasksSnapshot = snapshotTasks();

  while (true) {
    if (retries > MAX_RETRY_COUNT) {
      yield '重试预算已用完，放弃。\n';
      break;
    }

    // 第一道闸：writer 干活（事件直播），交付文本过形状校验
    const text = yield* relayAgent(writerAgent(userInput, feedback, tasks));
    const writerResult = parseAgentOutput(writerOutputSchema, text, 'writer');
    log('writerResult', writerResult);
    if (!writerResult.success) {
      yield '校验失败，重试中...\n';
      restoreTasks(tasksSnapshot);
      retries += 1;
      continue;
    }

    // 第二道闸：checker 拿 git/磁盘核对落盘事实
    const report = checkerAgent(writerResult.data);
    log('checkerResult', report);
    if (!report.passed) {
      yield '落盘核对发现问题：\n' + report.problems.map((p) => `  - ${p}\n`).join('');
      yield '回炉重修...\n';
      feedback = report.problems.join('\n');
      restoreTasks(tasksSnapshot);
      retries += 1;
      continue;
    }

    // 第三道闸：reviewer 对照 Vue 源与 React 产物审语义
    const reviewText = yield* relayAgent(reviewerAgent(userInput, writerResult.data));
    const review = parseAgentOutput(reviewerOutputSchema, reviewText, 'reviewer');
    log('reviewerResult', review);
    if (review.success && review.data.verdict === 'pass') {
      yield `校验通过：${writerResult.data.summary}\n`;
      return;
    }
    let problems: string[] = [];
    if (review.success) {
      problems = issueLines(review.data.issues);
      yield '语义审查发现问题：\n' + problems.map((p) => `  - ${p}\n`).join('');
    } else {
      yield '审查输出不合 schema，回炉...\n';
      problems = [reviewText];
    }
    yield '回炉重修...\n';
    feedback = problems.join('\n');
    restoreTasks(tasksSnapshot);
    retries += 1;
  }
}
