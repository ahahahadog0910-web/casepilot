import {
  STRUCTURED_REQUIREMENT_SCHEMA_VERSION,
  TEST_PLAN_SCHEMA_VERSION,
  FOCUS_AREAS,
  DETAIL_LEVELS,
  TEST_LEVELS,
  assertStructuredRequirement,
  assertTestPlan
} from './schemas.js';

const operatorTypes = {
  required: 'boundary', forbidden: 'boundary', min: 'boundary', max: 'boundary', range: 'boundary',
  enum: 'functional', equality: 'functional', frequency: 'boundary', transition: 'functional',
  permission: 'security', general: 'functional'
};

export const RULE_ENGINE_VERSION = '1.6.0';

function format(value, unit = '') {
  return `${value}${unit}`;
}

function numericNeighbor(value, offset) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const precision = String(value).split('.')[1]?.length || 0;
  return String(Number((number + offset * (10 ** -precision)).toFixed(precision)));
}

function makeCase(fact, index, {
  title,
  type = operatorTypes[fact.rule_type] || 'functional',
  priority = 'medium',
  preconditions,
  steps,
  expectedResults,
  status = 'review',
  conflictIds = []
}) {
  return {
    id: `case-${String(index).padStart(3, '0')}`,
    fact_ids: [fact.id],
    rule_version: RULE_ENGINE_VERSION,
    title,
    type,
    priority,
    preconditions,
    steps,
    expectedResults,
    status,
    testPointId: fact.id,
    trace: fact.trace,
    needsProductConfirmation: conflictIds.length > 0,
    conflict_ids: conflictIds
  };
}

function draftCase(fact, index, title, preconditions, reason) {
  return makeCase(fact, index, {
    title,
    type: operatorTypes[fact.rule_type] || 'functional',
    priority: 'high',
    preconditions,
    steps: ['补充可执行的触发操作、测试数据和结果读取方式后再执行验证'],
    expectedResults: [reason],
    status: 'draft'
  });
}

function thresholdCases(fact, startIndex) {
  const target = Number(fact.value ?? fact.minimum ?? fact.maximum);
  if (!Number.isFinite(target)) return null;

  const strict = fact.rule_type === 'min'
    ? /(?:大于(?!等于)|(?<!<)>(?!=)|超过|多于)/.test(fact.statement)
    : /(?:小于(?!等于)|(?<!>)<(?!=)|少于)/.test(fact.statement);
  const unit = fact.unit || '';
  const field = fact.field || '数值';
  const cases = [];
  const boundaryValues = [numericNeighbor(target, -1), String(target), numericNeighbor(target, 1)].map(Number);
  const relation = fact.rule_type === 'min' ? (value) => strict ? value > target : value >= target
    : (value) => strict ? value < target : value <= target;
  const labels = ['低于阈值', '等于阈值', '高于阈值'];

  boundaryValues.forEach((value, offset) => {
    const displayValue = format(value, unit);
    const meets = relation(value);
    cases.push(makeCase(fact, startIndex + cases.length, {
      title: `${field}${labels[offset]}`,
      type: 'boundary',
      priority: 'high',
      preconditions: `准备可将“${field}”设置为指定值并读取规则判定结果的测试数据`,
      steps: [`将“${field}”的有效值设为 ${displayValue}`, '触发规则判定并读取结果'],
      expectedResults: [`规则判定结果为${meets ? '通过' : '不通过'}`]
    }));
  });
  return cases;
}

