import { readFileSync } from 'node:fs';

const testDesignSkill = readFileSync(
  new URL('../.cursor/skills/casepilot-test-design/SKILL.md', import.meta.url),
  'utf8'
).trim();

export const requirementReaderSystemPrompt = `你是需求文档结构化解析器，不是测试设计器。
你的唯一工作是读取输入文档并抽取其中明确写出的事实，不得设计测试点、测试用例、测试步骤、预期结果、覆盖率或风险建议。

只输出一个合法 JSON 对象，结构如下：
{
  "title": "需求或功能名称",
  "facts": [
    {
      "kind": "feature | rule | workflow_step",
      "statement": "只表达一个原文事实；若同一句含多个独立规则，可分别输出多个候选项",
      "field": "规则涉及的字段、行为或对象",
      "rule_type": "required | forbidden | min | max | range | enum | equality | frequency | transition | permission | general",
      "value": null,
      "minimum": null,
      "maximum": null,
      "values": [],
      "unit": "原文中的单位",
      "from": "状态转换起点",
      "to": "状态转换终点",
      "roles": [],
      "source_quote": "从原文逐字摘录、能够定位该事实的最短引用"
    }
  ]
}

抽取约束：
1. 每个 fact 都必须有 source_quote，且必须逐字来自输入文档；没有依据的内容不要输出。
2. 不补充常识、默认行为、未写明的校验规则或系统设计。遇到无法确定的结构不猜测。
3. 同一句中有多个能独立验证的事实时，可以输出多个 facts；不同事实的引用可重叠，也可引用同一完整句。不要为了迎合特定字段而改写原文。
4. 数值和枚举只填入原文明确给出的值；min/max/range/frequency 的数值放入 value、minimum、maximum，枚举放入 values。
5. 只做语义分类和信息抽取，不根据规则推导边界场景或测试行为。
6. 未发现的字段使用空数组；不得输出 JSON 以外的内容。`;

export function buildRequirementPrompt(requirement) {
  return `${requirementReaderSystemPrompt}\n\nCasePilot 测试设计质量 Skill（仅作为解析边界和质量提醒，不得扩展事实）：\n<casepilot-test-design-skill>\n${testDesignSkill}\n</casepilot-test-design-skill>\n\n待解析需求文档：\n---\n${requirement}\n---`;
}
