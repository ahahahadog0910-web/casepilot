import { parseRequirementMock } from './mock.js';
import { parseRequirementWithOpenAICompatible } from './openai-compatible.js';
import { normalizeRequirement } from '../requirement-normalizer.js';

/**
 * Provider 工厂。
 *
 * Provider 的职责严格限定为需求解析。测试点和用例由独立规则引擎生成。
 */
export function createProvider(config) {
  if (config.provider === 'mock') {
    return {
      id: 'mock',
      modelId: 'mock-parser',
      configured: true,
      async parseRequirement({ requirement }) {
        const rawResponse = parseRequirementMock(requirement);
        return {
          requirement: normalizeRequirement(rawResponse, requirement),
          rawResponse,
          modelId: 'mock-parser',
          provider: 'mock'
        };
      }
    };
  }

  if (config.provider === 'bailian' || config.provider === 'openai-compatible') {
    return {
      id: config.provider,
      modelId: config.modelName,
      configured: Boolean(config.apiKey),
      async parseRequirement({ requirement }) {
        return parseRequirementWithOpenAICompatible({ ...config, requirement });
      }
    };
  }

  throw new Error(`不支持的模型 Provider：${config.provider}`);
}
