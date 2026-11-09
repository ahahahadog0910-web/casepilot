import assert from 'node:assert/strict';
import test from 'node:test';

import { RULE_ENGINE_VERSION, generateTestPlan } from '../server/rule-engine.js';
import { STRUCTURED_REQUIREMENT_SCHEMA_VERSION } from '../server/schemas.js';

function makeFact(id, statement, ruleType, fields = {}) {
  const trace = {
    documentId: `synthetic-${id}`,
    section: '合成规则',
    quote: statement,
    startOffset: 0,
    endOffset: statement.length
  };
  return {
    id,
    kind: ruleType === 'general' ? 'feature' : 'rule',
    rule_type: ruleType,
    field: '状态值',
    statement,
    value: null,
    minimum: null,
    maximum: null,
    values: [],
    unit: '',
    from: null,
    to: null,
    roles: [],
    ...fields,
    trace,
    traces: [{ ...trace }]
  };
}

function generate(facts) {
  const requirement = {
    schemaVersion: STRUCTURED_REQUIREMENT_SCHEMA_VERSION,
    title: '合成规则回归',
    facts,
    openQuestions: [],
    conflicts: []
  };
  return { requirement, plan: generateTestPlan(requirement) };
}

function assertTraceability(plan, requirement) {
  const factIds = new Set(requirement.facts.map(({ id }) => id));
  assert.ok(plan.testPoints.length > 0);
  assert.ok(plan.testCases.length > 0);

  for (const item of [...plan.testPoints, ...plan.testCases]) {
    assert.ok(item.fact_ids.length > 0);
    assert.ok(item.fact_ids.every((id) => factIds.has(id)));
    assert.equal(item.rule_version, RULE_ENGINE_VERSION);
    assert.ok(item.scenario_group);
    assert.ok(item.scenario_type);
    assert.ok(item.trace.quote);
  }

  for (const item of plan.testCases) {
    assert.ok(item.preconditions.trim());
    assert.ok(item.steps.length > 0);
    assert.ok(item.expectedResults.length > 0);
    assert.doesNotMatch(item.expectedResults.join(' '), /符合需求原文|满足原文中的/);
  }
}

test('threshold template creates executable below/equal/above cases reproducibly', () => {
  const fact = makeFact('fact-threshold', '记录数量至少为 5 条。', 'min', {
    field: '记录数量', value: 5, minimum: 5, unit: '条'
  });
  const { requirement, plan } = generate([fact]);
  const repeated = generateTestPlan(requirement);

  assert.deepEqual(plan.testPoints, repeated.testPoints);
  assert.deepEqual(plan.testCases, repeated.testCases);
  assert.deepEqual(plan.testCases.map(({ title, steps, expectedResults }) => ({ title, steps, expectedResults })), [
    {
      title: '记录数量低于阈值',
      steps: ['将“记录数量”的有效值设为 4条', '触发规则判定并读取结果'],
      expectedResults: ['规则判定结果为不通过']
    },
    {
      title: '记录数量等于阈值',
      steps: ['将“记录数量”的有效值设为 5条', '触发规则判定并读取结果'],
      expectedResults: ['规则判定结果为通过']
    },
    {
      title: '记录数量高于阈值',
      steps: ['将“记录数量”的有效值设为 6条', '触发规则判定并读取结果'],
      expectedResults: ['规则判定结果为通过']
    }
  ]);
  assertTraceability(plan, requirement);
});

test('guarded schedule retains its time, precondition, and once-only behavior', () => {
  const fact = makeFact(
    'fact-schedule',
    '对象创建后的第 2 天 09:30，若状态为待处理，则执行通知，且仅执行一次。',
    'frequency',
    { field: '通知调度', value: 1, unit: '次' }
  );
  const { requirement, plan } = generate([fact]);
  const scheduledCases = plan.testCases;

  assert.ok(scheduledCases.some((item) => /触发点前/.test(item.title)));
  assert.ok(scheduledCases.some((item) => /条件满足/.test(item.title)));
  assert.ok(scheduledCases.some((item) => /条件不满足/.test(item.title)));
  assert.ok(scheduledCases.some((item) => /重复调度/.test(item.title)));
  assert.ok(scheduledCases.every((item) => item.steps.some((step) => /第 2 天 09:30/.test(step))));
  assert.ok(scheduledCases.some((item) => item.expectedResults.some((result) => /仅执行一次/.test(result))));
  assertTraceability(plan, requirement);
});

