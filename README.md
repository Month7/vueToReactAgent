# AgentManual

一个多 Agent 编排练手项目：CLI 里输入需求，流水线上的四个 Agent 协作把 Vue 组件库**单向迁移**为新的 React 组件库。

技术栈：TypeScript + ink（终端 UI）+ @qoder-ai/qoder-agent-sdk。

## 架构

```
你（TUI 输入）
  │
  ▼
planner ──产出任务清单──▶ .vue2react/tasks.md（落盘，文件即状态）
  │
  ▼
writer ──交付 JSON（files 清单）──┐
  │                              │
  ├─▶ checker（纯代码）◀──────────┘  核对磁盘/git 事实
  │
  ├─▶ reviewer（模型）              语义等价审查
  │
  └─任一闸门失败 → 问题清单回喂 writer 回炉，预算 MAX_RETRY_COUNT 轮
```

- **planner**：把用户需求拆成任务清单（zod 校验的 JSON）
- **writer**：唯一有写权限的 Agent（Read/Grep/Glob/Write/Edit + acceptEdits），产物全写新目录
- **checker**：不调模型的纯代码验货——用 `git status --porcelain` 和 `existsSync` 核对"说写了 = 真写了"
- **reviewer**：只读工具的语义审查 Agent，对照 Vue 源与 React 产物判断翻译是否正确
- **pipeline**：纯编排，只管闸门顺序、失败回喂、重试预算；收流/解析在 `utils/`

## 设计思路

**单向迁移**：源 Vue 项目只读，产物全部写进独立的新目录（`-React` 后缀）。checker 的红线规则与之对应：git 合法变动只有新增（`??`/`A` 状态码），出现 `M/D/R` 即违规。

**确定性检查用代码，语义判断用模型**：文件存不存在、有没有真改，是确定性事实，代码核对免费且可靠；Vue→React 翻译对不对，需要理解，才花模型的钱。checker 和 reviewer 的分界线就在"这道检查需不需要理解"。

**契约用 zod 在运行时校验**：Agent 输出是不可信边界上的模型 JSON，`safeParse` 兜形状；进程内代码的输出靠 TypeScript 编译期保证，不再包一层。

**AgentChunk 流协议**：每个 Agent 对外统一吐 `{ kind: 'event' | 'final', text }`——事件直播干活过程（工具调用一行一条），final 是交付原文。pipeline 用 `yield*` 收流转发，TUI 边跑边渲染。

**勾选效力机制**：writer 完成任务会 Edit 打勾，但勾只是自评——闸门（checker/reviewer）失败时 pipeline 把 tasks.md 回滚到本轮开始前的快照。写入权在 writer，"完成"的定义权在闸门。

**跨会话记忆（文件即状态）**：参考 OpenSpec 的哲学但不引入工具本身。`.vue2react/tasks.md` 的勾选清单就是断点：启动时读到未勾项就跳过 planner 直接续做；重试预算烧穿后磁盘上留的是真实进度，下次接着修而非从头来。

**重试预算只数回炉**：`MAX_RETRY_COUNT` 数的是 writer 带问题清单重做的次数，checker/reviewer 是"验新货"不算重试。

## 运行与测试

### 前置

```powershell
npm install          # 安装依赖
```

- SDK 鉴权走 `accessTokenFromEnv()`，需在环境变量里配置 token
- **测试目录必须是 git 仓库**（checker 依赖 `git status --porcelain`），没有就 `git init`
- 测试目录 gitignore 建议加一行 `.vue2react/`（或有意入库做计划审计）

### 跑法

在**目标（Vue）项目目录**里，用 npx 直接拉起本 CLI（把 `<本项目路径>` 换成你 clone 到的位置）：

```powershell
# 例：本项目 clone 到 D:\code\agent-manual，目标项目在 D:\code\vue-lib
cd D:\code\vue-lib
npx -y tsx D:\code\agent-manual\src\cli.tsx
```

依赖（ink/SDK）从本项目的 node_modules 解析，进程 cwd 是目标目录——所以 `.vue2react/` 产物和 `git status` 全落在目标项目。

输入需求（如"迁移 Button 组件"），观察 TUI 直播的过程输出。

### 测试方式

在目标目录起 CLI（见跑法），另开一个窗口 tail 日志：

```powershell
Get-Content .vue2react/debug.log -Wait
```

日志里是每个 agent 的消息序列、交付 JSON、各闸门 verdict，排查问题的第一现场。

典型验证场景：

1. **全链路**：输入一个组件迁移需求，看 planner 出的小范围计划 → writer 直播落盘 → checker/reviewer 通过
2. **断点恢复**：中途 Ctrl+C 杀掉，再启动输入同一需求——应跳过 planner 直接续做（`.vue2react/tasks.md` 有未勾项）
3. **假勾回滚**：盯 `.vue2react/tasks.md`，writer 打勾后若闸门失败，`[x]` 会弹回 `[ ]`
4. **重试闭环**：故意提模糊需求制造审查问题，看 feedback 回喂与重试预算消耗

### 常用命令

| 命令 | 用途 |
|---|---|
| `npx -y tsx <本项目路径>\src\cli.tsx`（在目标目录里跑） | 拉起 CLI（推荐测试姿势） |
| `npm run dev` | AgentManual 目录内自测（弹日志窗口 + 跑 CLI，cwd 是本仓库） |
| `npm run typecheck` | tsc --noEmit 全量类型检查 |

## 目录结构

```
src/
├── cli.tsx / app.tsx      # ink TUI：输入、流式渲染
├── pipeline.ts            # 编排：闸门顺序、回喂、预算
├── constant.ts            # RUNTIME_DIR、MAX_RETRY_COUNT
├── log.ts                 # 落盘日志（TUI 占了 stdout）
├── planner/               # 计划 Agent（schema/prompt/agent）
├── writer/                # 迁移 Agent（唯一可写）
├── checker/               # 纯代码落盘核对
├── reviewer/              # 语义审查 Agent（只读）
└── utils/
    ├── stream.ts          # AgentChunk 协议 + relayAgent 收流原语
    ├── parse.ts            # JSON.parse + zod safeParse
    └── tasks.ts            # tasks.md 读写 + 快照/恢复
```

运行时产物统一在目标项目的 `.vue2react/` 下：`tasks.md`（记忆）+ `debug.log`（日志），不污染项目其他位置。

## 已知边界（练手项目，有意不做的）

- 新计划会覆盖旧 tasks.md（单文件单计划）
- 回炉轮 checker 的反向规则会把累计产物算漏报（跨轮状态问题，快照机制是同族方向）
- 回炉时 tasks 变量是进循环时的快照，磁盘撤勾不影响内存清单（语义上正确：闸门没过就该当全未完成）
