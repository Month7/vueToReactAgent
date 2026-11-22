// AgentChunk：所有 agent 对外吐的流协议——event 是过程（工具调用），final 是交付原文
export type AgentChunk = { kind: 'event'; text: string } | { kind: 'final'; text: string }

// 收流原语：过程事件原样转发出去（yield），最终文本作为返回值（用 yield* 消费能拿到）
export async function* relayAgent(gen: AsyncGenerator<AgentChunk>) {
  let final = ''
  for await (const chunk of gen) {
    if (chunk.kind === 'event') {
      yield chunk.text + '\n'
    } else {
      final = chunk.text
    }
  }
  return final
}
