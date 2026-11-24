import { fileURLToPath } from 'node:url'

/**
 * writer 的回炉预算：带问题清单重做的次数上限（不含首轮）
 */
export const MAX_RETRY_COUNT = 3;

/**
 * CLI 运行时产物目录（tasks.md 记忆、debug.log 日志）：目标项目 gitignore 这一行即可收编
 */
export const RUNTIME_DIR = '.vue2react';

/**
 * 跨会话记忆按变更分目录（OpenSpec 形态）：changes/<变更名>/proposal.md + tasks.md，新计划不覆盖旧变更
 */
export const CHANGES_DIR = `${RUNTIME_DIR}/changes`;

/**
 * 内置 skill 的 plugin 目录：跟模块定位而非 cwd（writer 的 cwd 在目标项目，plugin 在本仓库）
 */
export const PLUGIN_PATH = fileURLToPath(new URL('../plugin', import.meta.url));

/**
 * 插件限定名 plugin:skill：SDK 把它编译成 Skill(...) 并入工具白名单，模型按 description 按需调用
 */
export const PLUGIN_SKILL = 'vue2react:vue-to-react-translation-guide';

/**
 * 记忆晋升阈值：memory.md 素材条数达到后，变更终局时提议提炼进 Skill
 */
export const PROMOTE_THRESHOLD = 8;

/**
 * 内置 SKILL.md 文件路径：晋升的规则 append 到这里（将来分发时 PLUGIN_PATH 改为用户副本优先，此处零改动）
 */
export const SKILL_FILE = `${PLUGIN_PATH}/skills/vue-to-react-translation-guide/SKILL.md`;
