---
name: vue-to-react-translation-guide
description: 收录 Vue→React 迁移的高频翻译陷阱与语义对等审查要点，覆盖指令层、响应式层、组合层、样式层、路由状态层。用于将 Vue 组件翻译为 React 时的对照参照、审查 React 产物是否与原 Vue 语义一致时的检查清单，或挂载到迁移相关子代理的 skills 配置中。
---

# Vue→React 翻译陷阱清单

单一事实源：迁移（writer 翻译时参照）、审查（reviewer 核验时对照）、人工检查共用本清单。

## 使用方式

- **翻译阶段**：逐条对照"易错翻法"，确保翻译不落入陷阱
- **审查阶段**：以"Vue 写法 / 正确翻法"为基准，核对产物是否语义对等
- **挂载方式**：在子代理 frontmatter 中加 `skills: [vue-to-react-translation-guide]`；不可编辑的 agent（如内置 CodeReview）则在派发 prompt 中给出本文件路径

## 〇、分类法（trap_type）

submit_report 的 `failed_items` 建议带 `trap_type`（可选），格式 `分类.陷阱`，用于跨任务教训的聚合与注入。分类与本清单小节一一对应：

| category | 对应小节 | 示例 |
|---|---|---|
| directive | 一、指令层 | directive.v-model.missing-onchange |
| reactivity | 二、响应式层 | reactivity.deep-watch |
| composition | 三、组合层 | composition.slot.lost |
| style | 四、样式层 | style.scoped-lost |
| routing | 五、路由与状态层 | routing.store-getters |

分类不影响审查结论；不确定时可省略，系统会按描述关键词回退归类。

## 一、指令层（模板 → JSX）

| 陷阱 | Vue 写法 | 易错翻法 | 正确翻法 / 审查要点 |
|---|---|---|---|
| v-if 分支丢失 | v-if / v-else-if / v-else | 只翻主分支，else 没写 | 三元或条件渲染链，每个分支都要有 JSX 对应 |
| v-for 缺 key | v-for + :key="item.id" | map 不带 key / 动态列表用 index 当 key | key=item.id；动态增删列表禁止 index key |
| v-model 单向化 | v-model="value" | 只写 value={value} 漏 onChange | value + onChange 受控组件；.trim/.number 修饰符手动处理 |
| 自定义组件 v-model | 组件上 v-model | 漏 props 或漏回调 | 受控 props + onXxx 回调成对出现 |
| v-show 变 v-if | v-show="visible" | 条件渲染导致状态销毁 | style={{ display: visible ? undefined : 'none' }} |
| 事件修饰符丢失 | @click.stop.prevent | onClick 不带 stop/prevent | e.stopPropagation() / e.preventDefault() |
| v-html | v-html="html" | 当 children 直接放字符串（显示成文本） | dangerouslySetInnerHTML={{ __html: html }}，注意 XSS |
| 自定义指令被静默丢弃 | v-focus / v-permission 等 | 翻译时直接忽略 | 用 ref+useEffect、权限包装组件等替代，并在报告中说明 |

## 二、响应式层（data/computed/watch → Hooks）

| 陷阱 | Vue 写法 | 易错翻法 | 正确翻法 / 审查要点 |
|---|---|---|---|
| 对象直接改引用 | this.form.name = x | 直接改 state 对象 | setForm(prev => ({ ...prev, name: x })) |
| computed 依赖漏项 | computed 引用 a、b | useMemo 空依赖或漏写 | 依赖数组完整列出所引用的响应式值 |
| watch 无依赖死循环 | watch(source, cb) | useEffect 无依赖数组，每次渲染都执行 | useEffect + 正确依赖数组；immediate 语义用首次执行处理 |
| deep watch 语义丢失 | watch(obj, cb, { deep: true }) | 依赖写 [obj] 但内部字段变化不触发 | 依赖到具体字段，或用不可变更新保证 obj 引用变化 |
| 忘记 cleanup | unmounted 里 clearInterval | useEffect 无 return 清理 | useEffect 返回清理函数；定时器、监听、订阅必须清理 |
| ref 模板引用断链 | this.$refs.el | useRef 声明了但 JSX 上没绑 ref | `<div ref={myRef}>`；组件句柄用 forwardRef + useImperativeHandle |
| 陈旧闭包 | watch 回调读取最新值 | 定时器/回调闭包读到旧 state | 依赖数组，或用 ref 镜像保存最新值 |
| nextTick 缺失 | this.$nextTick(fn) | 同步操作未渲染的 DOM | 在 useEffect 中处理，或按场景用 setTimeout/flushSync |

