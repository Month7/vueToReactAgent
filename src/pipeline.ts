import { log } from './log';
import { writerAgent, writerOutputSchema } from './writer';
import { checkerAgent } from './checker';
import { reviewerAgent, reviewerOutputSchema } from './reviewer';

// 编排层：writer 的过程事件（工具调用）原样转发给 UI 直播；最终文本留在这里 parse + 校验
export const runPipeline = async function* (userInput: string) {
  // 重试上限：校验失败时整轮重跑（过程事件照样会转播出去）
  let count = 0;
  // 上一轮 checker/reviewer 的失败反馈，回喂给下一轮 writer；空串表示首轮
  let feedback = '';
  while(true) {
    if (count > 3) {
      break;
    }
    let text = '';
    // event 转发 UI；final 是模型交付的最终文本，存下来走校验
    for await (const chunk of writerAgent(userInput, feedback)) {
      if (chunk.kind === 'event') {
        yield chunk.text + '\n';
        continue;
      }
      text = chunk.text;
    }
    log('writer 原始输出', text);
    const json = JSON.parse(text.trim());
    const writerResult = writerOutputSchema.safeParse(json);
    log('writerResult', writerResult);
    if (writerResult.success) {
      // 落盘核对：writer 说改了，checker 拿 git/磁盘验证它没说谎
      const report = checkerAgent(writerResult.data);
      log('checkerResult', report);
      if (report.passed) {
        // 事实过了再过语义：reviewer 对照 Vue 源与 React 产物，判断翻译是否等价
        let reviewText = '';
        for await (const chunk of reviewerAgent(userInput, writerResult.data)) {
          if (chunk.kind === 'event') {
            yield chunk.text + '\n';
            continue;
          }
          reviewText = chunk.text;
        }
        log('reviewer 原始输出', reviewText);
        const review = reviewerOutputSchema.safeParse(JSON.parse(reviewText.trim()));
        log('reviewerResult', review);
        if (review.success && review.data.verdict === 'pass') {
          yield `校验通过：${writerResult.data.summary}\n`;
          return;
        }
        // 语义问题同样回喂 writer 回炉
        if (review.success) {
          yield '语义审查发现问题：\n' + review.data.issues.map((i) => `  - ${i.file}（${i.severity}）：${i.description}\n`).join('');
          feedback = review.data.issues.map((i) => `${i.file}（${i.severity}）：${i.description}`).join('\n');
        } else {
          yield '审查输出不合 schema，回炉...\n';
          feedback = reviewText;
        }
        yield '回炉重修...\n';
        count += 1;
        continue;
      }
      // 闭环修复：问题清单展示给用户后回喂 writer，再来一轮只修问题
      yield '落盘核对发现问题：\n' + report.problems.map((p) => `  - ${p}\n`).join('');
      yield '回炉重修...\n';
      feedback = report.problems.join('\n');
      count += 1;
      continue;
    }
    yield '校验失败，重试中...\n';
    count += 1;
  }
}