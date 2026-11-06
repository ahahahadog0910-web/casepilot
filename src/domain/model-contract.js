/**
 * Versioned runtime contracts shared by the requirement normalizer and rule engine.
 * A schema change must update the version and its contract tests.
 */

export const STRUCTURED_REQUIREMENT_SCHEMA_VERSION = '1.1.0';
export const TEST_PLAN_SCHEMA_VERSION = '2.1.0';

export const REQUIREMENT_KINDS = Object.freeze(['rule', 'feature', 'workflow_step']);
export const RULE_TYPES = Object.freeze([
  'required', 'forbidden', 'min', 'max', 'range', 'enum', 'equality',
  'frequency', 'transition', 'permission', 'general'
]);
export const TEST_TYPES = Object.freeze(['functional', 'boundary', 'security', 'usability', 'performance', 'risk']);
export const PRIORITIES = Object.freeze(['low', 'medium', 'high']);
export const TEST_LEVELS = Object.freeze(['system', 'integration', 'api', 'ui']);
export const DETAIL_LEVELS = Object.freeze(['compact', 'standard', 'deep']);
export const FOCUS_AREAS = Object.freeze(['functional', 'boundary', 'security', 'usability']);

/** @typedef {Object} RequirementDocument
 * @property {string} id
 * @property {string} name
 * @property {string} content
 * @property {'txt'|'md'|'docx'|'pdf'|'design'} sourceType
 * @property {string=} version
 */

/**
 * Every property is present in normalized output. Unspecified scalar values use null;
 * collection values use empty arrays. Unknown properties are rejected.
 *
 * @typedef {Object} RequirementTrace
 * @property {string|null} documentId
 * @property {string} section
 * @property {string} quote
 * @property {number} startOffset Inclusive UTF-16 offset in the source string.
 * @property {number} endOffset Exclusive UTF-16 offset in the source string.
 */

/**
 * @typedef {Object} RequirementFact
 * @property {string} id
 * @property {'rule'|'feature'|'workflow_step'} kind
 * @property {'required'|'forbidden'|'min'|'max'|'range'|'enum'|'equality'|'frequency'|'transition'|'permission'|'general'} rule_type
 * @property {string} field
 * @property {string} statement
 * @property {number|string|null} value
 * @property {number|null} minimum
 * @property {number|null} maximum
 * @property {string[]} values
 * @property {string} unit
 * @property {string|null} from
 * @property {string|null} to
 * @property {string[]} roles
 * @property {RequirementTrace} trace
 * @property {RequirementTrace[]} traces
 */

/** @typedef {Object} RequirementOpenQuestion
 * @property {string} id
 * @property {string} statement
 * @property {string} question
 * @property {RequirementTrace} trace
 */

/** @typedef {Object} RequirementConflict
 * @property {string} id
 * @property {string[]} fact_ids
 * @property {string} description
 * @property {RequirementTrace[]} traces
 */

/** @typedef {Object} StructuredRequirement
 * @property {'1.1.0'} schemaVersion
 * @property {string} title
 * @property {RequirementFact[]} facts
 * @property {RequirementOpenQuestion[]} openQuestions
 * @property {RequirementConflict[]} conflicts
 */

/** @typedef {Object} TestPlanOptions
 * @property {string[]} focusAreas
 * @property {'compact'|'standard'|'deep'} detailLevel
 * @property {'system'|'integration'|'api'|'ui'} testLevel
 */

/** @typedef {Object} TestPoint
 * @property {string} id
 * @property {string[]} fact_ids Source fact identifiers covered by this point.
 * @property {string} rule_version Rule engine version that generated this point.
 * @property {string} title
 * @property {string} description
 * @property {'functional'|'boundary'|'security'|'usability'|'performance'|'risk'} type
 * @property {'low'|'medium'|'high'} priority
 * @property {RequirementTrace} trace
 * @property {boolean} needsProductConfirmation
 * @property {string[]} conflict_ids
 */

/** @typedef {Object} TestCase
 * @property {string} id
 * @property {string[]} fact_ids Source fact identifiers covered by this case.
 * @property {string} rule_version Rule engine version that generated this case.
 * @property {string} title
 * @property {'functional'|'boundary'|'security'|'usability'|'performance'|'risk'} type
 * @property {'low'|'medium'|'high'} priority
 * @property {string} preconditions
 * @property {string[]} steps
 * @property {string[]} expectedResults
 * @property {'draft'|'review'|'approved'|'deprecated'} status
 * @property {string} testPointId
 * @property {RequirementTrace} trace
 * @property {boolean} needsProductConfirmation
 * @property {string[]} conflict_ids
 */

