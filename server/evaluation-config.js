import { config as defaultConfig } from './config.js';
import { createProvider as defaultCreateProvider } from './providers/index.js';

function csv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function evaluationProviderNames(env = process.env) {
  return csv(env.MODEL_EVAL_PROVIDERS || 'mock');
}

export function evaluationModelNames(env = process.env, baseConfig = defaultConfig) {
  const selected = csv(env.MODEL_EVAL_MODELS);
  return selected.length ? selected : [baseConfig.modelName];
}

export function evaluationParameters(env = process.env) {
  return {
    temperature: 0,
    detailLevel: 'standard',
    providerSelection: evaluationProviderNames(env),
    modelSelection: evaluationModelNames(env)
  };
}

/**
 * Build the provider list for one reproducible evaluation run.
 * Mock is always instantiated once; configured model providers are expanded
 * across MODEL_EVAL_MODELS so every model sees the identical case set.
 */
export function createEvaluationProviders({
  env = process.env,
  baseConfig = defaultConfig,
  providerFactory = defaultCreateProvider
} = {}) {
  const providers = [];
  const modelNames = evaluationModelNames(env, baseConfig);

  for (const provider of evaluationProviderNames(env)) {
    if (provider === 'mock') {
      providers.push(providerFactory({ ...baseConfig, provider }));
      continue;
    }
    for (const modelName of modelNames) {
      providers.push(providerFactory({ ...baseConfig, provider, modelName }));
    }
  }
  return providers;
}
