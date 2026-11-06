/** Synthetic-only cases for comparing requirement extraction quality. */
export const STANDARDIZATION_EVALUATION_CASES = [
  {
    id: 'synthetic-order-rules-001',
    version: '1.0.0',
    source: [
      '# 订单规则',
      '## 背景',
      '为了提升履约效率，本次计划优化订单处理。',
      '## 业务规则',
      '订单数量至少 2 件，最多 5 件。',
      '订单状态只能为待支付、已支付或已取消。'
    ].join('\n'),
    expectedFacts: [
      { rule_type: 'min', field: '订单数量', statement: '订单数量至少 2 件', value: 2, minimum: 2, maximum: null, unit: '件', values: [], from: null, to: null, roles: [] },
      { rule_type: 'max', field: '订单数量', statement: '最多 5 件。', value: 5, minimum: null, maximum: 5, unit: '件', values: [], from: null, to: null, roles: [] },
      { rule_type: 'enum', field: '订单状态', statement: '订单状态只能为待支付、已支付或已取消。', value: null, minimum: null, maximum: null, unit: '', values: ['待支付', '已支付', '已取消'], from: null, to: null, roles: [] }
    ],
    expectedOpenQuestions: [],
    expectedConflicts: []
  },
  {
    id: 'synthetic-state-transition-002',
    version: '1.0.0',
    source: [
      '# 状态规则',
      '## 业务规则',
      '订单状态只能为待支付、已支付或已取消。',
      '订单从待支付状态变为已支付状态。'
    ].join('\n'),
    expectedFacts: [
      { rule_type: 'enum', field: '订单状态', statement: '订单状态只能为待支付、已支付或已取消。', value: null, minimum: null, maximum: null, unit: '', values: ['待支付', '已支付', '已取消'], from: null, to: null, roles: [] },
      { rule_type: 'transition', field: '订单', statement: '订单从待支付状态变为已支付状态。', value: null, minimum: null, maximum: null, unit: '', values: [], from: '待支付', to: '已支付', roles: [] }
    ],
    expectedOpenQuestions: [],
    expectedConflicts: []
  },
  {
    id: 'synthetic-scheduled-action-003',
    version: '1.0.0',
    source: [
      '# 通知规则',
      '## 业务规则',
      '若用户已完成认证，则第 2 天 09:30 仅发送一次提醒。'
    ].join('\n'),
    expectedFacts: [
      { rule_type: 'frequency', field: '若用户已完成认证，则第 2 天 09:30 仅发送一次提醒。', statement: '若用户已完成认证，则第 2 天 09:30 仅发送一次提醒。', value: 1, minimum: null, maximum: null, unit: '次', values: [], from: null, to: null, roles: [] }
    ],
    expectedOpenQuestions: [],
    expectedConflicts: []
  },
  {
    id: 'synthetic-open-question-004',
    version: '1.0.0',
    source: [
      '# 内容规则',
      '## 业务规则',
      '文章内容至少 3 条（待定，需确认是否包含草稿）。'
    ].join('\n'),
    expectedFacts: [],
    expectedOpenQuestions: [{ statement: '文章内容至少 3 条（待定，需确认是否包含草稿）。' }],
    expectedConflicts: []
  },
  {
    id: 'synthetic-conflicting-bounds-005',
    version: '1.0.0',
    source: [
      '# 数量规则',
      '## 业务规则',
      '数量至少 10 件。',
      '数量最多 5 件。'
    ].join('\n'),
    expectedFacts: [
      { rule_type: 'min', field: '数量', statement: '数量至少 10 件。', value: 10, minimum: 10, maximum: null, unit: '件', values: [], from: null, to: null, roles: [] },
      { rule_type: 'max', field: '数量', statement: '数量最多 5 件。', value: 5, minimum: null, maximum: 5, unit: '件', values: [], from: null, to: null, roles: [] }
    ],
    expectedOpenQuestions: [],
    expectedConflicts: [{ fact_ids: ['fact-001', 'fact-002'] }]
  },
  {
    id: 'synthetic-permission-006',
    version: '1.0.0',
    source: [
      '# 权限规则',
      '## 业务规则',
      '只有管理员可以操作配置。'
    ].join('\n'),
    expectedFacts: [
      { rule_type: 'permission', field: '业务规则', statement: '只有管理员可以操作配置。', value: null, minimum: null, maximum: null, unit: '', values: [], from: null, to: null, roles: ['管理员'] }
    ],
    expectedOpenQuestions: [],
    expectedConflicts: []
  }
];
