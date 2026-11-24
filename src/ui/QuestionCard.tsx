import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Select, TextInput } from '@inkjs/ui'

// 确认卡片：互斥双模式——Select 方向键选/回车提交，TextInput 自由输入（选项之外必须可自定义，SDK 的 AskUserQuestion 也这么要求）。
// 同一时刻只挂一个输入组件，规避两个 useInput 抢键盘；选项里约定俗成的「修改」不提交而是切到自由输入模式。
export function QuestionCard({ question, options, onSubmit }: {
  question: string
  options: string[]
  onSubmit: (answer: string) => void
}) {
  const [mode, setMode] = useState<'select' | 'input'>('select')
  useInput((input, key) => {
    if (key.tab) {
      setMode((prev) => (prev === 'select' ? 'input' : 'select'))
    }
  })

  // 选「修改」不提交，切到自由输入让用户写补充要求；其余选项回车即提交
  const submit = (answer: string) => {
    if (answer === '修改') {
      setMode('input')
      return
    }
    onSubmit(answer)
  }

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} marginBottom={1}>
      <Text bold color="yellow">{question}</Text>
      {mode === 'select' && (
        <Select
          options={options.map((label) => ({ label, value: label }))}
          onChange={(value) => submit(value)}
        />
      )}
      {mode === 'input' && (
        <TextInput
          placeholder="输入补充要求，回车提交"
          onSubmit={(value) => { if (value.trim()) onSubmit(value.trim()) }}
        />
      )}
      <Text dimColor>↵ 确认 · tab 切换输入</Text>
    </Box>
  )
}