function scheduledActionCases(fact, startIndex) {
  const statement = fact.statement;
  const offset = statement.match(/第\s*(\d+)\s*天|(\d+)\s*天后/);
  const clock = statement.match(/(上午|下午|早上|晚上)?\s*(\d{1,2})(?:[:：](\d{2})|点(?:\s*(\d{1,2})\s*分)?)/);
  const action = statement.match(/(?:发送|触发|执行|生成|提醒|通知)[^，,。；;]{0,24}/)?.[0]?.trim();
  if (!offset || !clock || !action) return [];

  const day = offset[1] || offset[2];
  const minute = clock[3] || clock[4] || '00';
  const meridiem = clock[1] ? `${clock[1]} ` : '';
  const trigger = `第 ${day} 天 ${meridiem}${clock[2]}:${minute}`;
  const guard = statement.match(/(?:若|如果|当|只要)(.{1,36}?)(?:则|就|时|，|,|；|;|$)/)?.[1]?.trim();
  const onceOnly = /(?:仅|只).{0,8}一次/.test(statement);
  const cases = [];
  const add = (title, steps, expectedResults) => cases.push(makeCase(fact, startIndex + cases.length, {
    title,
    type: 'boundary',
    priority: 'high',
    preconditions: `准备具有可控时钟的测试对象；计划触发点为${trigger}`,
    steps: [...steps, '检查实际执行记录'],
    expectedResults
  }));

  add('定时动作在触发点前不执行', [
    `将测试时钟设为${trigger}前 1 分钟`,
    ...(guard ? [`使条件「${guard}」成立`] : [])
  ], [`${action}在设定触发点前未执行`]);

  add(guard ? '定时条件满足时执行动作' : '到达设定时间时执行动作', [
    `将测试时钟推进至${trigger}`,
    ...(guard ? [`使条件「${guard}」成立`] : [])
  ], [`${action}在设定触发点执行`]);

  if (guard) {
    add('定时条件不满足时不执行动作', [
      `将测试时钟推进至${trigger}`,
      `使条件「${guard}」不成立`
    ], [`条件不成立时不执行${action}`]);
  }

  if (onceOnly) {
    add('重复调度不重复执行动作', [
      `在${trigger}对同一测试对象重复触发调度`,
      '统计该周期内的动作执行次数'
    ], [`同一周期内${action}仅执行一次`]);
  }
  return cases;
}

function sharedStateCases(fact, startIndex) {
  const statement = fact.statement;
  if (!/(?:共享|共同维护|共同更新)/.test(statement) || !/(?:状态|进度|结果|数据|内容)/.test(statement)) return [];
  return [makeCase(fact, startIndex, {
    title: '多个主体操作后读取共享状态',
    type: 'functional',
    priority: 'high',
    preconditions: '准备主体 A、主体 B；记录共享字段的初始值，并确保双方可读取该字段',
    steps: [
      '由主体 A 更新共享字段并保存',
      '由主体 B 重新读取该字段',
      '由主体 B 再次更新并保存该字段',
      '分别由主体 A、主体 B 读取最新值'
    ],
    expectedResults: [
      '主体 B 能读取主体 A 保存的最新值',
      '主体 A、主体 B 最终读取到相同的最新值'
    ]
  })];
}

function accountScopeCases(fact, startIndex) {
  const statement = fact.statement;
  const cases = [];
  const field = fact.field || '状态值';
  const isAccountScoped = /(?:按|基于|针对).{0,8}(?:账号|账户).{0,10}(?:分别保存|独立保存|隔离|互不影响)/.test(statement);
  const isCrossDevice = /(?:跨设备|不同设备|多个设备).{0,16}(?:同步|一致|保持)/.test(statement);

  if (isAccountScoped) cases.push(makeCase(fact, startIndex + cases.length, {
    title: '不同账户分别保存各自状态',
    type: 'functional',
    priority: 'high',
    preconditions: `准备账户 A、账户 B，并为“${field}”设置可区分的值`,
    steps: [
      '保存账户 A 的状态值',
      '切换到账户 B 并保存另一状态值',
      '分别重新读取账户 A、账户 B 的状态值'
    ],
    expectedResults: [
      '账户 A 读取到其自身最近保存的值',
      '账户 B 读取到其自身最近保存的值',
      '两个账户的状态值互不覆盖'
    ]
  }));

  if (isCrossDevice) cases.push(makeCase(fact, startIndex + cases.length, {
    title: '同一账户的状态在多个设备间保持一致',
    type: 'functional',
    priority: 'high',
    preconditions: `准备同一账户登录的设备 1、设备 2，并记录“${field}”当前值`,
    steps: [
      '在设备 1 修改并保存状态值',
      '在设备 2 重新读取该状态值',
      '在设备 2 修改并保存为另一值',
      '在设备 1 重新读取该状态值'
    ],
    expectedResults: [
      '设备 2 读取到设备 1 最近保存的值',
      '设备 1 读取到设备 2 最近保存的值'
    ]
  }));

  return cases;
}

