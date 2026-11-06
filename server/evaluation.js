import { assertStructuredRequirement } from './schemas.js';
import { REQUIREMENT_PROMPT_VERSION } from './prompt.js';
import { generateTestPlan, RULE_ENGINE_VERSION } from './rule-engine.js';

export const MODEL_EVALUATION_SCHEMA_VERSION = '1.2.0';

function canonicalFact(fact) {
  return JSON.stringify({
    kind: fact.kind,
    rule_type: fact.rule_type,
    field: fact.field,
    statement: fact.statement,
    value: fact.value,
    minimum: fact.minimum,
    maximum: fact.maximum,
    values: fact.values,
    unit: fact.unit,
    from: fact.from,
    to: fact.to,
    roles: fact.roles
  });
}

function expectedFactKey(fact) {
  return JSON.stringify({
    rule_type: fact.rule_type,
    field: fact.field,
    statement: fact.statement,
    value: fact.value ?? null,
    minimum: fact.minimum ?? null,
    maximum: fact.maximum ?? null,
    values: fact.values || [],
    unit: fact.unit || '',
    from: fact.from ?? null,
    to: fact.to ?? null,
    roles: fact.roles || []
  });
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 1;
}

function statementSet(items = []) {
  return new Set(items.map((item) => item.statement));
}

function conflictKey(conflict) {
  return JSON.stringify([...conflict.fact_ids].sort());
}

function hasValidTrace(fact, source) {
  return source.slice(fact.trace.startOffset, fact.trace.endOffset) === fact.trace.quote
    && source.includes(fact.trace.quote);
}

/**
 * Evaluate a normalized requirement against a small, hand-authored synthetic
 * expectation. The evaluator never generates test points or cases.
 */
export function evaluateNormalizedRequirement(
  requirement,
  expectedFacts,
  source,
  { expectedOpenQuestions = [], expectedConflicts = [] } = {}
) {
  assertStructuredRequirement(requirement);
  const actualKeys = requirement.facts.map(canonicalFact);
  const expectedKeys = expectedFacts.map(expectedFactKey);
  const expectedSet = new Set(expectedKeys);
  const matchedExpectedKeys = new Set(
    requirement.facts
      .filter((fact) => expectedSet.has(expectedFactKey(fact)))
      .map(expectedFactKey)
  );
  const actualKeyCounts = new Map();
  actualKeys.forEach((key) => actualKeyCounts.set(key, (actualKeyCounts.get(key) || 0) + 1));
  const duplicateCount = [...actualKeyCounts.values()]
    .reduce((total, count) => total + Math.max(0, count - 1), 0);
  const validCitations = requirement.facts.filter((fact) => hasValidTrace(fact, source)).length;
  const expectedByStatement = new Map(expectedFacts.map((fact) => [fact.statement, fact.rule_type]));
  const correctlyClassified = requirement.facts.filter((fact) => expectedByStatement.get(fact.statement) === fact.rule_type).length;
  const expectedQuestionStatements = statementSet(expectedOpenQuestions);
  const actualQuestionStatements = statementSet(requirement.openQuestions);
  const matchedQuestionStatements = [...actualQuestionStatements].filter((statement) => expectedQuestionStatements.has(statement));
  const expectedConflictKeys = new Set(expectedConflicts.map(conflictKey));
  const actualConflictKeys = new Set(requirement.conflicts.map(conflictKey));
  const matchedConflictKeys = [...actualConflictKeys].filter((key) => expectedConflictKeys.has(key));

  return {
    expectedFactCount: expectedFacts.length,
    actualFactCount: requirement.facts.length,
    matchedFactCount: matchedExpectedKeys.size,
    factRecall: ratio(matchedExpectedKeys.size, expectedFacts.length),
    factPrecision: ratio(matchedExpectedKeys.size, requirement.facts.length),
    citationPrecision: ratio(validCitations, requirement.facts.length),
    ruleClassificationAccuracy: ratio(correctlyClassified, requirement.facts.length),
    duplicateRate: requirement.facts.length ? duplicateCount / requirement.facts.length : 0,
    expectedOpenQuestionCount: expectedQuestionStatements.size,
    actualOpenQuestionCount: actualQuestionStatements.size,
    openQuestionRecall: ratio(matchedQuestionStatements.length, expectedQuestionStatements.size),
    openQuestionPrecision: ratio(matchedQuestionStatements.length, actualQuestionStatements.size),
    expectedConflictCount: expectedConflictKeys.size,
    actualConflictCount: actualConflictKeys.size,
    conflictRecall: ratio(matchedConflictKeys.length, expectedConflictKeys.size),
    conflictPrecision: ratio(matchedConflictKeys.length, actualConflictKeys.size),
    normalizedSignature: [...actualKeys].sort()
  };
}

