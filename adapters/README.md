# 适配器约定

适配器用于隔离具体模型、文档解析库和导出库。模型适配器只读取需求并输出标准化需求，测试点和测试用例始终由规则引擎生成。

## 模型适配器

模型适配器实现需求解析能力，输出必须符合 `src/domain/model-contract.js` 中的 `StructuredRequirement` 契约：

```js
const adapter = {
  id: 'mock',
  name: '模拟模型',
  capabilities: { parseRequirement: true },
  async parseRequirement(document) {}
};
```

模型原始响应先作为候选事实，由标准化器校验原文引用、确定事实粒度并输出固定 schema。Provider、模型 ID、提示词版本和原始响应摘要等实验信息应单独记录，不扩充 `StructuredRequirement` 或让模型参与生成 `TestPlan`。同一标准化需求、规则版本和生成选项必须交给同一规则引擎处理。

## 推荐的适配器类型

- `mock`：本地演示和前端联调。
- `openai-compatible`：接入兼容 OpenAI Chat Completions 或 Responses 协议的服务。
- `private-model`：接入企业内部模型网关。
- `local-model`：接入本地推理服务，用于脱敏数据调试。

## 安全边界

浏览器端不应保存真实模型密钥。生产环境应由后端完成鉴权、限流、审计、敏感信息脱敏和模型调用，前端只调用 CasePilot 自己的服务接口。

