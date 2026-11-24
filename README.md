# Vue2React Agent

CLI 里输入需求，流水线上的五个 Agent 协作把 Vue 项目**单向迁移**为新的 React 项目。

技术栈：TypeScript + ink（终端 UI）+ @qoder-ai/qoder-agent-sdk。

## 架构

```
你（TUI 输入）
  │
  ▼
planner ──产出任务清单──▶ .vue2react/changes/<变更名>/（proposal.md + tasks.md）
  │                        计划先经你确认（采纳/修改/放弃）
  ▼
writer（流式会话）──交付 JSON（三态：全部/中止/未交付）──┐
  │                                                    │
  ├─▶ checker（纯代码）核对磁盘/git 事实 ◀─────────────┘
  │
  ├─▶ reviewer（模型）语义等价审查
  │
  ├─任一闸门失败 → 问题清单回喂 writer 回炉（同一会话），预算 MAX_RETRY_COUNT 轮
  │
  ├─中止交付（blockedReason）→ 已产出部分照样穿闸验收
  │     → 向你求援：贴补充资料继续，或放弃（已验收的产出保留磁盘）
  │
  └─终局 → 语义问题落 memory.md（带结局标签）
        → 素材满阈值时 promoter 提炼规则草案 → 逐条人审写进 SKILL.md
```

- **planner**：把用户需求拆成任务清单（zod 校验的 JSON）
- **writer**：唯一有写权限的 Agent（Read/Grep/Glob/Write/Edit + acceptEdits），产物全写新目录；流式会话只建一次，回炉是同会话追加消息
- **checker**：不调模型的纯代码验货——用 `git status --porcelain` 和 `existsSync` 核对"说写了 = 真写了"
- **reviewer**：只读工具的语义审查 Agent，对照 Vue 源与 React 产物判断翻译是否正确
- **promoter**：提炼型 Agent，把 memory.md 攒的踩坑素材提炼成翻译规则草案，供人审采纳进 SKILL.md
- **pipeline**：纯编排，只管闸门顺序、失败回喂、重试预算、终局与用户交互；收流/解析在 `utils/`

## 设计思路

**单向迁移**：源 Vue 项目只读，产物全部写进独立的新目录（`-React` 后缀）。checker 的红线规则与之对应：git 合法变动只有新增（`??`/`A` 状态码），出现 `M/D/R` 即违规。

**确定性检查用代码，语义判断用模型**：文件存不存在、有没有真改，是确定性事实，代码核对免费且可靠；Vue→React 翻译对不对，需要理解，才花模型的钱。checker 和 reviewer 的分界线就在"这道检查需不需要理解"。

**契约用 zod 在运行时校验**：Agent 输出是不可信边界上的模型 JSON，`safeParse` 兜形状；进程内代码的输出靠 TypeScript 编译期保证，不再包一层。

**AgentChunk 流协议**：每个 Agent 对外统一吐 `{ kind: 'event' | 'final', text }`——事件直播干活过程（工具调用一行一条），final 是交付原文。pipeline 用 `yield*` 收流转发，TUI 边跑边渲染。

**勾选效力机制**：writer 完成任务会 Edit 打勾，但勾只是自评。"完成"的定义权在闸门：任一闸门失败整轮回滚到快照；中止交付（部分完成）干净过闸的勾保留——有 checker+reviewer 背书。写入权在 writer，验收权在闸门。

**三态交付与失败处理**：writer 交付分三种——全部完成交正常 JSON；查不到依据的外部依赖（如小众库用法）如实交中止交付（files 列已完成部分 + blockedReason 说卡点）；未交付 files 给空数组。中止交付照样穿 checker/reviewer 当场验收已产出部分，然后向用户求援：贴资料救活（不烧回炉预算——信息缺失不是 writer 的错），或放弃（已验收的产出保留磁盘，人工接手）。回炉型失败走循环内修复，烧穿型（预算耗尽）素材标"烧穿"入库。

**跨会话记忆（文件即状态）**：参考 OpenSpec 的哲学但不引入工具本身。`.vue2react/changes/<变更名>/` 一个变更一个目录互不覆盖，proposal.md 存原始需求、tasks.md 是勾选清单；启动时扫到未勾项就跳过 planner 直接续做，全勾 = 收官天然归档。

