import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { mockModelAdapter } from '../adapters/mock-model.js';
import { normalizeRequirement } from '../server/requirement-normalizer.js';
import { generateTestPlan, RULE_ENGINE_VERSION } from '../server/rule-engine.js';
import { buildRequirementPrompt } from '../server/prompt.js';
import { createProvider } from '../server/providers/index.js';
import { parseRequirementWithOpenAICompatible } from '../server/providers/openai-compatible.js';
import {
  STRUCTURED_REQUIREMENT_SCHEMA_VERSION,
  TEST_PLAN_SCHEMA_VERSION,
  assertStructuredRequirement,
  assertTestPlan
} from '../server/schemas.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('normalizer anchors facts in source and derives canonical kind and rule type', () => {
  const source = '# 账户\n手机号必须填写。\n';
  const requirement = normalizeRequirement({
    title: '账户',
    facts: [
      { kind: 'feature', statement: '手机号登录', rule_type: 'general', source_quote: '手机号必须填写。' },
      { kind: 'rule', statement: '外部支付', rule_type: 'required', source_quote: '文档没有这句话' }
    ]
  }, source);

  assert.equal(requirement.facts.length, 1);
  assert.equal(requirement.facts[0].kind, 'rule');
  assert.equal(requirement.facts[0].rule_type, 'required');
  assert.deepEqual(requirement.facts[0].trace, {
    documentId: null, section: '账户', quote: '手机号必须填写。', startOffset: source.indexOf('手机号'), endOffset: source.indexOf('手机号') + '手机号必须填写。'.length
  });
});

test('normalizer rejects a response with no traceable facts', () => {
  assert.throws(
    () => normalizeRequirement({ facts: [{ statement: '凭空添加的功能', source_quote: '不存在' }] }, '只有原文'),
    /未能提取到可追溯的需求事实/
  );
});

test('document titles, headings, and background prose never become requirement facts', () => {
  const source = [
    '# 合成项目说明',
    '## 背景',
    '为改善体验，本次计划建设新的能力。',
    '## 功能需求',
    '- 系统展示处理结果。'
  ].join('\n');
  const requirement = normalizeRequirement({
    facts: [{ source_quote: source }]
  }, source);

  assert.deepEqual(requirement.facts.map(({ statement }) => statement), ['系统展示处理结果。']);
  assert.equal(source.slice(requirement.facts[0].trace.startOffset, requirement.facts[0].trace.endOffset), '系统展示处理结果。');
});

test('unconfirmed statements stay outside facts and are surfaced for tester clarification', () => {
  const source = '# 生成策略\n有效记录不少于 3 条时生成摘要；门槛为 3 条（待定）。';
  const requirement = normalizeRequirement({ facts: [{ source_quote: source.split('\n')[1] }] }, source);

  assert.equal(requirement.facts.length, 0);
  assert.equal(requirement.openQuestions.length, 1);
  assert.match(requirement.openQuestions[0].statement, /不少于 3 条/);
  assert.match(requirement.openQuestions[0].question, /特殊逻辑.*前置条件/);
  assert.equal(source.slice(requirement.openQuestions[0].trace.startOffset, requirement.openQuestions[0].trace.endOffset), requirement.openQuestions[0].trace.quote);
  assert.deepEqual(generateTestPlan(requirement).testPoints, []);
  assert.deepEqual(generateTestPlan(requirement).testCases, []);
});

test('incompatible numeric bounds become explicit conflicts and mark related test artifacts', () => {
  const source = '# 密码规则\n密码长度至少 12 位，最多 8 位。';
  const requirement = normalizeRequirement({ facts: [{ source_quote: '密码长度至少 12 位，最多 8 位。' }] }, source);
  const plan = generateTestPlan(requirement);

  assert.equal(requirement.facts.length, 2);
  assert.equal(requirement.conflicts.length, 1);
  assert.deepEqual(requirement.conflicts[0].fact_ids, requirement.facts.map(({ id }) => id));
  assert.equal(requirement.conflicts[0].traces.length, 2);
  assert.equal(plan.testPoints.length, 2);
  assert.equal(plan.testCases.length, 1);
  assert.ok(plan.testPoints.every((point) => point.needsProductConfirmation && point.conflict_ids.includes(requirement.conflicts[0].id)));
  assert.ok(plan.testCases.every((testCase) => testCase.needsProductConfirmation && testCase.status === 'draft'));
  assert.ok(plan.testCases.every((testCase) => testCase.expectedResults.every((result) => !/(?:通过|不通过)/.test(result))));
  assert.ok(plan.testCases.every((testCase) => testCase.conflict_ids.includes(requirement.conflicts[0].id)));
});

