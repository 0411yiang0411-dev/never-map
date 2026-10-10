import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quotaState, LIMITS } from '../worker/quota.mjs';
const month = '2026-10';
const row = { month, verified: 1, bytes: 0, class_a: 0, class_b: 0 };
test('unknown or stale account usage fails closed, including month rollover', () => {
  assert.equal(quotaState(null, month).paused, true);
  assert.equal(quotaState({ ...row, verified: 0 }, month).paused, true);
  assert.equal(quotaState(row, '2026-11').paused, true);
});
for (const [key, limit] of Object.entries(LIMITS)) {
  test(`${key}: warn at 90%, stop before paid quota`, () => {
    assert.equal(quotaState({ ...row, [key]: limit * 0.899 }, month).warning, false);
    assert.equal(quotaState({ ...row, [key]: limit * 0.9 }, month).warning, true);
    assert.equal(quotaState({ ...row, [key]: limit * 0.99 }, month).paused, true);
    assert.equal(quotaState({ ...row, [key]: limit + 1 }, month).paused, true);
  });
}
test('corrupt usage pauses', () => assert.equal(quotaState({ ...row, bytes: -1 }, month).paused, true));
