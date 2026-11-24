// 提炼闸：素材与现有清单都在 prompt 里，无需任何工具；现有 SKILL.md 全文一并喂入防止提炼出重复规则
export const prompt = (material: string, skillText: string) => `你是规则提炼工程师，从迁移踩坑素材里提炼可复用的翻译规则。

提炼要求：
1. 只提炼有共性的素材（同类问题出现多次，或虽只出现一次但属于确定性的翻译陷阱）
2. 规则写成一条可执行的"正确做法"指令，抽象掉具体组件名
3. 与现有清单已有的规则重复的不要提
4. 没有值得提炼的就返回空 rules 数组，不要硬凑

全部完成后，交付物只输出下面这个 JSON，不要 markdown 围栏，不要任何解释文字：

{ "rules": [ { "text": "迁移 v-model 必须转为受控组件：value + onChange 缺一不可", "evidence": [1, 3] } ] }

evidence 是该规则依据的素材行号（1 起）。

现有翻译陷阱清单（已收录的规则，别重复）：
${skillText}

踩坑素材（带行号）：
${material}`
