# CasePilot

CasePilot 是一个面向质量工程团队的智能测试设计平台：输入需求文档或设计文档，生成测试点、测试用例、风险项和评审建议，并按不同组织的交付规则导出 Excel 测试用例或 XMind 测试点。

## 当前状态

当前版本是一个可直接打开的前端 MVP，重点验证以下工作流：

- 输入或上传需求文档
- 配置测试重点、测试层级和详细程度
- 模拟生成测试方案
- 查看测试点、测试用例、覆盖率和风险项
- 搜索测试用例
- 导出 Excel 测试用例
- 导出 XMind 测试点，按功能、边界异常和风险分组

当前的生成结果仍由前端模拟数据驱动，文件上传也暂未接入真实解析服务。这样可以先稳定产品交互，再逐步接入不同真实模型和文档解析能力。

## 本地运行

进入项目根目录后执行：

```bash
python3 -m http.server 4173 --directory web
```

然后打开 `http://localhost:4173`。

也可以直接打开 `web/index.html`，但使用本地 HTTP 服务更接近后续接入 API 时的运行方式。

## 项目结构

```text
casepilot/
├── adapters/              # 不同大模型、解析服务和导出服务的适配约定
├── docs/                  # 产品和技术设计文档
├── src/
│   └── domain/            # 测试方案领域数据结构和模型接口
├── web/                   # 当前可运行的前端 MVP
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── .env.example           # 真实模型接入时的配置示例
└── README.md
```

当前有一个本地 mock 适配器示例：`adapters/mock-model.js`。它使用 ES module，便于后续被 Vite 前端或 Node 服务直接引用；独立打开 `web/index.html` 的 MVP 仍保持零构建依赖。

## 真实模型接入方向

平台将生成流程拆成四个可替换阶段：

1. `parseRequirement(document)`：解析 TXT、Markdown、DOCX、PDF 等输入。
2. `analyzeRequirement(parsedDocument, options)`：提取角色、流程、规则、状态、依赖和风险。
3. `generateTestPlan(analysis, options)`：生成测试点、测试用例和追溯信息。
4. `exportTestPlan(plan, format, rules)`：根据单位规则导出 Excel 或 XMind。

不同模型通过统一的适配器接口接入，不让页面直接依赖具体厂商 SDK。后续可以并行接入兼容 OpenAI API 的模型、企业私有模型以及本地模型，并在工作区设置中切换。

## 导出规则

- Excel：面向可执行测试用例评审，建议包含编号、测试点、前置条件、步骤、预期结果、优先级、类型、来源追溯和评审状态。
- XMind：面向测试点评审，根节点为项目或需求，二级节点按测试类别分组，叶子节点保存测试点描述和来源追溯。
- 单位差异通过 `exportTestPlan` 的 `rules` 参数承载，不在页面中写死。例如可以配置列名、分组名称、是否包含风险项以及 XMind 节点层级。

## 下一步建议

优先级建议如下：

1. 增加真实项目数据模型和保存接口。
2. 接入 DOCX、PDF、Markdown 的服务端解析。
3. 建立模型适配器和模型调试面板，支持同一份需求对比多个模型输出。
4. 将当前伪 Excel 导出替换为标准 XLSX 导出，并补充单位模板。
5. 增强 XMind 导出规则和导入校验。
6. 增加测试点到需求原文的可追溯定位与人工编辑能力。