/** @typedef {Object} TestPlanInsight
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} action
 */

/** @typedef {Object} TestPlan
 * @property {'2.1.0'} schemaVersion
 * @property {string} id
 * @property {string} title
 * @property {string} modelId
 * @property {string} provider
 * @property {'deterministic-rules'} generationMethod
 * @property {string} ruleVersion
 * @property {TestPoint[]} testPoints
 * @property {TestCase[]} testCases
 * @property {RequirementOpenQuestion[]} openQuestions
 * @property {RequirementConflict[]} conflicts
 * @property {TestPlanInsight[]} insights
 * @property {number} coverage
 * @property {string} coverageDefinition
 * @property {TestPlanOptions} options
 * @property {string} createdAt ISO-8601 timestamp.
 */

/** @typedef {TestPlanOptions & {modelId?: string}} GenerationOptions */

function fail(path, expected) {
  throw new TypeError(`契约校验失败：${path} 应为 ${expected}`);
}

function objectAt(value, path, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '对象');
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(path, `字段 {${expected.join(', ')}}`);
  }
}

function stringAt(value, path, { nullable = false, nonempty = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || (nonempty && !value.trim())) fail(path, nullable ? '字符串或 null' : '字符串');
}

function numberAt(value, path, { nullable = false, integer = false, minimum = -Infinity, maximum = Infinity } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < minimum || value > maximum) {
    fail(path, nullable ? '有限数字或 null' : '有限数字');
  }
}

function arrayAt(value, path, validateItem) {
  if (!Array.isArray(value)) fail(path, '数组');
  value.forEach((item, index) => validateItem(item, `${path}[${index}]`));
}

function enumAt(value, path, values) {
  if (!values.includes(value)) fail(path, `枚举值 ${values.join('|')}`);
}

function validateTrace(trace, path) {
  objectAt(trace, path, ['documentId', 'section', 'quote', 'startOffset', 'endOffset']);
  stringAt(trace.documentId, `${path}.documentId`, { nullable: true });
  stringAt(trace.section, `${path}.section`);
  stringAt(trace.quote, `${path}.quote`, { nonempty: true });
  numberAt(trace.startOffset, `${path}.startOffset`, { integer: true, minimum: 0 });
  numberAt(trace.endOffset, `${path}.endOffset`, { integer: true, minimum: 0 });
  if (trace.endOffset < trace.startOffset) fail(`${path}.endOffset`, '不小于 startOffset 的整数');
  if (trace.endOffset - trace.startOffset !== trace.quote.length) fail(`${path}.endOffset`, '与 quote 长度匹配的半开区间');
}

function validateFact(fact, path) {
  objectAt(fact, path, [
    'id', 'kind', 'rule_type', 'field', 'statement', 'value', 'minimum', 'maximum',
    'values', 'unit', 'from', 'to', 'roles', 'trace', 'traces'
  ]);
  stringAt(fact.id, `${path}.id`, { nonempty: true });
  enumAt(fact.kind, `${path}.kind`, REQUIREMENT_KINDS);
  enumAt(fact.rule_type, `${path}.rule_type`, RULE_TYPES);
  stringAt(fact.field, `${path}.field`, { nonempty: true });
  stringAt(fact.statement, `${path}.statement`, { nonempty: true });
  if (fact.value !== null && typeof fact.value !== 'string') numberAt(fact.value, `${path}.value`);
  numberAt(fact.minimum, `${path}.minimum`, { nullable: true });
  numberAt(fact.maximum, `${path}.maximum`, { nullable: true });
  arrayAt(fact.values, `${path}.values`, (value, itemPath) => stringAt(value, itemPath));
  stringAt(fact.unit, `${path}.unit`);
  stringAt(fact.from, `${path}.from`, { nullable: true });
  stringAt(fact.to, `${path}.to`, { nullable: true });
  arrayAt(fact.roles, `${path}.roles`, (value, itemPath) => stringAt(value, itemPath));
  validateTrace(fact.trace, `${path}.trace`);
  arrayAt(fact.traces, `${path}.traces`, validateTrace);
  if (!fact.traces.length) fail(`${path}.traces`, '至少包含一个追溯引用');
  if (fact.trace.quote !== fact.statement) fail(`${path}.trace.quote`, '与 statement 一致的原文引用');
  if (!fact.traces.some((trace) => trace.startOffset === fact.trace.startOffset && trace.endOffset === fact.trace.endOffset && trace.quote === fact.trace.quote)) {
    fail(`${path}.traces`, '包含主 trace');
  }
}

