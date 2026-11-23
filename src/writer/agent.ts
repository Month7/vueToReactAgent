import { accessTokenFromEnv, query } from '@qoder-ai/qoder-agent-sdk';
import { prompt } from './prompt';
import { log, debugLog } from '../log';
import { PLUGIN_PATH, PLUGIN_SKILL } from '../constant';
import type { AgentChunk } from '../utils/stream';

// 执行型 agent，但对外直播过程：每个工具调用 yield 一条事件，收尾 yield 交付原文
// tasksPath：当前变更的 tasks.md，writer 打勾用（由 pipeline 传入）
export const writerAgent = async function* (userInput: string, feedback = '', tasks: string[] = [], tasksPath = ''): AsyncGenerator<AgentChunk> {
  const stream = query({
    prompt: prompt(userInput, feedback, tasks, tasksPath),
    options: {
      auth: accessTokenFromEnv(),
      tools: ['Read', 'Grep', 'Glob', 'Write', 'Edit'],
      permissionMode: 'acceptEdits',
      // 内置 skill：plugin 目录由本仓库随行，模型翻译时按需调 Skill 工具取陷阱清单
      plugins: [{ type: 'local', path: PLUGIN_PATH }],
      skills: [PLUGIN_SKILL],
    },
  })
  // 发现链路验证：看 plugin skill 有没有进 CLI 发现清单（文档承认部分 CLI 版本有发现 bug，空了就是没接上）
  log('writer 发现 skills', (await stream.initializationResult()).skills);
  for await (const msg of stream) {
    debugLog('writer', { type: msg.type });
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