test('compatible bounds remain ordinary unmarked test points', () => {
  const source = '密码长度至少 8 位，最多 20 位。';
  const requirement = normalizeRequirement({ facts: [{ source_quote: source }] }, source);
  const plan = generateTestPlan(requirement);

  assert.deepEqual(requirement.conflicts, []);
  assert.ok(plan.testPoints.every((point) => point.needsProductConfirmation === false && point.conflict_ids.length === 0));
  assert.ok(plan.testCases.every((testCase) => testCase.needsProductConfirmation === false && testCase.conflict_ids.length === 0));
});

test('versioned schema contracts have exact keys, fixed enums, and reject drift', () => {
  const source = '# 登录\n手机号必须填写。';
  const requirement = normalizeRequirement({ facts: [{ source_quote: '手机号必须填写。' }] }, source);
  assert.equal(requirement.schemaVersion, STRUCTURED_REQUIREMENT_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(requirement).sort(), ['conflicts', 'facts', 'openQuestions', 'schemaVersion', 'title']);
  assert.deepEqual(Object.keys(requirement.facts[0]).sort(), [
    'field', 'from', 'id', 'kind', 'maximum', 'minimum', 'roles', 'rule_type', 'statement', 'trace', 'traces', 'unit', 'value', 'values', 'to'
  ].sort());
  assert.deepEqual(requirement.openQuestions, []);
  assert.deepEqual(requirement.conflicts, []);
  assert.deepEqual(Object.keys(requirement.facts[0].trace).sort(), ['documentId', 'endOffset', 'quote', 'section', 'startOffset']);
  assertStructuredRequirement(requirement);
  assert.throws(() => assertStructuredRequirement({ ...requirement, unexpected: true }), /契约校验失败/);
  assert.throws(() => assertStructuredRequirement({ ...requirement, schemaVersion: '2.0.0' }), /schemaVersion/);
  assert.throws(() => assertStructuredRequirement({
    ...requirement, facts: [{ ...requirement.facts[0], rule_type: 'model-specific-label' }]
  }), /rule_type/);
});

test('different model fact granularity and rule labels normalize to the same atomic facts', () => {
  const source = '# 输入校验\r\n手机号必须填写，且长度至少 8 位。';
  const wholeSentence = normalizeRequirement({ facts: [
    { kind: 'feature', rule_type: 'general', source_quote: '手机号必须填写，且长度至少 8 位。' }
  ] }, source);
  const severalCandidates = normalizeRequirement({ facts: [
    { kind: 'rule', rule_type: 'forbidden', source_quote: '手机号必须填写' },
    { kind: 'feature', rule_type: 'permission', source_quote: '长度至少 8 位' },
    { kind: 'rule', rule_type: 'max', source_quote: '手机号必须填写，且长度至少 8 位。' }
  ] }, source);

  assert.deepEqual(wholeSentence.facts, severalCandidates.facts);
  assert.deepEqual(wholeSentence.facts.map(({ kind, rule_type, statement }) => ({ kind, rule_type, statement })), [
    { kind: 'rule', rule_type: 'required', statement: '手机号必须填写' },
    { kind: 'rule', rule_type: 'min', statement: '长度至少 8 位。' }
  ]);
  assert.equal(wholeSentence.facts[1].trace.startOffset, source.indexOf('长度至少'));
  assert.equal(source.slice(wholeSentence.facts[1].trace.startOffset, wholeSentence.facts[1].trace.endOffset), wholeSentence.facts[1].statement);
  const firstPlan = generateTestPlan(wholeSentence);
  const secondPlan = generateTestPlan(severalCandidates);
  assert.deepEqual(
    { testPoints: firstPlan.testPoints, testCases: firstPlan.testCases, options: firstPlan.options },
    { testPoints: secondPlan.testPoints, testCases: secondPlan.testCases, options: secondPlan.options }
  );
});

test('normalizer deduplicates repeated facts while retaining every source trace', () => {
  const source = '邮箱必填。\n邮箱必填。';
  const requirement = normalizeRequirement({ facts: [{ source_quote: '邮箱必填。' }] }, source);
  assert.equal(requirement.facts.length, 1);
  assert.equal(requirement.facts[0].traces.length, 2);
  assert.deepEqual(requirement.facts[0].traces.map(({ startOffset }) => startOffset), [0, 6]);
});