function validateOpenQuestion(item, path) {
  objectAt(item, path, ['id', 'statement', 'question', 'trace']);
  stringAt(item.id, `${path}.id`, { nonempty: true });
  stringAt(item.statement, `${path}.statement`, { nonempty: true });
  stringAt(item.question, `${path}.question`, { nonempty: true });
  validateTrace(item.trace, `${path}.trace`);
}

function validateConflict(item, path) {
  objectAt(item, path, ['id', 'fact_ids', 'description', 'traces']);
  stringAt(item.id, `${path}.id`, { nonempty: true });
  validateFactIds(item.fact_ids, `${path}.fact_ids`);
  stringAt(item.description, `${path}.description`, { nonempty: true });
  arrayAt(item.traces, `${path}.traces`, validateTrace);
  if (item.traces.length < 2) fail(`${path}.traces`, '至少包含两个冲突来源');
}

/** @param {unknown} requirement @returns {asserts requirement is StructuredRequirement} */
export function assertStructuredRequirement(requirement) {
  objectAt(requirement, 'StructuredRequirement', ['schemaVersion', 'title', 'facts', 'openQuestions', 'conflicts']);
  enumAt(requirement.schemaVersion, 'StructuredRequirement.schemaVersion', [STRUCTURED_REQUIREMENT_SCHEMA_VERSION]);
  stringAt(requirement.title, 'StructuredRequirement.title', { nonempty: true });
  arrayAt(requirement.facts, 'StructuredRequirement.facts', validateFact);
  arrayAt(requirement.openQuestions, 'StructuredRequirement.openQuestions', validateOpenQuestion);
  arrayAt(requirement.conflicts, 'StructuredRequirement.conflicts', validateConflict);
  if (!requirement.facts.length && !requirement.openQuestions.length) fail('StructuredRequirement.facts', '至少包含一个事实或待确认项');
  const ids = requirement.facts.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) fail('StructuredRequirement.facts[].id', '唯一 ID');
  const factIds = new Set(ids);
  requirement.conflicts.forEach((conflict, index) => {
    if (conflict.fact_ids.some((id) => !factIds.has(id))) fail(`StructuredRequirement.conflicts[${index}].fact_ids`, '现有事实 ID');
  });
}

function validateOptions(options, path) {
  objectAt(options, path, ['focusAreas', 'detailLevel', 'testLevel']);
  arrayAt(options.focusAreas, `${path}.focusAreas`, (area, itemPath) => enumAt(area, itemPath, FOCUS_AREAS));
  if (new Set(options.focusAreas).size !== options.focusAreas.length) fail(`${path}.focusAreas`, '不重复的数组');
  enumAt(options.detailLevel, `${path}.detailLevel`, DETAIL_LEVELS);
  enumAt(options.testLevel, `${path}.testLevel`, TEST_LEVELS);
}

function validateTestPoint(point, path) {
  objectAt(point, path, ['id', 'fact_ids', 'rule_version', 'title', 'description', 'type', 'priority', 'trace', 'needsProductConfirmation', 'conflict_ids']);
  stringAt(point.id, `${path}.id`, { nonempty: true });
  validateFactIds(point.fact_ids, `${path}.fact_ids`);
  stringAt(point.rule_version, `${path}.rule_version`, { nonempty: true });
  stringAt(point.title, `${path}.title`, { nonempty: true });
  stringAt(point.description, `${path}.description`);
  enumAt(point.type, `${path}.type`, TEST_TYPES);
  enumAt(point.priority, `${path}.priority`, PRIORITIES);
  validateTrace(point.trace, `${path}.trace`);
  if (typeof point.needsProductConfirmation !== 'boolean') fail(`${path}.needsProductConfirmation`, '布尔值');
  arrayAt(point.conflict_ids, `${path}.conflict_ids`, (id, itemPath) => stringAt(id, itemPath, { nonempty: true }));
  if (point.needsProductConfirmation !== (point.conflict_ids.length > 0)) fail(`${path}.conflict_ids`, '与 needsProductConfirmation 一致');
}

