# CasePilot

CasePilot 是一个面向质量工程团队的智能测试设计平台：输入需求文档或设计文档，由模型读取并结构化文档中的明确事实，再由确定性规则引擎生成测试点和测试用例，最后按不同组织的交付规则导出 Excel 测试用例或 XMind 测试点。

## 当前状态

当前版本是一个由 Node.js 代理服务承载的前端 MVP，重点验证以下工作流：

- 输入或上传需求文档
- 配置测试重点、测试层级和详细程度
- 通过 Node.js 代理调用百炼或其他 OpenAI 兼容模型解析需求文档
- 由独立规则引擎根据可追溯需求事实生成测试点和测试用例
- 查看测试点、测试用例和需求事实映射率
- 搜索测试用例
- 导出 Excel 测试用例
- 导出 XMind 测试点，按功能、边界异常和风险分组

当前保留 `mock` 需求解析模式用于无 Key 联调；百炼及其他 OpenAI 兼容模型只负责需求抽取，不生成测试点或测试用例。文件上传中的 DOCX/PDF 解析服务仍待后续接入。

## 本地运行

首次使用时，复制环境变量文件：

```bash
cp .env.example .env
```

将百炼 API Key 写入 `.env` 的 `MODEL_API_KEY`，然后进入项目根目录执行：

```bash
npm start
```

然后打开 `http://localhost:3001`。

服务会同时提供前端页面和接口：

- `GET /api/health`：查看代理服务和模型配置状态
- `GET /api/models`：查看当前启用的模型
- `POST /api/generate-test-plan`：根据需求生成测试方案

没有 API Key 时，可以把 `.env` 中的 `MODEL_PROVIDER` 改为 `mock`，先验证页面和代理服务链路。

## 合成评测

阶段 3 的评测只使用项目内的合成需求和手写期望事实，不写入真实业务资料。默认运行 Mock Provider：

```bash
npm run evaluate:models
```

配置好百炼或其他 OpenAI 兼容 Provider 后，可以通过 `MODEL_EVAL_PROVIDERS` 选择评测 Provider，例如：

```bash
MODEL_EVAL_PROVIDERS=bailian npm run evaluate:models
```

同一 Provider 下比较多个模型时，使用 `MODEL_EVAL_MODELS` 传入逗号分隔的模型名称。每个模型会运行完全相同的合成评测集，后续仍由同一版本的标准化器和规则引擎处理：

```bash
MODEL_EVAL_PROVIDERS=bailian \
MODEL_EVAL_MODELS=qwen-plus,qwen-turbo,qwen-max \
node scripts/evaluate-models.js
```

报告的 `summary.byProvider` 会分别列出 `bailian:qwen-plus`、`bailian:qwen-turbo` 等模型的指标，便于比较事实抽取质量。模型评测失败时应先修复 Provider 配置或模型响应，不修改规则引擎来迁就模型。

如果百炼账号存在 RPM、并发或免费额度限制，可以先降低评测规模：`MODEL_EVAL_CASE_LIMIT=1` 只跑第一条合成样本，`MODEL_EVAL_DELAY_MS=2000` 在请求之间等待 2 秒。两个参数会写入报告的 `parameters`，便于复现；额度耗尽时需要在百炼控制台处理配额或更换可用模型，单纯增加重试不会解决账号限额。

命令输出 JSON，包含输入版本、Provider、模型名称、提示词版本、参数、原始响应、标准化需求、确定性规则生成的完整 `testPlan`、每个样本的事实质量指标和测试方案质量摘要，并按 Provider 与模型分别汇总。指标覆盖事实召回率、事实准确率、引用精度、规则分类准确率、重复率，以及待确认项和冲突的召回率、准确率。测试方案质量摘要包括测试点/用例数量、草稿和待产品确认数量、规则版本、事实追溯完整性以及用例的前置条件/步骤/预期是否具备可执行结构。不同模型的比较只发生在需求事实标准化结果；后续测试点和用例由同一版本的确定性规则引擎生成，因此可以直接查看每个模型对应的最终测试用例。