function reversibleStateCases(fact, startIndex) {
  const statement = fact.statement;
  const action = statement.match(/(?:撤销|取消|移除|删除)[^，,。；;]{0,24}/)?.[0]?.trim();
  if (!action || !/(?:状态|进度)/.test(statement)) return [];
  const preserves = /(?:不回退|不变|保持不变|不受影响)/.test(statement);
  const explicitTarget = statement.match(/(?:回退|恢复)(?:为|到)([^，,。；;]+)/)?.[1]?.trim();
  if (!preserves && !explicitTarget) return [];

  return [makeCase(fact, startIndex, {
    title: preserves ? '撤销操作后状态保持不变' : '撤销操作后状态按规则回退',
    type: 'functional',
    priority: 'high',
    preconditions: '准备已满足相关规则的测试对象，并记录操作前状态和进度',
    steps: [`执行操作「${action}」`, '重新读取对象状态和进度'],
    expectedResults: [preserves
      ? '对象状态和进度与操作前保持一致'
      : `对象状态按原文回退至「${explicitTarget}」`]
  })];
}

function actionOutcomeCase(fact, index) {
  const statement = fact.statement;
  const action = statement.match(/(?:点击|选择|开启|关闭|提交|保存|创建|修改|删除|取消|发送|接收|进入|跳转)[^，,。；;]{1,48}/)?.[0]?.trim();
  const outcomes = [...statement.matchAll(/(?:调起|跳转至|跳转到|展示|显示|隐藏|消失|返回|默认选择|保存为|更新为)[^，,。；;]{0,48}/g)]
    .map((match) => match[0].trim());
  if (!action || !outcomes.length) return null;
  return makeCase(fact, index, {
    title: `验证操作结果：${action}`,
    type: 'functional',
    priority: 'high',
    preconditions: '准备需求描述的对象和操作入口，并确认初始状态可读取',
    steps: [`执行操作「${action}」`, '读取操作完成后的页面或对象状态'],
    expectedResults: outcomes.map((outcome) => `操作后可观察到「${outcome}」`)
  });
}

