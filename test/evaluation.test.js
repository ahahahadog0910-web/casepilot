import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

import { createProvider } from '../server/providers/index.js';
import {
  compareNormalizedRequirements,
  evaluateNormalizedRequirement,
  evaluateTestPlanQuality,
  runModelEvaluation
} from '../server/evaluation.js';
import { STANDARDIZATION_EVALUATION_CASES } from '../tests/fixtures/evaluation-cases.js';
import {
  createEvaluationProviders,
  evaluationCaseLimit,
  evaluationDelayMs,
  evaluationModelNames,
  evaluationParameters
} from '../server/evaluation-config.js';

const execFileAsync = promisify(execFile);

test('evaluation measures normalized facts against a synthetic golden case', async () => {
  const provider = createProvider({ provider: 'mock' });
  const evaluationCase = STANDARDIZATION_EVALUATION_CASES[0];
  const result = await provider.parseRequirement({ requirement: evaluationCase.source });
  const metrics = evaluateNormalizedRequirement(
    result.requirement,
    evaluationCase.expectedFacts,
    evaluationCase.source
  );

  assert.equal(metrics.expectedFactCount, 3);
  assert.equal(metrics.actualFactCount, 3);
  assert.equal(metrics.matchedFactCount, 3);
  assert.equal(metrics.factRecall, 1);
  assert.equal(metrics.factPrecision, 1);
  assert.equal(metrics.citationPrecision, 1);
  assert.equal(metrics.ruleClassificationAccuracy, 1);
  assert.equal(metrics.duplicateRate, 0);
  assert.equal(metrics.openQuestionRecall, 1);
  assert.equal(metrics.conflictRecall, 1);
});

test('evaluation includes the deterministic test plan and executable quality summary', async () => {
  const provider = createProvider({ provider: 'mock' });
  const result = await runModelEvaluation({
    cases: [STANDARDIZATION_EVALUATION_CASES[0]],
    providers: [provider],
    parameters: { temperature: 0 }
  });
  const run = result.runs[0];

  assert.ok(run.testPlan.testPoints.length > 0);
  assert.ok(run.testPlan.testCases.length > 0);
  assert.ok(run.testPlan.testPoints.every((point) => point.fact_ids.length > 0));
  assert.ok(run.testPlan.testCases.every((testCase) => testCase.fact_ids.length > 0));
  assert.ok(run.testPlan.testCases.every((testCase) => testCase.rule_version === run.testPlan.ruleVersion));
  assert.equal(run.testPlan.generationMethod, 'deterministic-rules');
  assert.equal(run.testPlanQuality.ruleVersion, run.testPlan.ruleVersion);
  assert.equal(run.testPlanQuality.allArtifactsTraceable, true);
  assert.equal(run.testPlanQuality.allCasesExecutable, true);
  assert.equal(result.summary.planQuality.allArtifactsTraceableRate, 1);
  assert.equal(result.summary.byProvider['mock:mock-parser'].planQuality.allCasesExecutableRate, 1);
});

test('empty test plans do not pass traceability or executability quality gates', async () => {
  const provider = createProvider({ provider: 'mock' });
  const { requirement } = await provider.parseRequirement({
    requirement: STANDARDIZATION_EVALUATION_CASES[3].source
  });
  const quality = evaluateTestPlanQuality({
    testPoints: [],
    testCases: [],
    ruleVersion: '1.7.0',
    coverage: 0
  }, requirement);

  assert.equal(quality.testPointCount, 0);
  assert.equal(quality.testCaseCount, 0);
  assert.equal(quality.allArtifactsTraceable, false);
  assert.equal(quality.allCasesExecutable, false);
  assert.equal(quality.executableCaseCount, 0);
  assert.equal(quality.nonExecutableCaseCount, 0);
  assert.equal(quality.executableCaseRate, 0);
});