评测报告中的 `runs[].testPlan.testPoints` 和 `runs[].testPlan.testCases` 就是最终产出。判断质量时，不要只看事实指标为 1：还要检查测试点是否覆盖关键事实、用例步骤是否可执行、预期是否可观察，以及 `draftCaseCount` 和 `productConfirmationCaseCount` 是否符合预期。`allArtifactsTraceable` 和 `allCasesExecutable` 是结构门槛，不能替代人工验收。

## 项目结构

```text
casepilot/
├── adapters/              # 不同大模型、解析服务和导出服务的适配约定
├── docs/                  # 产品和技术设计文档
├── server/                # Node.js 代理服务和模型 Provider
│   ├── providers/
│   ├── prompt.js
│   └── index.js
├── src/
│   └── domain/            # 版本化需求、测试方案 schema 与模型接口
├── web/                   # 当前可运行的前端 MVP
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── .env.example           # 真实模型接入时的配置示例
└── README.md
```

当前需求解析模型通过 `server/providers/index.js` 统一分发：`mock` 用于本地联调，`bailian` 和 `openai-compatible` 通过 OpenAI 兼容协议调用模型。Provider 只返回符合 `StructuredRequirement` 契约的需求事实；`server/rule-engine.js` 独立生成符合 `TestPlan` 契约的测试点和用例。后续接入非兼容协议时，只需在 Provider 层增加适配器，规则引擎和测试方案 schema 不需要改动。`src/domain/model-contract.js` 是两个版本化契约的 JSDoc 与运行时校验单一来源，服务端通过 `server/schemas.js` 访问。

## 真实模型接入方向

平台将处理流程拆成需求读取、确定性测试设计和交付阶段：

1. 文档解析层：读取 TXT、Markdown 等文本；DOCX、PDF 等格式后续接入。
2. 需求解析模型：从文档中抽取角色、功能、流程和业务规则等明确事实，每项保留可在原文中核验的引用。不同模型的比较聚焦在抽取完整性与准确度。
3. 规则引擎：根据结构化事实和版本化规则生成测试点、测试步骤、预期结果及追溯关系；该阶段不调用模型，同一输入和规则版本应产生相同测试内容。
4. 导出层：根据单位规则导出 Excel 或 XMind。

不同模型通过统一的 Provider 接口接入，不让页面直接依赖具体厂商 SDK。百炼当前使用：

```env
MODEL_PROVIDER=bailian
MODEL_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MODEL_NAME=qwen-plus
MODEL_API_KEY=你的百炼APIKey
```

后续切换其他 OpenAI 兼容模型时，通常只需修改 `MODEL_API_BASE_URL`、`MODEL_NAME` 和 `MODEL_API_KEY`。

## 导出规则

- Excel：面向可执行测试用例评审，建议包含编号、测试点、前置条件、步骤、预期结果、优先级、类型、来源追溯和评审状态。
- XMind：面向测试点评审，根节点为项目或需求，二级节点按测试类别分组，叶子节点保存测试点描述和来源追溯。
- 单位差异通过导出模板与规则配置承载，不在页面中写死。例如可以配置列名、分组名称、是否包含风险项以及 XMind 节点层级。

当前“需求事实映射率”表示已抽取且有原文引用的事实中，映射到规则测试点的比例；它不代表需求文档完整度，也不代表测试覆盖率。模型未抽取到的内容不应被规则引擎自行补写，结果需要通过人工评审持续完善。

项目按阶段推进，阶段目标、交付物、验收条件和变更控制见 [项目阶段大纲](docs/project-roadmap.md)。阶段大纲是后续功能开发和模型调试的执行基线。

## 下一步建议

优先级建议如下：

1. 增加真实项目数据模型和保存接口。
2. 接入 DOCX、PDF、Markdown 的服务端解析。
3. 建立模型适配器和模型调试面板，支持同一份需求对比不同模型抽取出的结构化需求事实。
4. 将当前伪 Excel 导出替换为标准 XLSX 导出，并补充单位模板。
5. 增强 XMind 导出规则和导入校验。
6. 增加测试点到需求原文的可追溯定位与人工编辑能力。

