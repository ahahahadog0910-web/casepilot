import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

import { createProvider } from '../server/providers/index.js';
import {
  compareNormalizedRequirements,
  evaluateNormalizedRequirement,
  runModelEvaluation
} from '../server/evaluation.js';
import { STANDARDIZATION_EVALUATION_CASES } from '../tests/fixtures/evaluation-cases.js';
import {
  createEvaluationProviders,
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

test('model evaluation keeps provider metadata and compares normalized outputs', async () => {
  const provider = createProvider({ provider: 'mock' });
  const result = await runModelEvaluation({
    cases: STANDARDIZATION_EVALUATION_CASES,
    providers: [provider],
    parameters: { temperature: 0 }
  });

  assert.equal(result.schemaVersion, '1.0.0');
  assert.equal(result.runs.length, STANDARDIZATION_EVALUATION_CASES.length);
  assert.equal(result.runs[0].provider, 'mock');
  assert.equal(result.runs[0].modelId, 'mock-parser');
  assert.equal(result.runs[0].parameters.temperature, 0);
  assert.equal(result.runs[0].metrics.factRecall, 1);
  assert.equal(result.runs[0].metrics.factPrecision, 1);
  assert.ok(result.runs[0].rawResponse);
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
    modelSelection: ['qwen-plus', 'qwen-turbo']
  });
});
