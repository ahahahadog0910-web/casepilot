# 适配器约定

适配器用于隔离具体模型、文档解析库和导出库。页面层只依赖统一的输入输出，不直接调用厂商 SDK。

## 模型适配器

建议每个模型适配器实现以下能力：

```js
const adapter = {
  id: 'mock',
  name: '模拟模型',
  capabilities: {
    parseRequirement: true,
    generateTestPlan: true,
    stream: false
  },
  async parseRequirement(document, options) {},
  async analyzeRequirement(parsedDocument, options) {},
  async generateTestPlan(analysis, options) {}
};
```

适配器返回的数据应符合 `src/domain/model-contract.js` 中的结构。每次生成建议保留 `modelId`、`promptVersion`、`createdAt` 和原始响应摘要，方便后续做模型对比和问题定位。

## 推荐的适配器类型

- `mock`：本地演示和前端联调。
- `openai-compatible`：接入兼容 OpenAI Chat Completions 或 Responses 协议的服务。
- `private-model`：接入企业内部模型网关。
- `local-model`：接入本地推理服务，用于脱敏数据调试。

## 安全边界

浏览器端不应保存真实模型密钥。生产环境应由后端完成鉴权、限流、审计、敏感信息脱敏和模型调用，前端只调用 CasePilot 自己的服务接口。

