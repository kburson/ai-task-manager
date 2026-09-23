// @story #1769
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FINAL_GUIDANCE_CONTEXT_BUDGETS,
  GUIDANCE_CONTEXT_BUDGETS,
} from '../../../../task-tracker/lib/context-budgets.mjs';

test('keeps all fixed guidance ceilings in one immutable authority', () => {
  assert.deepEqual(GUIDANCE_CONTEXT_BUDGETS, {
    routerPlusPickup: { absolute: 5000, working: 4000 },
    clean: { absolute: 300, working: 240 },
    blocked: { absolute: 500, working: 400 },
    fullLifecycle: { absolute: 7000, working: 5600 },
  });
  assert.ok(Object.isFrozen(GUIDANCE_CONTEXT_BUDGETS));
  for (const values of Object.values(GUIDANCE_CONTEXT_BUDGETS)) {
    assert.ok(Object.isFrozen(values));
    assert.ok(values.working <= values.absolute * 0.8);
  }
  assert.deepEqual(FINAL_GUIDANCE_CONTEXT_BUDGETS.fullLifecycle, {
    absolute: 7000,
    target: 6000,
    working: 6500,
  });
});
