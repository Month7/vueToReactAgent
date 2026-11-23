// 显式引 React：跨目录 npx 启动时 tsx 按 cwd 找 tsconfig，读不到 react-jsx，
// 会退回 classic 转换（React.createElement），不 import 就报 React is not defined
import React from 'react'
import { render } from 'ink'
import App from './app'

render(<App />)
