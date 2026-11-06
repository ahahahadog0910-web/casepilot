import { config } from '../server/config.js';
import { runModelEvaluation } from '../server/evaluation.js';
import {
  createEvaluationProviders,
  evaluationCaseLimit,
  evaluationDelayMs,
  evaluationParameters
} from '../server/evaluation-config.js';
import { STANDARDIZATION_EVALUATION_CASES } from '../tests/fixtures/evaluation-cases.js';

const providers = createEvaluationProviders({ env: process.env, baseConfig: config });
const caseLimit = evaluationCaseLimit(process.env);
const delayMs = evaluationDelayMs(process.env);
const cases = caseLimit > 0
  ? STANDARDIZATION_EVALUATION_CASES.slice(0, caseLimit)
  : STANDARDIZATION_EVALUATION_CASES;

const report = await runModelEvaluation({
  cases,
  providers,
  parameters: evaluationParameters(process.env),
  delayMs
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
