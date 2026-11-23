import { accessTokenFromEnv, query } from '@qoder-ai/qoder-agent-sdk';
import { prompt } from './prompt';
import { log, debugLog } from '../log';
import type { AgentChunk } from '../utils/stream';

// 规划型 agent：读工作目录拆任务（事件直播），收尾 yield 计划 JSON 原文；只读不写
export const plannerAgent = async function* (userInput: string): AsyncGenerator<AgentChunk> {
  const stream = query({
    prompt: prompt(userInput),
    options: {
      auth: accessTokenFromEnv(),
      tools: ['Read', 'Grep', 'Glob'],
      agent: 'plan'
    },
  })
  for await (const msg of stream) {
    debugLog('planner', { type: msg.type });
    if (msg.type === 'assistant') {
      // 过程直播：这一轮模型要调的工具，一个 tool_use 一行
      for (const block of msg.message.content) {
        if (block.type === 'tool_use') {
          const input = block.input as Record<string, unknown>;
          yield { kind: 'event', text: `${block.name}(${String(input.file_path ?? input.pattern ?? '')})` };
        }
      }
    }
    if (msg.type !== 'result') {
      continue
    }
    // 收尾：成功 yield 计划 JSON 原文，失败 yield 错误信息；之后流终止
    log('planner 完成', { num_turns: msg.num_turns });
    if (msg.subtype === 'success') {
      yield { kind: 'final', text: msg.result };
      return
    }
    yield { kind: 'final', text: msg.errors.join('\n') };
    return
  }
  yield { kind: 'final', text: '' };
}
