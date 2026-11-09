/**
 * Server-facing schema API. The JSDoc definitions and strict validators live in the
 * domain contract module so server and domain consumers share one source of truth.
 */
export {
  STRUCTURED_REQUIREMENT_SCHEMA_VERSION,
  TEST_PLAN_SCHEMA_VERSION,
  REQUIREMENT_KINDS,
  RULE_TYPES,
  TEST_TYPES,
  PRIORITIES,
  TEST_LEVELS,
  DETAIL_LEVELS,
  FOCUS_AREAS,
  SCENARIO_GROUPS,
  SCENARIO_TYPES,
  assertStructuredRequirement,
  assertTestPlan
} from '../src/domain/model-contract.js';

/** @typedef {import('../src/domain/model-contract.js').RequirementFact} RequirementFact */
/** @typedef {import('../src/domain/model-contract.js').StructuredRequirement} StructuredRequirement */
/** @typedef {import('../src/domain/model-contract.js').TestPoint} TestPoint */
/** @typedef {import('../src/domain/model-contract.js').TestCase} TestCase */
/** @typedef {import('../src/domain/model-contract.js').TestPlan} TestPlan */
