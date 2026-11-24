import { log } from './log';
import { createWriterSession, writerOutputSchema } from './writer';
import { checkerAgent } from './checker';
import { reviewerAgent, reviewerOutputSchema, issueLines } from './reviewer';
import { relayAgent } from './utils/stream';
import type { AgentChunk } from './utils/stream';
import { parseAgentOutput } from './utils/parse';
import { CHANGES_DIR, MAX_RETRY_COUNT, PROMOTE_THRESHOLD, SKILL_FILE } from './constant';
import { plannerAgent, plannerOutputSchema } from './planner';
import { promoterAgent, promoterOutputSchema } from './promoter';
import { saveTasks, loadOpenTasks, snapshotTasks, restoreTasks } from './utils/tasks';
import { saveMemory, loadMemory, consumeMemory } from './utils/memory';
import { appendSkillRule } from './utils/skill';
import { isGitRepo } from './utils/git';
import { readFileSync } from 'node:fs';

// 编排层：只管流程——闸门顺序、失败回喂、重试上限；收流/解析在 utils，格式化在各 agent 模块
// 宿主 ask 通道：编排层决策（计划确认/记忆晋升等）向用户提问，返回选项文本或用户自由输入
export type AskFn = (question: string, options: string[]) => Promise<string>

// 不传 ask（如 headless 跑）时自动选第一项，管线照跑不阻塞
const autoFirst: AskFn = (_question, options) => Promise.resolve(options[0] ?? '')

// 记忆晋升闸：素材够阈值时提议提炼——模型出规则草案，人逐条审，
// 采纳的 append 进 SKILL.md（PLUGIN_PATH 指的那份）并让对应素材从 memory.md 毕业
async function* promote(ask: AskFn): AsyncGenerator<string> {
  const lines = loadMemory(100)
  if (lines.length < PROMOTE_THRESHOLD) { return }
  const choice = await ask(`记忆素材已攒 ${lines.length} 条，提炼进 Skill？`, ['采纳', '放弃'])
  if (choice !== '采纳') { return }
  yield '提炼中...\n'
  const material = lines.map((line, i) => `${i + 1}. ${line}`).join('\n')
  const skillText = readFileSync(SKILL_FILE, 'utf8')
  const draftText = yield* relayAgent(promoterAgent(material, skillText))
  const draft = parseAgentOutput(promoterOutputSchema, draftText, 'promoter')
  log('promoterResult', draft)
  if (!draft.success) {
    yield '提炼输出不合格，跳过晋升。\n'
    return
  }
  const consumed: number[] = []
  for (const rule of draft.data.rules) {
    yield `候选规则：${rule.text}\n`
    const take = await ask('采纳这条规则？', ['采纳', '拒绝'])
    if (take === '采纳') {
      appendSkillRule(rule.text)
      consumed.push(...rule.evidence)
      yield '已写入 SKILL.md\n'
    }
  }
  consumeMemory(consumed)
  if (consumed.length > 0) {
    yield `对应素材已毕业（删 ${consumed.length} 行）。\n`
  }
}

export const runPipeline = async function* (userInput: string, ask: AskFn = autoFirst) {
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
    yield '剩余任务：\n' + open.tasks.map((t) => `  - [ ] ${t}\n`).join('');
  } else {
    // 计划确认：先给用户过目再落盘——采纳进循环；放弃整轮终止；输入任意文本 = 补充要求，带意见重新规划
    while (true) {
      const planText = yield* relayAgent(plannerAgent(userInput));
      const plan = parseAgentOutput(plannerOutputSchema, planText, 'planner');
      log('plannerResult', plan);
      if (!plan.success) { break; }
      yield '拟定计划：\n' + plan.data.tasks.map((t) => `  - ${t.description}\n`).join('');
      const choice = await ask('是否采纳该迁移计划？', ['采纳', '修改', '放弃']);
      if (choice === '采纳') {
        const change = saveTasks(plan.data, userInput);
        changeName = change.name;
        tasks = change.tasks;
        break;
      }
      if (choice === '放弃') {
        yield '已放弃本次规划。\n';
        return;
      }
      userInput = `${userInput}\n补充要求：${choice}`;
      yield '按补充要求重新规划...\n';
    }
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
        // 终局顺带跑晋升闸：烧穿攒的顽固陷阱正是提炼的好素材
        yield* promote(ask);
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
        // 终局顺带跑晋升闸：素材够阈值时会提议提炼进 Skill
        yield* promote(ask);
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