function validateTestCase(testCase, path) {
  objectAt(testCase, path, [
    'id', 'fact_ids', 'rule_version', 'title', 'type', 'priority', 'preconditions', 'steps', 'expectedResults',
    'status', 'testPointId', 'trace', 'needsProductConfirmation', 'conflict_ids'
  ]);
  stringAt(testCase.id, `${path}.id`, { nonempty: true });
  validateFactIds(testCase.fact_ids, `${path}.fact_ids`);
  stringAt(testCase.rule_version, `${path}.rule_version`, { nonempty: true });
  stringAt(testCase.title, `${path}.title`, { nonempty: true });
  enumAt(testCase.type, `${path}.type`, TEST_TYPES);
  enumAt(testCase.priority, `${path}.priority`, PRIORITIES);
  stringAt(testCase.preconditions, `${path}.preconditions`);
  arrayAt(testCase.steps, `${path}.steps`, (step, itemPath) => stringAt(step, itemPath, { nonempty: true }));
  arrayAt(testCase.expectedResults, `${path}.expectedResults`, (result, itemPath) => stringAt(result, itemPath, { nonempty: true }));
  if (!testCase.steps.length) fail(`${path}.steps`, '至少一个步骤');
  if (!testCase.expectedResults.length) fail(`${path}.expectedResults`, '至少一个预期结果');
  enumAt(testCase.status, `${path}.status`, ['draft', 'review', 'approved', 'deprecated']);
  stringAt(testCase.testPointId, `${path}.testPointId`, { nonempty: true });
  validateTrace(testCase.trace, `${path}.trace`);
  if (typeof testCase.needsProductConfirmation !== 'boolean') fail(`${path}.needsProductConfirmation`, '布尔值');
  arrayAt(testCase.conflict_ids, `${path}.conflict_ids`, (id, itemPath) => stringAt(id, itemPath, { nonempty: true }));
  if (testCase.needsProductConfirmation !== (testCase.conflict_ids.length > 0)) fail(`${path}.conflict_ids`, '与 needsProductConfirmation 一致');
}

function validateFactIds(factIds, path) {
  arrayAt(factIds, path, (id, itemPath) => stringAt(id, itemPath, { nonempty: true }));
  if (!factIds.length) fail(path, '至少包含一个事实 ID');
  if (new Set(factIds).size !== factIds.length) fail(path, '不重复的事实 ID');
}

function validateInsight(insight, path) {
  objectAt(insight, path, ['id', 'title', 'description', 'action']);
  for (const key of ['id', 'title', 'description', 'action']) stringAt(insight[key], `${path}.${key}`);
}

/** @param {unknown} plan @returns {asserts plan is TestPlan} */
export function assertTestPlan(plan) {
  objectAt(plan, 'TestPlan', [
    'schemaVersion', 'id', 'title', 'modelId', 'provider', 'generationMethod', 'ruleVersion',
    'testPoints', 'testCases', 'openQuestions', 'conflicts', 'insights', 'coverage', 'coverageDefinition', 'options', 'createdAt'
  ]);
  enumAt(plan.schemaVersion, 'TestPlan.schemaVersion', [TEST_PLAN_SCHEMA_VERSION]);
  for (const key of ['id', 'title', 'modelId', 'provider', 'ruleVersion', 'coverageDefinition', 'createdAt']) {
    stringAt(plan[key], `TestPlan.${key}`, { nonempty: true });
  }
  enumAt(plan.generationMethod, 'TestPlan.generationMethod', ['deterministic-rules']);
  arrayAt(plan.testPoints, 'TestPlan.testPoints', validateTestPoint);
  arrayAt(plan.testCases, 'TestPlan.testCases', validateTestCase);
  arrayAt(plan.insights, 'TestPlan.insights', validateInsight);
  arrayAt(plan.openQuestions, 'TestPlan.openQuestions', validateOpenQuestion);
  arrayAt(plan.conflicts, 'TestPlan.conflicts', validateConflict);
  numberAt(plan.coverage, 'TestPlan.coverage', { minimum: 0, maximum: 100 });
  validateOptions(plan.options, 'TestPlan.options');
  if (!Number.isFinite(Date.parse(plan.createdAt))) fail('TestPlan.createdAt', 'ISO-8601 日期字符串');
  const pointIds = plan.testPoints.map(({ id }) => id);
  if (new Set(pointIds).size !== pointIds.length) fail('TestPlan.testPoints[].id', '唯一 ID');
  const pointIdSet = new Set(pointIds);
  plan.testPoints.forEach((point, index) => {
    if (point.rule_version !== plan.ruleVersion) fail(`TestPlan.testPoints[${index}].rule_version`, '与 TestPlan.ruleVersion 一致');
  });
  plan.testCases.forEach((testCase, index) => {
    if (!pointIdSet.has(testCase.testPointId)) fail(`TestPlan.testCases[${index}].testPointId`, '现有测试点 ID');
    if (testCase.rule_version !== plan.ruleVersion) fail(`TestPlan.testCases[${index}].rule_version`, '与 TestPlan.ruleVersion 一致');
    const point = plan.testPoints.find(({ id }) => id === testCase.testPointId);
    if (testCase.fact_ids.some((factId) => !point.fact_ids.includes(factId))) {
      fail(`TestPlan.testCases[${index}].fact_ids`, '属于关联测试点的事实 ID');
    }
  });
}
