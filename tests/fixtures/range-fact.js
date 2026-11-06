/** Fixed canonical input for the range-rule regression sample. */
const quote = '金额必须在 10 至 20 元之间';
const trace = {
  documentId: 'requirement-range-001',
  section: '金额规则',
  quote,
  startOffset: 0,
  endOffset: 17
};

export const RANGE_FACT = {
  id: 'fact-range-001',
  kind: 'rule',
  rule_type: 'range',
  field: '金额',
  statement: quote,
  value: null,
  minimum: 10,
  maximum: 20,
  values: [],
  unit: '元',
  from: null,
  to: null,
  roles: [],
  trace,
  traces: [{ ...trace }]
};
