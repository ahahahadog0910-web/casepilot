import { buildRequirementPrompt } from '../prompt.js';
import { normalizeRequirement } from '../requirement-normalizer.js';

function extractContent(message) {
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) return message.content.map((part) => part?.text || '').join('');
  return '';
}

export async function parseRequirementWithOpenAICompatible({ apiBaseUrl, apiKey, modelName, timeoutMs, provider, requirement }) {
  if (!apiKey) throw new Error('未配置模型 API Key，请在 .env 中填写 MODEL_API_KEY');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelName,
        temperature: 0,
        messages: [
          { role: 'system', content: '你是一个严格遵循抽取边界的需求文档解析服务。' },
          { role: 'user', content: buildRequirementPrompt(requirement) }
        ]
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
      throw new Error(`模型需求解析失败：${providerMessage}`);
    }
    const content = extractContent(payload?.choices?.[0]?.message);
    if (!content) throw new Error('模型需求解析返回为空');
    return {
      requirement: normalizeRequirement(content, requirement),
      modelId: modelName,
      provider: provider || 'openai-compatible'
    };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`模型需求解析超时（${timeoutMs}ms）`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
