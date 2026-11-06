import { assertStructuredRequirement } from './schemas.js';
import { REQUIREMENT_PROMPT_VERSION } from './prompt.js';

export const MODEL_EVALUATION_SCHEMA_VERSION = '1.0.0';

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

/**
 * Run the same synthetic cases through several Provider implementations and
 * preserve enough metadata to reproduce the comparison later.
 */
export async function runModelEvaluation({ cases, providers, parameters = {} }) {
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
      runs.push({
        caseId: evaluationCase.id,
        inputVersion: evaluationCase.version,
        provider: result.provider || provider.id,
        modelId: result.modelId || provider.modelId || provider.id,
        promptVersion: REQUIREMENT_PROMPT_VERSION,
        parameters: { ...parameters },
        rawResponse: result.rawResponse ?? null,
        normalizedRequirement: requirement,
        metrics
      });
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
  const averages = averageMetrics(runs);
  const byProvider = Object.fromEntries(
    [...new Set(runs.map((run) => `${run.provider}:${run.modelId}`))].map((key) => {
      const providerRuns = runs.filter((run) => `${run.provider}:${run.modelId}` === key);
      return [key, { runCount: providerRuns.length, averages: averageMetrics(providerRuns) }];
    })
  );
  return {
    schemaVersion: MODEL_EVALUATION_SCHEMA_VERSION,
    promptVersion: REQUIREMENT_PROMPT_VERSION,
    parameters: { ...parameters },
    runs,
    summary: { runCount: runs.length, averages, byProvider }
  };
}