function casesForRule(fact, startIndex) {
  const field = fact.field || '规则字段';
  const statement = fact.statement;
  const unit = fact.unit || '';
  const cases = [];
  const add = (title, steps, expectedResults, priority = 'medium') => cases.push(makeCase(fact, startIndex + cases.length, {
    title,
    type: operatorTypes[fact.rule_type] || 'functional',
    priority,
    preconditions: `准备可以设置“${field}”并读取判定结果的测试数据`,
    steps,
    expectedResults
  }));

  switch (fact.rule_type) {
    case 'required':
      add(`${field}填写有效值`, [`为“${field}”填写有效值`, '提交并读取校验结果'], [`“${field}”通过必填校验`], 'high');
      add(`${field}为空时提交`, [`清空“${field}”`, '提交并读取校验结果'], [`提交未通过必填校验；结果明确指出“${field}”不能为空`], 'high');
      break;
    case 'forbidden':
      return [draftCase(fact, startIndex, `验证禁止规则：${field}`,
        '禁止条件和对应触发操作尚未从事实中明确拆出',
        '需先明确被禁止的输入或操作，以及可观察的拒绝结果')];
    case 'min':
    case 'max': {
      const generated = thresholdCases(fact, startIndex);
      return generated || [draftCase(fact, startIndex, `验证${field}阈值`,
        '阈值或比较条件未能解析为可计算数值',
        '需补充明确阈值、比较关系及结果读取方式')];
    }
    case 'range': {
      const minimum = Number(fact.minimum);
      const maximum = Number(fact.maximum);
      if (Number.isFinite(minimum) && Number.isFinite(maximum)) {
        add(`${field}低于范围下界`, [`将“${field}”设为 ${format(numericNeighbor(minimum, -1), unit)}`, '触发校验并读取结果'], [`校验结果为不通过，并标记低于下界 ${format(minimum, unit)}`], 'high');
        add(`${field}位于范围下界`, [`将“${field}”设为 ${format(minimum, unit)}`, '触发校验并读取结果'], ['校验结果为通过，边界值被接受'], 'high');
        add(`${field}位于范围上界`, [`将“${field}”设为 ${format(maximum, unit)}`, '触发校验并读取结果'], ['校验结果为通过，边界值被接受'], 'high');
        add(`${field}超过范围上界`, [`将“${field}”设为 ${format(numericNeighbor(maximum, 1), unit)}`, '触发校验并读取结果'], [`校验结果为不通过，并标记超过上界 ${format(maximum, unit)}`], 'high');
      } else {
        return [draftCase(fact, startIndex, `验证${field}范围`,
          '范围边界未能解析为可计算数值',
          '需补充明确的下界、上界及边界是否包含')];
      }
      break;
    }
    case 'enum':
      (Array.isArray(fact.values) ? fact.values : []).forEach((value) => {
        add(`${field}取允许值“${value}”`, [`将“${field}”设为“${value}”`, '提交并读取校验结果'], [`“${value}”被识别为允许值`]);
      });
      add(`${field}取未列出的值`, [`将“${field}”设为未列出的值`, '提交并读取校验结果'], ['未列出的值未被识别为允许值'], 'high');
      break;
    case 'equality': {
      const expectedValue = fact.value ?? fact.values?.[0];
      if (expectedValue === undefined || expectedValue === null) {
        return [draftCase(fact, startIndex, `验证${field}固定值`,
          '固定值未能解析为明确数据',
          '需补充固定值和可观察的比对结果')];
      }
      add(`${field}等于规定值`, [`将“${field}”设为“${expectedValue}”`, '触发校验并读取结果'], [`“${field}”与规定值“${expectedValue}”一致`], 'high');
      add(`${field}不等于规定值`, [`将“${field}”设为不同于“${expectedValue}”的值`, '触发校验并读取结果'], [`“${field}”与规定值“${expectedValue}”不一致`], 'high');
      break;
    }
    case 'frequency': {
      const limit = Number(fact.value);
      if (!Number.isFinite(limit)) {
        return [draftCase(fact, startIndex, `验证${field}频率限制`,
          '频率上限未能解析为可计算数值',
          '需补充每个时间窗口允许的次数及窗口长度')];
      }
      const window = statement.match(/(?:每|在)\s*(\d+(?:\.\d+)?)\s*(毫秒|秒|分钟|分|小时|天)/);
      const period = window ? `${window[1]}${window[2]}` : '同一规则周期';
      const countUnit = /次|条|个/.exec(statement)?.[0] || '';
      add(`${field}在频率上限内`, [`在${period}内执行 ${Math.max(0, limit - 1)} 次操作`, '读取限频判定结果'], ['操作未超过规定频率上限'], 'high');
      add(`${field}达到频率上限`, [`在${period}内执行 ${limit} 次操作`, '读取限频判定结果'], [`执行次数达到 ${limit}${countUnit} 上限`], 'high');
      add(`${field}超过频率上限`, [`在${period}内尝试执行 ${limit + 1} 次操作`, '读取限频判定结果'], ['超出上限的操作未被按正常成功处理'], 'high');
      break;
    }
    case 'transition': {
      const from = fact.from || '起始状态';
      const to = fact.to || '目标状态';
      return [makeCase(fact, startIndex, {
        title: `状态由“${from}”转为“${to}”`,
        type: 'functional',
        priority: 'high',
        preconditions: `准备状态为“${from}”且可触发该状态迁移的测试对象`,
        steps: ['执行需求中描述的状态迁移操作', '读取对象当前状态'],
        expectedResults: [`对象状态更新为“${to}”`],
        status: /(?:操作|触发|提交|执行|点击|收到|发送)/.test(statement) ? 'review' : 'draft'
      })];
    }
    case 'permission': {
      const roles = fact.roles?.length ? fact.roles : ['授权主体', '未授权主体'];
      roles.forEach((role, index) => add(`${role}验证${field}访问权限`, [`使用“${role}”访问或操作“${field}”`, '读取访问结果'], [
        index === 0 ? `“${role}”可以访问或操作“${field}”` : `“${role}”无法访问或操作“${field}”`
      ], 'high'));
      break;
    }
    default:
      return [draftCase(fact, startIndex, `待补充验收标准：${field}`,
        '事实未明确可执行的前置条件',
        '需补充具体操作步骤和可观察的判定结果')];
  }
  return cases;
}