test('normalizer carries a shared field into minimal clauses and extracts numeric rule values', () => {
  const source = '密码长度至少 8 位，最多 20 位。';
  const requirement = normalizeRequirement({ facts: [{ source_quote: source }] }, source);
  assert.deepEqual(requirement.facts.map(({ field, rule_type, value, minimum, maximum }) => ({ field, rule_type, value, minimum, maximum })), [
    { field: '密码长度', rule_type: 'min', value: 8, minimum: 8, maximum: null },
    { field: '密码长度', rule_type: 'max', value: 20, minimum: null, maximum: 20 }
  ]);
});

test('normalizer derives enum, transition and permission facts from source text', () => {
  const source = '状态只能为待处理、已完成或已取消。\n订单状态从待支付变为已支付。\n只有管理员和审核员可以访问后台。';
  const requirement = normalizeRequirement({ facts: source.split('\n').map((quote) => ({ source_quote: quote })) }, source);
  assert.deepEqual(requirement.facts.map(({ rule_type }) => rule_type), ['enum', 'transition', 'permission']);
  assert.deepEqual(requirement.facts[0].values, ['待处理', '已完成', '已取消']);
  assert.deepEqual({ from: requirement.facts[1].from, to: requirement.facts[1].to }, { from: '待支付', to: '已支付' });
  assert.deepEqual(requirement.facts[2].roles, ['管理员', '审核员']);
});

test('requirement prompt limits the model to extraction, not test design', () => {
  const prompt = buildRequirementPrompt('登录必须使用手机号');
  assert.match(prompt, /需求文档结构化解析器/);
  assert.match(prompt, /不得设计测试点、测试用例/);
  assert.match(prompt, /source_quote/);
  assert.match(prompt, /多个 facts/);
  assert.match(prompt, /登录必须使用手机号/);
});

test('runtime requirement prompt loads the project Skill without allowing suggestions to become facts', () => {
  const syntheticInput = '字段值应保持一致。';
  const prompt = buildRequirementPrompt(syntheticInput);
  assert.match(prompt, /CasePilot 测试设计质量 Skill/);
  assert.match(prompt, /name: casepilot-test-design/);
  assert.match(prompt, /openQuestions/);
  assert.match(prompt, /不扩展隐性风险检查清单/);
  assert.match(prompt, /只有经产品确认的业务行为才能进入确定性规则/);
  assert.match(prompt, /字段值应保持一致/);
});

test('rule engine creates boundary cases from structured facts without model output', () => {
  const source = '# 金额规则\n金额必须在 10 至 20 元之间';
  const requirement = normalizeRequirement({ facts: [{ source_quote: '金额必须在 10 至 20 元之间' }] }, source);

  const first = generateTestPlan(requirement, { detailLevel: 'standard' }, { provider: 'mock', modelId: 'mock-parser' });
  const second = generateTestPlan(requirement, { detailLevel: 'standard' }, { provider: 'another', modelId: 'another-model' });
  assert.deepEqual(first.testCases.map(({ title, steps, expectedResults, trace }) => ({ title, steps, expectedResults, trace })),
    second.testCases.map(({ title, steps, expectedResults, trace }) => ({ title, steps, expectedResults, trace })));
  assert.deepEqual(first.testCases.map((item) => item.title), [
    '金额低于范围下界', '金额位于范围下界', '金额位于范围上界', '金额超过范围上界'
  ]);
  assert.equal(first.testPoints[0].trace.quote, requirement.facts[0].trace.quote);
  assert.ok(first.testCases.every((item) => item.trace.quote === requirement.facts[0].trace.quote));
  assert.equal(first.generationMethod, 'deterministic-rules');
  assert.equal(first.ruleVersion, RULE_ENGINE_VERSION);
  assert.equal(first.schemaVersion, TEST_PLAN_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(first).sort(), [
    'conflicts', 'coverage', 'coverageDefinition', 'createdAt', 'generationMethod', 'id', 'insights', 'modelId', 'openQuestions', 'options',
    'provider', 'ruleVersion', 'schemaVersion', 'testCases', 'testPoints', 'title'
  ]);
  assert.deepEqual(Object.keys(first.testPoints[0]).sort(), ['conflict_ids', 'description', 'fact_ids', 'id', 'needsProductConfirmation', 'priority', 'rule_version', 'title', 'trace', 'type']);
  assert.deepEqual(Object.keys(first.testCases[0]).sort(), [
    'conflict_ids', 'expectedResults', 'fact_ids', 'id', 'needsProductConfirmation', 'preconditions', 'priority', 'rule_version', 'status', 'steps', 'testPointId', 'title', 'trace', 'type'
  ]);
  assert.deepEqual(Object.keys(first.options).sort(), ['detailLevel', 'focusAreas', 'testLevel']);
  assert.deepEqual(first.options, { focusAreas: ['functional', 'boundary'], detailLevel: 'standard', testLevel: 'system' });
  assertTestPlan(first);
  assert.throws(() => assertTestPlan({ ...first, testCases: first.testCases.map((testCase) => ({ ...testCase, type: 'unknown' })) }), /testCases\[0\].type/);
  assert.throws(() => assertTestPlan({
    ...first,
    testPoints: first.testPoints.map((point) => ({ ...point, fact_ids: [] }))
  }), /testPoints\[0\].fact_ids/);
  assert.throws(() => assertTestPlan({
    ...first,
    testCases: first.testCases.map((testCase) => ({ ...testCase, rule_version: '0.0.0' }))
  }), /testCases\[0\].rule_version/);
});

