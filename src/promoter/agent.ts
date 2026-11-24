import { accessTokenFromEnv, query } from '@qoder-ai/qoder-agent-sdk';
import { prompt } from './prompt';
import { log, debugLog } from '../log';
import type { AgentChunk } from '../utils/stream';

// 提炼型 agent：素材与现有清单全在 prompt 里，无需工具；收尾 yield 规则草案 JSON 原文
export const promoterAgent = async function* (material: string, skillText: string): AsyncGenerator<AgentChunk> {
  const stream = query({
    prompt: prompt(material, skillText),
    options: { auth: accessTokenFromEnv() },
  })
  for await (const msg of stream) {
    debugLog('promoter', { type: msg.type });
    if (msg.type !== 'result') { continue }
    log('promoter 完成', { num_turns: msg.num_turns });
    if (msg.subtype === 'success') {
      yield { kind: 'final', text: msg.result };
      return
    }
    yield { kind: 'final', text: msg.errors.join('\n') };
    return
  }
  yield { kind: 'final', text: '' };
}