function featureCase(fact, index) {
  const generated = actionOutcomeCase(fact, index);
  if (generated) return generated;
  return draftCase(fact, index, `待补充验收标准：${fact.field || '功能行为'}`,
    '事实未明确可执行的前置条件',
    '需补充具体触发操作和可观察、可判定的结果');
}

function casesForFact(fact, startIndex) {
  const reusable = [
    ...scheduledActionCases(fact, startIndex),
    ...sharedStateCases(fact, startIndex),
    ...accountScopeCases(fact, startIndex),
    ...reversibleStateCases(fact, startIndex)
  ];
  if (reusable.length) {
    return reusable.map((item, index) => ({ ...item, id: `case-${String(startIndex + index).padStart(3, '0')}` }));
  }
  return fact.kind === 'rule' ? casesForRule(fact, startIndex) : [featureCase(fact, startIndex)];
}

function mergeEquivalentCases(cases, testPoints) {
  const merged = new Map();
  const testPointById = new Map(testPoints.map((point) => [point.id, point]));
  for (const testCase of cases) {
    const key = JSON.stringify([testCase.title, testCase.type, testCase.preconditions, testCase.steps]);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...testCase, fact_ids: [...new Set(testCase.fact_ids)] });
      continue;
    }
    existing.fact_ids = [...new Set([...existing.fact_ids, ...testCase.fact_ids])];
    existing.expectedResults = [...new Set([...existing.expectedResults, ...testCase.expectedResults])];
    existing.conflict_ids = [...new Set([...existing.conflict_ids, ...testCase.conflict_ids])];
    existing.needsProductConfirmation = existing.conflict_ids.length > 0;
    const linkedPoint = testPointById.get(existing.testPointId);
    if (linkedPoint) linkedPoint.fact_ids = [...new Set([...linkedPoint.fact_ids, ...testCase.fact_ids])];
    if (testCase.status === 'draft') existing.status = 'draft';
    if (testCase.priority === 'high') existing.priority = 'high';
  }
  return [...merged.values()].map((testCase, index) => ({
    ...testCase,
    id: `case-${String(index + 1).padStart(3, '0')}`
  }));
}

function normalizeOptions(options) {
  const input = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const focusAreas = input.focusAreas === undefined ? ['functional', 'boundary'] : input.focusAreas;
  if (!Array.isArray(focusAreas) || focusAreas.some((area) => !FOCUS_AREAS.includes(area))) {
    throw new TypeError(`options.focusAreas 必须是 ${FOCUS_AREAS.join('|')} 的数组`);
  }
  const detailLevel = input.detailLevel ?? 'standard';
  if (!DETAIL_LEVELS.includes(detailLevel)) throw new TypeError(`options.detailLevel 必须是 ${DETAIL_LEVELS.join('|')}`);
  const testLevelAliases = { '系统测试': 'system', '集成测试': 'integration', '接口测试': 'api', 'UI测试': 'ui', '界面测试': 'ui' };
  const testLevel = testLevelAliases[input.testLevel] || input.testLevel || 'system';
  if (!TEST_LEVELS.includes(testLevel)) throw new TypeError(`options.testLevel 必须是 ${TEST_LEVELS.join('|')}`);
  return { focusAreas: [...new Set(focusAreas)], detailLevel, testLevel };
}

function ruleTestPoint(fact, conflictIds = []) {
  return {
    id: fact.id,
    fact_ids: [fact.id],
    rule_version: RULE_ENGINE_VERSION,
    title: fact.statement,
    description: `基于明确规则“${fact.statement}”进行规则测试`,
    type: operatorTypes[fact.rule_type] || 'functional',
    priority: 'high',
    trace: fact.trace,
    needsProductConfirmation: conflictIds.length > 0,
    conflict_ids: conflictIds
  };
}

