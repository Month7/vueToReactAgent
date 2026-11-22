import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import { useState } from 'react'
import { loopAgent } from './agent'
import { runPipeline } from './pipeline'
// 界面消息，纯展示用；不参与发给 agent 的上下文
interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function App() {
  // 全部对话记录，只用于渲染，不会回传给 agent（每轮都是全新会话）
  const [messages, setMessages] = useState<Message[]>([])
  // 输入框内容；每敲一个字符更新一次，不触发 agent
  const [input, setInput] = useState('')
  // 是否有 agent 调用在进行中；用于上锁，防止并发调用
  const [busy, setBusy] = useState(false)

  // 把流式输出的一个 chunk 拼到最后一条 assistant 消息上（改写而非新增）
  const append = (chunk: string) => {
    setMessages((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last) next[next.length - 1] = { ...last, content: last.content + chunk }
      return next
    })
  }

  // 回车提交：起一轮新的 agent 会话，边收边渲染
  const send = async (text: string) => {
    const message = text.trim()
    // 空输入忽略；上一轮还在输出时，本次回车直接丢弃（不排队）
    if (!message || busy) return
    setInput('')
    // 插入提问 + 一条空的 assistant 占位，占位就是后面流式输出的落点
    setMessages((prev) => [...prev, { role: 'user', content: message }, { role: 'assistant', content: '' }])
    setBusy(true)
    try {
      // pipeline 是 async generator：过程（工具调用）与结果边跑边吐，逐块追加形成实时画面
      for await (const chunk of runPipeline(message)) {
        append(chunk)
      }
    } catch (err) {
      // agent 抛错也当文本追加，方便直接在界面上看到
      append(`\n出错了：${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box flexDirection="column">
      {/* 历史消息：role 决定前缀文案与颜色 */}
      {messages.map((m, i) => (
        <Box key={i} marginBottom={1}>
          <Text color={m.role === 'user' ? 'cyan' : 'green'}>{m.role === 'user' ? '你' : 'Agent'}: </Text>
          <Text>{m.content || '…'}</Text>
        </Box>
      ))}
      {/* 输入区：busy 时显示等待提示并取消焦点 */}
      <Box>
        <Text color="cyan">{busy ? '… ' : '> '}</Text>
        <TextInput value={input} onChange={setInput} onSubmit={(value) => void send(value)} focus={!busy} />
      </Box>
    </Box>
  )
}
