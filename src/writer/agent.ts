import { accessTokenFromEnv, query } from '@qoder-ai/qoder-agent-sdk';
import type { SDKMessage, SDKUserMessage } from '@qoder-ai/qoder-agent-sdk';
import { prompt, feedbackMessage } from './prompt';
import { log, debugLog } from '../log';
import { PLUGIN_PATH, PLUGIN_SKILL } from '../constant';
import type { AgentChunk } from '../utils/stream';

export interface WriterSession {
  // 首轮：完整任务 prompt（角色设定+规则+任务清单）
  run: () => AsyncGenerator<AgentChunk>;
  // 回炉轮：只追加问题清单——其余上下文（读过什么、写过什么、踩过什么坑）会话里都在
  refine: (problems: string) => AsyncGenerator<AgentChunk>;
  // 流式会话不会自己结束，管道收尾必须显式关闭，否则 CLI 子进程拖着不退
  close: () => Promise<void>;
}

// writer 会话（流式回炉）：query 只建一次、输入输出都是流——回炉是同一会话里追加一条用户消息，
// writer 保留上轮全部上下文，不靠 feedback 文本重建记忆；冷启动只剩跨进程重启的续做一次
export const createWriterSession = (userInput: string, tasks: string[], tasksPath: string): WriterSession => {
  // 输入侧：pipeline push 消息文本，query 的输入流从这里取（SDK 流式输入的标准写法）
  const inbox: string[] = [];
  // 等待者的唤醒回调存在数组槽里：闭包变量直接 if 后调用会被 TS 收窄成 never，数组不窄化
  const inputWakers: Array<() => void> = [];
  const push = (text: string) => {
    inbox.push(text);
    for (const wake of inputWakers.splice(0)) { wake(); }
  };
  async function* input(): AsyncIterable<SDKUserMessage> {
    while (true) {
      while (inbox.length > 0) {
        yield { type: 'user', message: { role: 'user', content: inbox.shift() ?? '' }, parent_tool_use_id: null };
      }
      await new Promise<void>((resolve) => { inputWakers.push(resolve); });
    }
  }

  const stream = query({
    prompt: input(),
    options: {
      auth: accessTokenFromEnv(),
      tools: ['Read', 'Grep', 'Glob', 'Write', 'Edit'],
      permissionMode: 'acceptEdits',
      // 内置 skill：plugin 目录由本仓库随行，模型翻译时按需调 Skill 工具取陷阱清单
      plugins: [{ type: 'local', path: PLUGIN_PATH }],
      skills: [PLUGIN_SKILL],
    },
  });

  // 发现链路验证：看 plugin skill 有没有进 CLI 发现清单（文档承认部分 CLI 版本有发现 bug，空了就是没接上）
  stream.initializationResult().then((init) => log('writer 发现 skills', init.skills));

  // 输出侧：后台泵持续消费整条消息流——中途不能退出（for await 一旦结束就终结 generator，
  // 会话就废了）；消息攒进缓冲，round() 按游标从缓冲里读到本轮 result 为止
  const output: SDKMessage[] = [];
  // 读者（round）的唤醒回调存数组槽里，同上避免闭包窄化
  const readerWakers: Array<() => void> = [];
  void (async () => {
    try {
      for await (const msg of stream) {
        debugLog('writer', { type: msg.type });
        output.push(msg);
        for (const wake of readerWakers.splice(0)) { wake(); }
      }
    } catch {
      // 泵挂在流上等下一条消息是常态；异常（含 close 时的流终止）吞掉，由轮循环的空 result 兜底
    }
  })();

  // 一轮的产出：泵攒到新消息就处理一条直到本轮 result；游标跨轮推进，下一轮从 result 之后接着读
  let cursor = 0;
  async function* round(): AsyncGenerator<AgentChunk> {
    while (true) {
      if (cursor >= output.length) {
        await new Promise<void>((resolve) => { readerWakers.push(resolve); });
        continue;
      }
      const msg = output[cursor];
      cursor += 1;
      if (msg.type === 'assistant') {
        // 过程直播：这一轮模型要调的工具，一个 tool_use 一行
        for (const block of msg.message.content) {
          if (block.type === 'tool_use') {
            const blockInput = block.input as Record<string, unknown>;
            // skill 命中是评测埋点（info 级）；其余工具调用只在 TUI 直播，不进日志
            if (block.name === 'Skill') {
              log('skill 命中', String(blockInput.name ?? ''));
            }
            yield { kind: 'event', text: `${block.name}(${String(blockInput.file_path ?? blockInput.pattern ?? '')})` };
          }
        }
      }
      if (msg.type !== 'result') {
        continue;
      }
      // 本轮收尾：成功 yield 交付 JSON 原文，失败 yield 错误文本；游标留在 result 之后
      log('writer 完成', { num_turns: msg.num_turns });
      if (msg.subtype === 'success') {
        yield { kind: 'final', text: msg.result };
        return
      }
      yield { kind: 'final', text: msg.errors.join('\n') };
      return
    }
  }

  const run = async function* (): AsyncGenerator<AgentChunk> {
    push(prompt(userInput, tasks, tasksPath));
    yield* round();
  };
  const refine = async function* (problems: string): AsyncGenerator<AgentChunk> {
    push(feedbackMessage(problems));
    yield* round();
  };

  return { run, refine, close: () => stream.close() };
};