function testPointForFeature(fact, conflictIds = []) {
  return {
    id: fact.id,
    fact_ids: [fact.id],
    rule_version: RULE_ENGINE_VERSION,
    title: fact.statement,
    description: `基于可追溯事实“${fact.statement}”设计验证`,
    type: 'functional',
    priority: 'high',
    trace: fact.trace,
    needsProductConfirmation: conflictIds.length > 0,
    conflict_ids: conflictIds
  };
}

function confirmationCase(fact, startIndex, conflictIds) {
  return makeCase(fact, startIndex, {
    title: `待产品确认：${fact.field}`,
    type: operatorTypes[fact.rule_type] || 'functional',
    priority: 'high',
    preconditions: '冲突规则尚未确认，暂不执行确定性通过/失败判定',
    steps: ['向产品确认冲突规则的适用范围、特殊逻辑及前置条件', '根据确认结果补充或修订需求基线后再执行测试'],
    expectedResults: ['确认前不设定该冲突规则的判定预期'],
    status: 'draft',
    conflictIds
  });
}

/**
 * Deterministic range-rule sample: one source fact becomes one test point and four
 * boundary cases. IDs, fact linkage, and rule version are part of the returned shape.
 * @param {import('./schemas.js').RequirementFact} fact
 * @param {number} [startIndex=1]
 * @returns {{testPoints: import('./schemas.js').TestPoint[], testCases: import('./schemas.js').TestCase[]}}
 */
export function generateRangeTestPoints(fact, startIndex = 1) {
  assertStructuredRequirement({ schemaVersion: STRUCTURED_REQUIREMENT_SCHEMA_VERSION, title: '范围规则样板', facts: [fact], openQuestions: [], conflicts: [] });
  if (fact.kind !== 'rule' || fact.rule_type !== 'range') {
    throw new TypeError('generateRangeTestPoints 只接受 rule_type 为 range 的事实');
  }
  if (!Number.isInteger(startIndex) || startIndex < 1) throw new TypeError('startIndex 必须是正整数');
  return { testPoints: [ruleTestPoint(fact)], testCases: casesForRule(fact, startIndex) };
}

export function generateTestPlan(requirement, options = {}, context = {}) {
  assertStructuredRequirement(requirement);
  const normalizedOptions = normalizeOptions(options);
  const testPoints = [];
  const testCases = [];
  const conflictsByFactId = new Map();
  for (const conflict of requirement.conflicts) {
    for (const factId of conflict.fact_ids) {
      conflictsByFactId.set(factId, [...(conflictsByFactId.get(factId) || []), conflict.id]);
    }
  }

  for (const fact of requirement.facts) {
    const conflictIds = conflictsByFactId.get(fact.id) || [];
    testPoints.push(fact.kind === 'rule' ? ruleTestPoint(fact, conflictIds) : testPointForFeature(fact, conflictIds));
    testCases.push(...(conflictIds.length
      ? [confirmationCase(fact, testCases.length + 1, conflictIds)]
      : casesForFact(fact, testCases.length + 1)));
  }

  testCases.splice(0, testCases.length, ...mergeEquivalentCases(testCases, testPoints));
  const modeledFacts = requirement.facts.length;
  const plan = {
    schemaVersion: TEST_PLAN_SCHEMA_VERSION,
    id: `plan-${Date.now()}`,
    title: `${requirement.title} · 测试方案`,
    modelId: context.modelId || 'local-rules',
    provider: context.provider || 'rules',
    generationMethod: 'deterministic-rules',
    ruleVersion: RULE_ENGINE_VERSION,
    testPoints,
    testCases,
    openQuestions: requirement.openQuestions,
    conflicts: requirement.conflicts,
    insights: [],
    coverage: modeledFacts ? 100 : 0,
    coverageDefinition: '需求解析得到的可追溯事实映射到规则测试点的比例',
    options: normalizedOptions,
    createdAt: new Date().toISOString()
  };
  assertTestPlan(plan);
  return plan;
}