test('shared, scoped, synchronized, and reversible state facts produce separate risk-focused cases', () => {
  const facts = [
    makeFact('fact-shared', '多个参与者共同更新同一共享状态。', 'general'),
    makeFact('fact-scope', '状态值按账户分别保存，并在同一账户的多个设备间保持一致。', 'general'),
    makeFact('fact-reversal', '撤销操作后，处理状态保持不变。', 'general')
  ];
  const { requirement, plan } = generate(facts);

  const shared = plan.testCases.find((item) => /多个主体操作后读取共享状态/.test(item.title));
  const separate = plan.testCases.find((item) => /不同账户分别保存各自状态/.test(item.title));
  const synchronized = plan.testCases.find((item) => /多个设备间保持一致/.test(item.title));
  const reversal = plan.testCases.find((item) => /撤销操作后状态保持不变/.test(item.title));

  assert.ok(shared);
  assert.ok(shared.steps.length >= 3);
  assert.ok(shared.expectedResults.some((result) => /相同的最新值/.test(result)));
  assert.ok(separate);
  assert.ok(separate.steps.some((step) => /账户 A/.test(step)));
  assert.ok(separate.steps.some((step) => /账户 B/.test(step)));
  assert.ok(synchronized);
  assert.ok(synchronized.steps.some((step) => /设备 1/.test(step)));
  assert.ok(synchronized.steps.some((step) => /设备 2/.test(step)));
  assert.ok(reversal);
  assert.ok(reversal.expectedResults.some((result) => /与操作前保持一致/.test(result)));
  assertTraceability(plan, requirement);
});

test('permission template allows every declared role and separately denies an undeclared role', () => {
  const fact = makeFact('fact-permission', '只有管理员和审核员可以访问后台配置。', 'permission', {
    field: '后台配置', roles: ['管理员', '审核员']
  });
  const { requirement, plan } = generate([fact]);

  assert.deepEqual(plan.testCases.map(({ title, expectedResults }) => ({ title, expectedResults })), [
    { title: '管理员验证后台配置访问权限', expectedResults: ['“管理员”可以访问或操作“后台配置”'] },
    { title: '审核员验证后台配置访问权限', expectedResults: ['“审核员”可以访问或操作“后台配置”'] },
    { title: '未授权主体无法操作后台配置', expectedResults: ['不属于已列授权角色的主体无法访问或操作“后台配置”'] }
  ]);
  assertTraceability(plan, requirement);
});

test('state transition needs an explicit trigger and reports it as a draft when absent', () => {
  const unspecified = makeFact('fact-transition-unclear', '订单状态从待支付变为已支付。', 'transition', {
    from: '待支付', to: '已支付'
  });
  const unclearPlan = generate([unspecified]).plan;
  assert.equal(unclearPlan.testCases[0].status, 'draft');
  assert.match(unclearPlan.testCases[0].preconditions, /触发状态迁移.*尚未明确/);
  assert.match(unclearPlan.testCases[0].expectedResults[0], /不预设状态/);

  const specified = makeFact('fact-transition-specified', '用户点击“确认支付”按钮后，订单状态从待支付变为已支付。', 'transition', {
    from: '待支付', to: '已支付'
  });
  const specifiedPlan = generate([specified]).plan;
  assert.equal(specifiedPlan.testCases[0].status, 'review');
  assert.deepEqual(specifiedPlan.testCases[0].steps, ['执行操作：点击“确认支付”按钮', '读取对象当前状态']);
  assert.deepEqual(specifiedPlan.testCases[0].expectedResults, ['对象状态更新为“已支付”']);
});

