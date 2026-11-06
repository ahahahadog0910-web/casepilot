import { config } from '../server/config.js';
import { runModelEvaluation } from '../server/evaluation.js';
import {
  createEvaluationProviders,
  evaluationParameters
} from '../server/evaluation-config.js';
import { STANDARDIZATION_EVALUATION_CASES } from '../tests/fixtures/evaluation-cases.js';

const providers = createEvaluationProviders({ env: process.env, baseConfig: config });

const report = await runModelEvaluation({
  cases: STANDARDIZATION_EVALUATION_CASES,
  providers,
  parameters: evaluationParameters(process.env)
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
