import { appendFileSync, readFileSync } from 'node:fs'
import { SKILL_FILE } from '../constant'

// 晋升规则写入内置 skill：第一次落笔创建「晋升规则」区段，之后逐条追加
const SECTION = '## 晋升规则（从踩坑素材提炼，人审采纳）'
export const appendSkillRule = (rule: string) => {
  let heading = `\n\n${SECTION}\n`
  if (readFileSync(SKILL_FILE, 'utf8').includes(SECTION)) {
    heading = ''
  }
  appendFileSync(SKILL_FILE, `${heading}- ${rule}\n`)
}
