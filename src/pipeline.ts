import { log } from './log';
import { writerAgent, writerOutputSchema } from './writer';
import { checkerAgent } from './checker';
import { reviewerAgent, reviewerOutputSchema, issueLines } from './reviewer';
import { relayAgent } from './utils/stream';
import { parseAgentOutput } from './utils/parse';

// 编排层：只管流程——闸门顺序、失败回喂、重试上限；收流/解析在 utils，格式化在各 agent 模块
export const runPipeline = async function* (userInput: string) {
  // 重试上限：任一闸门失败整轮重跑（过程事件照样转播出去）
  let count = 0;
  // 上一轮 checker/reviewer 的失败反馈，回喂给下一轮 writer；空串表示首轮
  let feedback = '';
  while (true) {
    if (count > 3) {
      break;
    }

    // 第一道闸：writer 干活（事件直播），交付文本过形状校验
    const text = yield* relayAgent(writerAgent(userInput, feedback));
    const writerResult = parseAgentOutput(writerOutputSchema, text, 'writer');
    log('writerResult', writerResult);
    if (!writerResult.success) {
      yield '校验失败，重试中...\n';
      count += 1;
      continue;
    }

    // 第二道闸：checker 拿 git/磁盘核对落盘事实
    const report = checkerAgent(writerResult.data);
    log('checkerResult', report);
    if (!report.passed) {
      yield '落盘核对发现问题：\n' + report.problems.map((p) => `  - ${p}\n`).join('');
      yield '回炉重修...\n';
      feedback = report.problems.join('\n');
      count += 1;
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
    count += 1;
  }
}
