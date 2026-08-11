// @story #1207
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../../../../..', import.meta.url);
const CALLERS = [
  'scripts/task-tracker/verbs/promote.mjs',
  'scripts/task-tracker/verbs/pull-next.mjs',
  'scripts/task-tracker/verbs/demote.mjs',
  'scripts/task-tracker/verbs/park.mjs',
  'scripts/task-tracker/verbs/plan.mjs',
  'scripts/task-tracker/lib/verifier-state-gate.mjs',
];

test('state-gated callers use the shared exact configured-project resolver and never nodes[0]', () => {
  for (const relative of CALLERS) {
    const source = readFileSync(new URL(relative, ROOT), 'utf8');
    assert.match(
      source,
      /resolveConfiguredProjectState/,
      `${relative} must use the shared resolver`
    );
    assert.doesNotMatch(source, /\?\?\s*nodes\[0\]/, `${relative} must fail closed, not fall back`);
  }
});