**记忆库与晋升（踩坑 → 规则）**：reviewer 挑出的语义问题在终局落盘 `.vue2react/memory.md`，一行一条带结局标签（已修复/烧穿）；writer 下个变更首轮注入最近素材，同类坑不重犯。素材攒满 PROMOTE_THRESHOLD 条时，promoter 把素材+现有 SKILL.md 喂给模型提炼规则草案，逐条人审——采纳的写进 plugin 的 SKILL.md，对应素材行"毕业"删除。翻译陷阱清单从真实踩坑中自增长，人审把关每个新规则。

**宿主 ask 通道**：编排层的决策点（计划确认、晋升确认、卡点求援）统一走异步回调：TUI 弹确认卡片（@inkjs/ui），pipeline 里 await 未 resolve 的 Promise 挂起 generator——交互与流式渲染互不干扰；headless 跑时自动选第一项不阻塞。

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

1. **全链路**：输入一个组件迁移需求，看计划确认卡片（采纳/修改/放弃）→ writer 直播落盘 → checker/reviewer 通过
2. **断点恢复**：中途 Ctrl+C 杀掉，再启动——应跳过 planner 直接续做（`changes/` 下有未勾项的变更）
3. **假勾回滚**：盯变更目录的 tasks.md，writer 打勾后若闸门失败，`[x]` 会弹回 `[ ]`
4. **重试闭环**：故意提模糊需求制造审查问题，看问题清单回喂与重试预算消耗
5. **弃权求援**：找一个带小众第三方库的组件，看 writer 交中止交付（blockedReason）→ 已产出部分过闸验收 → 向你求援（贴资料救活或放弃）
6. **记忆与晋升**：跑出几轮回炉后看 `.vue2react/memory.md` 的带标签素材；素材满 8 条后终局弹晋升卡片，人审采纳的规则出现在 SKILL.md 里

### 常用命令

| 命令 | 用途 |
|---|---|
| `npx -y tsx <本项目路径>\src\cli.tsx`（在目标目录里跑） | 拉起 CLI（推荐测试姿势） |
| `npm run dev` | AgentManual 目录内自测（弹日志窗口 + 跑 CLI，cwd 是本仓库） |
| `npm run typecheck` | tsc --noEmit 全量类型检查 |

## 目录结构

```
src/
├── cli.tsx / app.tsx      # ink TUI：输入、流式渲染、确认卡片
├── pipeline.ts            # 编排：闸门顺序、回喂、预算、终局、用户交互
├── constant.ts            # 路径与阈值常量
├── log.ts                 # 落盘日志（TUI 占了 stdout）
├── planner/               # 计划 Agent（schema/prompt/agent/index 四件套）
├── writer/                # 迁移 Agent（唯一可写，流式会话）
├── checker/               # 纯代码落盘核对
├── reviewer/              # 语义审查 Agent（只读）
├── promoter/              # 记忆提炼 Agent（素材 → 规则草案）
├── ui/                    # QuestionCard（@inkjs/ui 确认卡片）
├── utils/
│   ├── stream.ts          # AgentChunk 协议 + relayAgent 收流原语
│   ├── parse.ts           # JSON.parse + zod safeParse
│   ├── tasks.ts           # 变更目录读写 + 勾选快照/恢复
│   ├── memory.ts          # memory.md 素材库（落盘/读取/毕业）
│   ├── skill.ts           # SKILL.md 晋升规则追加
│   └── git.ts              # git 仓库前置检查
└── plugin/                # 内置 skill（vue-to-react 翻译陷阱清单）
```

运行时产物统一在目标项目的 `.vue2react/` 下：`changes/<变更名>/`（跨会话进度）+ `memory.md`（踩坑素材）+ `debug.log`（日志），不污染项目其他位置。

## 已知边界（有意不做的）

- 逐任务验收粒度：部分交付被闸门挑错时整轮撤勾重做，未建立文件到任务的映射
- 烧穿终局留在磁盘的是 writer 自评勾（有意权衡：多轮修复尝试的进度算真实进展）
- reviewer 视野是本轮交付清单，已勾任务的文件不再复审
- 多个未完成变更时默认续做 mtime 最新的，选择策略待做
- SDK 原生 maxTurns 未设置，单轮 writer 理论上可无限跑