test('model evaluation keeps provider metadata and compares normalized outputs', async () => {
  const provider = createProvider({ provider: 'mock' });
  const result = await runModelEvaluation({
    cases: STANDARDIZATION_EVALUATION_CASES,
    providers: [provider],
    parameters: { temperature: 0 }
  });

  assert.equal(result.schemaVersion, '1.2.0');
  assert.equal(result.runs.length, STANDARDIZATION_EVALUATION_CASES.length);
  assert.equal(result.runs[0].provider, 'mock');
  assert.equal(result.runs[0].modelId, 'mock-parser');
  assert.equal(result.runs[0].parameters.temperature, 0);
  assert.equal(result.runs[0].metrics.factRecall, 1);
  assert.equal(result.runs[0].metrics.factPrecision, 1);
  assert.ok(result.runs[0].rawResponse);
  assert.ok(result.runs[0].testPlan.testCases.length > 0);
  assert.equal(result.runs[0].testPlanQuality.allArtifactsTraceable, true);
  assert.equal(result.runs[0].testPlanQuality.allCasesExecutable, true);
  assert.equal(result.summary.runCount, STANDARDIZATION_EVALUATION_CASES.length);
  assert.equal(result.summary.averages.factRecall, 1);
  assert.equal(result.summary.averages.duplicateRate, 0);
  assert.equal(result.summary.byProvider['mock:mock-parser'].runCount, STANDARDIZATION_EVALUATION_CASES.length);
  assert.equal(result.summary.byProvider['mock:mock-parser'].averages.factPrecision, 1);
  assert.ok(compareNormalizedRequirements(
    result.runs[0].normalizedRequirement,
    result.runs[0].normalizedRequirement
  ));
});

test('batch evaluation command runs the synthetic set with mock by default', async () => {
  const { stdout } = await execFileAsync(process.execPath, ['scripts/evaluate-models.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, MODEL_EVAL_PROVIDERS: 'mock' }
  });
  const report = JSON.parse(stdout);

  assert.equal(report.runs.length, STANDARDIZATION_EVALUATION_CASES.length);
  assert.ok(report.runs.every((run) => run.provider === 'mock'));
  assert.ok(report.runs.every((run) => run.metrics.factRecall === 1));
  const generatedRuns = report.runs.filter((run) => run.normalizedRequirement.facts.length > 0);
  assert.ok(generatedRuns.every((run) => run.testPlan.testCases.length > 0));
  assert.ok(generatedRuns.every((run) => run.testPlanQuality.allArtifactsTraceable));
  const qualityByCase = Object.fromEntries(generatedRuns.map((run) => [run.caseId, run.testPlanQuality]));
  assert.equal(qualityByCase['synthetic-order-rules-001'].allCasesExecutable, true);
  assert.equal(qualityByCase['synthetic-scheduled-action-003'].allCasesExecutable, true);
  assert.equal(qualityByCase['synthetic-permission-006'].allCasesExecutable, true);
  assert.equal(qualityByCase['synthetic-state-transition-002'].allCasesExecutable, false);
  assert.ok(qualityByCase['synthetic-state-transition-002'].draftCaseCount > 0);
  assert.equal(qualityByCase['synthetic-conflicting-bounds-005'].allCasesExecutable, false);
  assert.ok(qualityByCase['synthetic-conflicting-bounds-005'].productConfirmationCaseCount > 0);
});

test('evaluation config expands one provider across a model matrix', () => {
  const created = [];
  const providers = createEvaluationProviders({
    env: {
      MODEL_EVAL_PROVIDERS: 'bailian,mock',
      MODEL_EVAL_MODELS: 'qwen-plus, qwen-turbo'
    },
    baseConfig: { modelName: 'fallback-model', apiKey: 'test-key' },
    providerFactory: (providerConfig) => {
      created.push(providerConfig);
      return { id: providerConfig.provider, modelId: providerConfig.modelName };
    }
  });

  assert.deepEqual(created.map(({ provider, modelName }) => ({ provider, modelName })), [
    { provider: 'bailian', modelName: 'qwen-plus' },
    { provider: 'bailian', modelName: 'qwen-turbo' },
    { provider: 'mock', modelName: 'fallback-model' }
  ]);
  assert.equal(providers.length, 3);
  assert.deepEqual(evaluationModelNames({ MODEL_EVAL_MODELS: '' }, { modelName: 'fallback-model' }), ['fallback-model']);
  assert.deepEqual(evaluationParameters({
    MODEL_EVAL_PROVIDERS: 'bailian',
    MODEL_EVAL_MODELS: 'qwen-plus,qwen-turbo'
  }), {
    temperature: 0,
    detailLevel: 'standard',
    providerSelection: ['bailian'],
    modelSelection: ['qwen-plus', 'qwen-turbo'],
    caseLimit: 0,
    delayMs: 0
  });
  assert.equal(evaluationCaseLimit({ MODEL_EVAL_CASE_LIMIT: '2' }), 2);
  assert.equal(evaluationDelayMs({ MODEL_EVAL_DELAY_MS: '1500' }), 1500);
  assert.equal(evaluationCaseLimit({ MODEL_EVAL_CASE_LIMIT: '-1' }), 0);
});
