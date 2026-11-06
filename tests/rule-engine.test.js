import assert from 'node:assert/strict';
import test from 'node:test';

import { generateRangeTestPoints } from '../server/rule-engine.js';
import { RANGE_EXPECTED } from './fixtures/range-expected.js';
import { RANGE_FACT } from './fixtures/range-fact.js';

test('fixed range fact generates the complete golden test point and cases', () => {
  const first = generateRangeTestPoints(RANGE_FACT);
  const second = generateRangeTestPoints(RANGE_FACT);
  assert.deepStrictEqual(first, RANGE_EXPECTED);
  assert.deepStrictEqual(second, first);
});