test('mock provider extracts only text anchored in the source', async () => {
  const requirement = '## 账户规则\n手机号必须填写。\n短信服务可重试。';
  const result = await createProvider({ provider: 'mock' }).parseRequirement({ requirement });
  const allFacts = result.requirement.facts;
  assert.ok(allFacts.length > 0);
  assert.ok(allFacts.every((item) => requirement.includes(item.trace.quote)));
  assert.equal(result.provider, 'mock');
});

test('domain mock adapter returns the frozen requirement contract and does not generate plans', async () => {
  const requirement = await mockModelAdapter.parseRequirement({
    id: 'requirement-1',
    name: '登录需求',
    content: '手机号必须填写。'
  });

  assertStructuredRequirement(requirement);
  assert.deepEqual(mockModelAdapter.capabilities, { parseRequirement: true });
  assert.equal('generateTestPlan' in mockModelAdapter, false);
});

test('OpenAI-compatible provider sends extraction prompt and normalizes the response', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: '登录',
        facts: [{ kind: 'feature', statement: '手机号登录', source_quote: '用户可使用手机号登录。' }]
      }) } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await parseRequirementWithOpenAICompatible({
    apiBaseUrl: 'https://model.example/v1', apiKey: 'test-key', modelName: 'test-model',
    timeoutMs: 1000, provider: 'bailian', requirement: '用户可使用手机号登录。'
  });

  assert.equal(request.url, 'https://model.example/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(request.body.temperature, 0);
  assert.match(request.body.messages[1].content, /不得设计测试点/);
  assert.equal(result.requirement.facts[0].trace.quote, '用户可使用手机号登录。');
  assert.equal(result.provider, 'bailian');
});

test('OpenAI-compatible provider fails clearly when API key is missing', async () => {
  await assert.rejects(
    parseRequirementWithOpenAICompatible({ apiBaseUrl: 'https://model.example/v1', apiKey: '', modelName: 'x', timeoutMs: 1000, requirement: '需求' }),
    /未配置模型 API Key/
  );
});

test('mock HTTP flow exposes parser configuration and rule-generated plans', async (t) => {
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port: availablePort } = probe.address();
      probe.close((error) => error ? reject(error) : resolve(availablePort));
    });
  });
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), MODEL_PROVIDER: 'mock' },
    stdio: 'ignore'
  });
  t.after(() => child.kill('SIGTERM'));
  child.once('error', (error) => t.fail(error));

  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const health = await fetch(`${baseUrl}/api/health`);
      if (health.ok) { ready = true; break; }
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(ready, true, 'server should start in mock mode');

  const health = await (await fetch(`${baseUrl}/api/health`)).json();
  assert.equal(health.generation, 'deterministic-rules');
  assert.equal(health.provider, 'mock');

  const response = await fetch(`${baseUrl}/api/generate-test-plan`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requirement: '# 登录\n## 业务规则\n验证码必须填写。' })
  });
  assert.equal(response.status, 200);
  const plan = await response.json();
  assert.equal(plan.generationMethod, 'deterministic-rules');
  assert.ok(plan.testCases.length > 0);
  assert.ok(plan.testPoints.length > 0);
  assert.ok(plan.testCases.every((item) => item.trace?.quote));
  assert.ok(plan.testPoints.every((point) => point.fact_ids.length > 0));
  assert.ok(plan.testPoints.every((point) => point.rule_version === plan.ruleVersion));
  assert.ok(plan.testCases.every((testCase) => testCase.fact_ids.length > 0));
  assert.ok(plan.testCases.every((testCase) => testCase.rule_version === plan.ruleVersion));
});
