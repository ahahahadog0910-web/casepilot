import { normalizeRequirement } from '../server/requirement-normalizer.js';
import { parseRequirementMock } from '../server/providers/mock.js';

/** 本地 mock 需求解析适配器；测试方案由规则引擎生成。 */
export const mockModelAdapter = {
  id: 'mock',
  name: '本地模拟模型',
  capabilities: {
    parseRequirement: true
  },

  async parseRequirement(document) {
    const content = String(document?.content ?? '').trim();
    if (!content) throw new Error('需求文档内容不能为空');
    return normalizeRequirement(parseRequirementMock(content), content);
  }
};