## 三、组合层（组件通信）

| 陷阱 | Vue 写法 | 易错翻法 | 正确翻法 / 审查要点 |
|---|---|---|---|
| emit 无回音 | this.$emit('change', v) | 翻译后没有对应回调 prop | props.onChange?.()；每个 emit 事件都要有回调出口 |
| 默认插槽丢失 | `<slot>` | 丢弃或写死内容 | children |
| 具名/作用域插槽 | `<slot :item="item">` | 丢弃或静态化 | 具名 → props 传 ReactNode；作用域 → 函数 children / render props |
| provide/inject 断链 | provide('k', v) / inject('k') | 只写 useContext，没有 Provider | createContext + Provider 包裹 + useContext |
| mixins 被遗忘 | Vue 2 mixins | 整个 mixins 逻辑消失 | 逐项合并进 hooks 或组件体 |
| KeepAlive 语义丢失 | `<KeepAlive>` | 条件渲染直接销毁 | 状态保留需状态提升或缓存组件，报告中说明取舍 |
| 动态组件 | `<component :is="c">` | 丢弃 | 组件映射表 + 条件渲染 |

## 四、样式层

| 陷阱 | Vue 写法 | 易错翻法 | 正确翻法 / 审查要点 |
|---|---|---|---|
| scoped 失效 | `<style scoped>` | 直接普通 css，类名冲突 | CSS Modules（styles.xxx）或目标工程既有隔离方案 |
| 深度选择器失效 | ::v-deep / :deep() | 保留原语法（无效） | :global() |
| 动态 class | :class="{ active: x }" | 拼接错误或丢失条件 | clsx 或模板字符串，条件类名逐个核对 |
| 内联 style 绑定 | :style="{ color: c }" | 基本同构，注意数值单位 | style={{ color: c }}，单位与 Vue 实现保持一致 |

## 五、路由与状态层

| 陷阱 | Vue 写法 | 易错翻法 | 正确翻法 / 审查要点 |
|---|---|---|---|
| 路由路径变化 | path: '/user/:id' | 翻译时改路径或参数名 | 路径与参数名保持一致，useParams 取值 |
| 路由守卫丢失 | beforeEach | 直接删除 | 包装组件或 loader 中实现，报告说明取舍 |
| query 读取错误 | $route.query | 用 params 读 | useSearchParams |
| store 派生逻辑丢失 | Pinia/Vuex getters | 直接暴露 state | 派生值用函数或 useMemo 实现 |
| action 异步竞态 | action async | 组件层无 loading/竞态处理 | hooks 封装 loading 与竞态控制 |

## 六、审查固定动作（每轮 review 必做）

1. **对照完整性**：每个 Vue 文件都有对应 React 产物；每个模板指令都找到 JSX 侧对应物
2. **语义对等**：交互行为、文案、边界情况（loading/error/empty）与原实现一致
3. **静默丢弃扫描**：自定义指令、mixins、filters（Vue 2）、KeepAlive、全局事件总线
4. **副作用清理**：定时器/监听/订阅/请求取消都有清理与竞态处理
5. **不擅自改动**：业务逻辑与文案与源实现完全一致；发现的"优化点"只记录，不在迁移中顺手改

## 报告约定

审查发现按固定格式输出：`文件 | Vue 源位置 | 陷阱类型 | 问题描述 | 建议修复方向`。只报告与语义对等相关的问题，不输出纯风格偏好类建议。
