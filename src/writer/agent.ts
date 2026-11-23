import { accessTokenFromEnv, query } from '@qoder-ai/qoder-agent-sdk';
import { prompt } from './prompt';
import { log } from '../log';
import type { AgentChunk } from '../utils/stream';

// 执行型 agent，但对外直播过程：每个工具调用 yield 一条事件，收尾 yield 交付原文
export const writerAgent = async function* (userInput: string, feedback = '', tasks: string[] = []): AsyncGenerator<AgentChunk> {
  const stream = query({
    prompt: prompt(userInput, feedback, tasks),
    options: {
      auth: accessTokenFromEnv(),
      tools: ['Read', 'Grep', 'Glob', 'Write', 'Edit'],
      permissionMode: 'acceptEdits',
      skills: []
    },
  })
  for await (const msg of stream) {
    log('writer', { type: msg.type });
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
    // 收尾：成功 yield 交付 JSON 原文，失败 yield 错误信息；之后流终止
    log('writer 完成', { num_turns: msg.num_turns });
    if (msg.subtype === 'success') {
      yield { kind: 'final', text: msg.result };
      return
    }
    yield { kind: 'final', text: msg.errors.join('\n') };
    return
  }
  yield { kind: 'final', text: '' };
}