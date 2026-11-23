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
 * 内置 skill 的 plugin 目录：跟模块定位而非 cwd（writer 的 cwd 在目标项目，plugin 在本仓库）
 */
export const PLUGIN_PATH = fileURLToPath(new URL('../plugin', import.meta.url));

/**
 * 插件限定名 plugin:skill：SDK 把它编译成 Skill(...) 并入工具白名单，模型按 description 按需调用
 */
export const PLUGIN_SKILL = 'vue2react:vue-to-react-translation-guide';
