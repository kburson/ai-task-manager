// @story #1207
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../../../../..', import.meta.url);
const STATE_CALLERS = [
  'scripts/task-tracker/verbs/promote.mjs',
  'scripts/task-tracker/verbs/pull-next.mjs',
  'scripts/task-tracker/verbs/demote.mjs',
  'scripts/task-tracker/verbs/park.mjs',
  'scripts/task-tracker/verbs/plan.mjs',
  'scripts/task-tracker/lib/verifier-state-gate.mjs',
];

const PAGINATED_CALLERS = [
  'scripts/task-tracker/verbs/assign.mjs',
  ...STATE_CALLERS,
  'scripts/task-tracker/verbs/reconcile.mjs',
  'scripts/task-tracker/lib/move-state/github-mutation.mjs',
  'scripts/task-tracker/heal-backlog.mjs',
  'scripts/task-tracker/runtime.mjs',
  'scripts/gh/move-state.mjs',
  'scripts/gh/lib/live-state.mjs',
  'scripts/gh/lib/parent-status.mjs',
  'scripts/gh/lib/wave-admission.mjs',
  'scripts/gh/set-priority.mjs',
  'scripts/task-tracker/lib/stamp-start-time.mjs',
];

test('state-gated callers use the shared exact configured-project resolver and never nodes[0]', () => {
  for (const relative of STATE_CALLERS) {
    const source = readFileSync(new URL(relative, ROOT), 'utf8');
    assert.match(
      source,
      /resolveConfiguredProjectState/,
      `${relative} must use the shared resolver`
    );
    assert.doesNotMatch(source, /\?\?\s*nodes\[0\]/, `${relative} must fail closed, not fall back`);
  }
});

test('issue-side configured-project callers use the shared paginated lookup', () => {
  for (const relative of PAGINATED_CALLERS) {
    const source = readFileSync(new URL(relative, ROOT), 'utf8');
    assert.match(
      source,
      /fetchConfiguredProjectIssue/,
      `${relative} must use the shared paginated membership lookup`
    );
    assert.doesNotMatch(
      source,
      /projectItems\(first:\s*10\)/,
      `${relative} must not cap exact-project membership at ten`
    );
  }
});
