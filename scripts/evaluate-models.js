import { config } from '../server/config.js';
import { runModelEvaluation } from '../server/evaluation.js';
import { createProvider } from '../server/providers/index.js';
import { STANDARDIZATION_EVALUATION_CASES } from '../tests/fixtures/evaluation-cases.js';

function providerNames() {
  return (process.env.MODEL_EVAL_PROVIDERS || 'mock')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function evaluationParameters() {
  return {
    temperature: 0,
    detailLevel: 'standard',
    providerSelection: providerNames()
  };
}

const providers = providerNames().map((provider) => createProvider({
  ...config,
  provider
}));

const report = await runModelEvaluation({
  cases: STANDARDIZATION_EVALUATION_CASES,
  providers,
  parameters: evaluationParameters()
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
