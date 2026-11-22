import { accessTokenFromEnv, query } from '@qoder-ai/qoder-agent-sdk';
import { planerAgent } from './planner/agent';

async function* textOnly(stream: AsyncIterable<any>) {
  for await (const msg of stream) {
    if (msg.type !== 'assistant') continue
    for (const block of msg.message.content) {
      if (block.type === 'text') yield block.text
    }
  }
}

/** Agent 逻辑入口：TUI 消费这个 async iterable，逐块追加到界面 */
export async function loopAgent() {
  // // const stream = query({
  // //   prompt,
  // //   options: {
  // //     auth: accessTokenFromEnv(),
  // //   },
  // // })
  // // return textOnly(stream)
  // const result = await planerAgent();
  // return result;
}