test('feature cases require a concrete action and observable outcome', () => {
  const clearBehavior = makeFact('fact-feature-clear', '点击“保存”按钮后，页面展示“保存成功”。', 'general');
  const clearPlan = generate([clearBehavior]).plan;
  assert.deepEqual(clearPlan.testCases[0].steps, ['执行操作：点击“保存”按钮', '检查操作后的页面展示或跳转状态']);
  assert.deepEqual(clearPlan.testCases[0].expectedResults, ['页面展示「保存成功」']);

  const vagueBehavior = makeFact('fact-feature-vague', '用户可以查看处理结果。', 'general');
  const vaguePlan = generate([vagueBehavior]).plan;
  assert.equal(vaguePlan.testCases[0].status, 'draft');
  assert.match(vaguePlan.testCases[0].expectedResults[0], /补充具体触发操作和可观察/);
});

test('condition matrix expands every AND combination with deterministic outcomes', () => {
  const fact = makeFact('fact-and', '若用户已登录且账号状态正常，则展示推荐列表。', 'general', {
    field: '推荐列表'
  });
  const plan = generate([fact]).plan;
  assert.equal(plan.testCases.length, 4);
  assert.ok(plan.testCases.every((item) => item.scenario_type === 'condition_matrix'));
  assert.ok(plan.testCases.some((item) => /已登录不成立/.test(item.title) && /不执行/.test(item.expectedResults[0])));
  assert.ok(plan.testCases.some((item) => /用户已登录成立/.test(item.title) && /账号状态正常成立/.test(item.title) && /执行/.test(item.expectedResults[0])));
  assertTraceability(plan, { facts: [fact] });
});

test('source selection creates one executable case per declared source', () => {
  const fact = makeFact('fact-source', '支持在主库或只读副本之间切换数据源。', 'general', {
    field: '数据源', values: ['主库', '只读副本']
  });
  const plan = generate([fact]).plan;
  assert.deepEqual(plan.testCases.map(({ scenario_group, scenario_type, steps, expectedResults }) => ({
    scenario_group, scenario_type, steps, expectedResults
  })), [
    {
      scenario_group: 'data_source', scenario_type: 'source_selection',
      steps: ['将数据源切换为「主库」', '发起一次读取并检查请求来源或返回数据标记'],
      expectedResults: ['读取使用已选择的数据源「主库」']
    },
    {
      scenario_group: 'data_source', scenario_type: 'source_selection',
      steps: ['将数据源切换为「只读副本」', '发起一次读取并检查请求来源或返回数据标记'],
      expectedResults: ['读取使用已选择的数据源「只读副本」']
    }
  ]);
  assertTraceability(plan, { facts: [fact] });
});

test('conflicts and unclear transitions are separately marked for confirmation', () => {
  const fact = makeFact('fact-conflict', '数量最多为 10 个。', 'max', {
    field: '数量', value: 10, maximum: 10
  });
  const requirement = {
    schemaVersion: STRUCTURED_REQUIREMENT_SCHEMA_VERSION,
    title: '冲突规则回归', facts: [fact], openQuestions: [],
    conflicts: [{
      id: 'conflict-001', fact_ids: [fact.id], description: '存在两个不兼容的上限',
      traces: [fact.trace, { ...fact.trace, startOffset: 20, endOffset: 31, quote: '数量最多为 10 个。' }]
    }]
  };
  const plan = generateTestPlan(requirement);
  assert.equal(plan.testPoints[0].scenario_type, 'conflict');
  assert.equal(plan.testCases[0].scenario_type, 'conflict');
  assert.equal(plan.testCases[0].status, 'draft');
  assert.match(plan.testCases[0].steps[0], /确认/);

  const unclear = generate([makeFact('fact-unclear-transition', '状态从草稿变为已发布。', 'transition', {
    from: '草稿', to: '已发布'
  })]).plan;
  assert.equal(unclear.testCases[0].scenario_type, 'clarification');
  assert.equal(unclear.testCases[0].status, 'draft');
});