export function compareNormalizedRequirements(left, right) {
  assertStructuredRequirement(left);
  assertStructuredRequirement(right);
  return JSON.stringify(left.facts.map(canonicalFact).sort()) === JSON.stringify(right.facts.map(canonicalFact).sort());
}

function wait(milliseconds) {
  return milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();
}

function hasNonemptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasTraceableFactIds(item, factIds) {
  return Array.isArray(item.fact_ids)
    && item.fact_ids.length > 0
    && item.fact_ids.every((factId) => factIds.has(factId));
}

function isExecutableCase(testCase) {
  if (testCase.status === 'draft') return false;
  const hasActionStep = Array.isArray(testCase.steps)
    && testCase.steps.some((step) => /(?:将.{1,48}(?:设为|设置为)|设置|执行|点击|选择|开启|关闭|提交|保存|创建|修改|删除|取消|发送|接收|进入|跳转|切换|上传|下载|触发|推进|使条件|在.{0,32}内执行|清空|填写|更新|统计|操作|访问)/.test(step));
  const hasObservationStep = Array.isArray(testCase.steps)
    && testCase.steps.some((step) => /(?:读取|检查|查看|观察|确认|校验|判定|统计|查询)/.test(step));
  const expectedResultsAreObservable = Array.isArray(testCase.expectedResults)
    && testCase.expectedResults.every((result) => !/(?:符合需求原文|满足原文|按原文执行|符合预期|待补充|需补充|尚未确认|不设定判定预期)/.test(result)
      && /(?:通过|不通过|未执行|不执行|执行|展示|显示|隐藏|消失|跳转|返回|更新|保存|状态|读取到|一致|不一致|允许|可以|无法|拒绝|接受|上限|下限|不能为空|未被|没有)/.test(result));
  return hasNonemptyString(testCase.preconditions)
    && Array.isArray(testCase.steps)
    && testCase.steps.length > 0
    && testCase.steps.every(hasNonemptyString)
    && hasActionStep
    && hasObservationStep
    && Array.isArray(testCase.expectedResults)
    && testCase.expectedResults.length > 0
    && testCase.expectedResults.every(hasNonemptyString)
    && expectedResultsAreObservable;
}

/**
 * Summarize deterministic output quality without judging model prose.
 * Model differences should be visible in normalized facts and in the
 * rule artifacts produced from those facts.
 */
export function evaluateTestPlanQuality(plan, requirement) {
  const factIds = new Set(requirement.facts.map((fact) => fact.id));
  const artifactCount = plan.testPoints.length + plan.testCases.length;
  const executableCaseCount = plan.testCases.filter(isExecutableCase).length;
  return {
    testPointCount: plan.testPoints.length,
    testCaseCount: plan.testCases.length,
    draftCaseCount: plan.testCases.filter((testCase) => testCase.status === 'draft').length,
    reviewCaseCount: plan.testCases.filter((testCase) => testCase.status === 'review').length,
    approvedCaseCount: plan.testCases.filter((testCase) => testCase.status === 'approved').length,
    executableCaseCount,
    nonExecutableCaseCount: plan.testCases.length - executableCaseCount,
    executableCaseRate: plan.testCases.length ? executableCaseCount / plan.testCases.length : 0,
    productConfirmationCaseCount: plan.testCases.filter((testCase) => testCase.needsProductConfirmation).length,
    ruleVersion: plan.ruleVersion,
    coverage: plan.coverage,
    allArtifactsTraceable: artifactCount > 0
      && plan.testPoints.every((point) => hasTraceableFactIds(point, factIds))
      && plan.testCases.every((testCase) => hasTraceableFactIds(testCase, factIds)),
    allCasesExecutable: plan.testCases.length > 0 && executableCaseCount === plan.testCases.length
  };
}

