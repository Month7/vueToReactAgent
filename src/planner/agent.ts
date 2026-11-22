import { accessTokenFromEnv, query } from '@qoder-ai/qoder-agent-sdk';
import { prompt } from './prompt'
import { log } from '../log'

export const planerAgent = async () => {
  const stream = query({
    prompt,
    options: {
      auth: accessTokenFromEnv(),
      tools: ['Read', 'Grep', 'Glob'],
      agent: 'plan'
    },
  });
  for await (const msg of stream) {
    log({ type: msg.type })
    if (msg.type !== 'result') {
      continue
    }
    if (msg.subtype === 'success') {
      log({ subtype: 'success', result: msg.result })
      return msg.result;
    }
    log({ subtype: msg.subtype, errors: msg.errors })
    return msg.errors.join('\n');
  }
}