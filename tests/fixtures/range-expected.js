/**
 * Hand-authored golden output for RANGE_FACT. Keep this literal independent from
 * rule-engine helpers so changes to generated wording or metadata fail the test.
 */
export const RANGE_EXPECTED = {
  testPoints: [
    {
      id: 'fact-range-001',
      fact_ids: ['fact-range-001'],
      rule_version: '1.8.0',
      title: '金额必须在 10 至 20 元之间',
      description: '基于明确规则“金额必须在 10 至 20 元之间”进行规则测试',
      scenario_group: 'rule',
      scenario_type: 'boundary',
      type: 'boundary',
      priority: 'high',
      trace: {
        documentId: 'requirement-range-001',
        section: '金额规则',
        quote: '金额必须在 10 至 20 元之间',
        startOffset: 0,
        endOffset: 17
      },
      needsProductConfirmation: false,
      conflict_ids: []
    }
  ],
  testCases: [
    {
      id: 'case-001',
      fact_ids: ['fact-range-001'],
      rule_version: '1.8.0',
      title: '金额低于范围下界',
      scenario_group: 'rule',
      scenario_type: 'boundary',
      type: 'boundary',
      priority: 'high',
      preconditions: '准备可以设置“金额”并读取判定结果的测试数据',
      steps: ['将“金额”设为 9元', '触发校验并读取结果'],
      expectedResults: ['校验结果为不通过，并标记低于下界 10元'],
      status: 'review',
      testPointId: 'fact-range-001',
      trace: {
        documentId: 'requirement-range-001',
        section: '金额规则',
        quote: '金额必须在 10 至 20 元之间',
        startOffset: 0,
        endOffset: 17
      },
      needsProductConfirmation: false,
      conflict_ids: []
    },
    {
      id: 'case-002',
      fact_ids: ['fact-range-001'],
      rule_version: '1.8.0',
      title: '金额位于范围下界',
      scenario_group: 'rule',
      scenario_type: 'boundary',
      type: 'boundary',
      priority: 'high',
      preconditions: '准备可以设置“金额”并读取判定结果的测试数据',
      steps: ['将“金额”设为 10元', '触发校验并读取结果'],
      expectedResults: ['校验结果为通过，边界值被接受'],
      status: 'review',
      testPointId: 'fact-range-001',
      trace: {
        documentId: 'requirement-range-001',
        section: '金额规则',
        quote: '金额必须在 10 至 20 元之间',
        startOffset: 0,
        endOffset: 17
      },
      needsProductConfirmation: false,
      conflict_ids: []
    },
    {
      id: 'case-003',
      fact_ids: ['fact-range-001'],
      rule_version: '1.8.0',
      title: '金额位于范围上界',
      scenario_group: 'rule',
      scenario_type: 'boundary',
      type: 'boundary',
      priority: 'high',
      preconditions: '准备可以设置“金额”并读取判定结果的测试数据',
      steps: ['将“金额”设为 20元', '触发校验并读取结果'],
      expectedResults: ['校验结果为通过，边界值被接受'],
      status: 'review',
      testPointId: 'fact-range-001',
      trace: {
        documentId: 'requirement-range-001',
        section: '金额规则',
        quote: '金额必须在 10 至 20 元之间',
        startOffset: 0,
        endOffset: 17
      },
      needsProductConfirmation: false,
      conflict_ids: []
    },
    {
      id: 'case-004',
      fact_ids: ['fact-range-001'],
      rule_version: '1.8.0',
      title: '金额超过范围上界',
      scenario_group: 'rule',
      scenario_type: 'boundary',
      type: 'boundary',
      priority: 'high',
      preconditions: '准备可以设置“金额”并读取判定结果的测试数据',
      steps: ['将“金额”设为 21元', '触发校验并读取结果'],
      expectedResults: ['校验结果为不通过，并标记超过上界 20元'],
      status: 'review',
      testPointId: 'fact-range-001',
      trace: {
        documentId: 'requirement-range-001',
        section: '金额规则',
        quote: '金额必须在 10 至 20 元之间',
        startOffset: 0,
        endOffset: 17
      },
      needsProductConfirmation: false,
      conflict_ids: []
    }
  ]
};