/**
 * Run the same synthetic cases through several Provider implementations,
 * normalize the model response, and generate the final deterministic plan.
 */
export async function runModelEvaluation({ cases, providers, parameters = {}, delayMs = 0 }) {
  const runs = [];
  for (const provider of providers) {
    for (const evaluationCase of cases) {
      const result = await provider.parseRequirement({ requirement: evaluationCase.source });
      const requirement = result.requirement;
      const metrics = evaluateNormalizedRequirement(
        requirement,
        evaluationCase.expectedFacts,
        evaluationCase.source,
        {
          expectedOpenQuestions: evaluationCase.expectedOpenQuestions,
          expectedConflicts: evaluationCase.expectedConflicts
        }
      );
      const testPlan = generateTestPlan(requirement, {
        detailLevel: parameters.detailLevel || 'standard'
      }, {
        provider: result.provider || provider.id,
        modelId: result.modelId || provider.modelId || provider.id
      });
      runs.push({
        caseId: evaluationCase.id,
        inputVersion: evaluationCase.version,
        provider: result.provider || provider.id,
        modelId: result.modelId || provider.modelId || provider.id,
        promptVersion: REQUIREMENT_PROMPT_VERSION,
        parameters: { ...parameters },
        rawResponse: result.rawResponse ?? null,
        normalizedRequirement: requirement,
        metrics,
        testPlan,
        testPlanQuality: evaluateTestPlanQuality(testPlan, requirement)
      });
      await wait(delayMs);
    }
  }
  const metricNames = [
    'factRecall', 'factPrecision', 'citationPrecision', 'ruleClassificationAccuracy',
    'duplicateRate', 'openQuestionRecall', 'openQuestionPrecision',
    'conflictRecall', 'conflictPrecision'
  ];
  const averageMetrics = (items) => Object.fromEntries(metricNames.map((name) => [
    name,
    items.length ? items.reduce((total, run) => total + run.metrics[name], 0) / items.length : 1
  ]));
  const planQualityMetricNames = [
    'testPointCount', 'testCaseCount', 'draftCaseCount', 'reviewCaseCount',
    'approvedCaseCount', 'executableCaseCount', 'nonExecutableCaseCount', 'executableCaseRate',
    'productConfirmationCaseCount', 'coverage'
  ];
  const averagePlanQuality = (items) => ({
    ...Object.fromEntries(planQualityMetricNames.map((name) => [
      name,
      items.length
        ? items.reduce((total, run) => total + run.testPlanQuality[name], 0) / items.length
        : 0
    ])),
    allArtifactsTraceableRate: ratio(
      items.filter((run) => run.testPlanQuality.allArtifactsTraceable).length,
      items.length
    ),
    allCasesExecutableRate: ratio(
      items.filter((run) => run.testPlanQuality.allCasesExecutable).length,
      items.length
    ),
    ruleVersion: RULE_ENGINE_VERSION
  });
  const averages = averageMetrics(runs);
  const byProvider = Object.fromEntries(
    [...new Set(runs.map((run) => `${run.provider}:${run.modelId}`))].map((key) => {
      const providerRuns = runs.filter((run) => `${run.provider}:${run.modelId}` === key);
      return [key, {
        runCount: providerRuns.length,
        averages: averageMetrics(providerRuns),
        planQuality: averagePlanQuality(providerRuns)
      }];
    })
  );
  return {
    schemaVersion: MODEL_EVALUATION_SCHEMA_VERSION,
    promptVersion: REQUIREMENT_PROMPT_VERSION,
    parameters: { ...parameters },
    runs,
    summary: {
      runCount: runs.length,
      averages,
      planQuality: averagePlanQuality(runs),
      byProvider
    }
  };
}
