import { accessTokenFromEnv, query } from '@qoder-ai/qoder-agent-sdk';
import { prompt } from './prompt';
import { log, debugLog } from '../log';
import { PLUGIN_PATH, PLUGIN_SKILL } from '../constant';
import type { WriterOutput } from '../writer';
import type { AgentChunk } from '../utils/stream';

// 审查型 agent：读 Vue 源与 React 产物对照，判断翻译语义是否等价；只读不写
export const reviewerAgent = async function* (userInput: string, writerOutput: WriterOutput): AsyncGenerator<AgentChunk> {
  const stream = query({
    prompt: prompt(userInput, writerOutput),
    options: {
      auth: accessTokenFromEnv(),
      tools: ['Read', 'Grep', 'Glob'],
      // 单一事实源：与 writer 共用同一份翻译陷阱清单
      plugins: [{ type: 'local', path: PLUGIN_PATH }],
      skills: [PLUGIN_SKILL],
    },
  })
  for await (const msg of stream) {
    debugLog('reviewer', { type: msg.type });
    if (msg.type === 'assistant') {
      // 过程直播：这一轮模型要调的工具，一个 tool_use 一行
      for (const block of msg.message.content) {
        if (block.type === 'tool_use') {
          const input = block.input as Record<string, unknown>;
          // skill 命中是评测埋点（info 级）；其余工具调用只在 TUI 直播，不进日志
          if (block.name === 'Skill') {
            log('skill 命中', String(input.name ?? ''));
          }
          yield { kind: 'event', text: `${block.name}(${String(input.file_path ?? input.pattern ?? '')})` };
        }
      }
    }
    if (msg.type !== 'result') {
      continue
    }
    // 收尾：成功 yield 审查 JSON 原文，失败 yield 错误信息；之后流终止
    log('reviewer 完成', { num_turns: msg.num_turns });
    if (msg.subtype === 'success') {
      yield { kind: 'final', text: msg.result };
      return
    }
    yield { kind: 'final', text: msg.errors.join('\n') };
    return
  }
  yield { kind: 'final', text: '' };
}
