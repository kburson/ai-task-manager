// @story #159
// Regression: state-move verbs must derive elapsed time via
// `deriveStateMoveDelta` rather than hardcoding `activeSec: 0` / `activeMin: 0`
// at every buildRow callsite. A handful of legitimate first-row or
// no-body-loaded callsites are allowed when paired with a justifying comment
// in the immediately preceding 5 lines.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = path.resolve(here, '../../../..');

const FILES = [
  'scripts/task-tracker/verbs/promote.mjs',
  'scripts/task-tracker/verbs/close.mjs',
  'scripts/task-tracker/verbs/reject.mjs',
  'scripts/task-tracker/verbs/demote.mjs',
  'scripts/task-tracker/verbs/reconcile.mjs',
  'scripts/task-tracker/verbs/new.mjs',
  'scripts/task-tracker/verbs/review.mjs',
  'scripts/gh/move-state.mjs',
];

// Comment keywords that justify a literal-zero callsite.
const JUSTIFY_RE =
  /(first row|no prior|cascade|gate-refused|body not (yet )?(fetched|loaded)|honest 0\/0|no active session|fresh issue)/i;

const LITERAL_RE = /^\s*active(Sec|Min):\s*0,?\s*$/;

for (const rel of FILES) {
  test(`${rel} — no unjustified zero-active literals`, () => {
    const src = readFileSync(path.join(repoRoot, rel), 'utf8').split('\n');
    const offenders = [];
    for (let i = 0; i < src.length; i++) {
      if (!LITERAL_RE.test(src[i])) continue;
      // Inspect 5 lines preceding for a justifying comment.
      const window = src.slice(Math.max(0, i - 10), i).join('\n');
      if (!JUSTIFY_RE.test(window)) {
        offenders.push(`${rel}:${i + 1} ${src[i].trim()}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Unjustified zero-active literals (each needs a comment explaining why elapsed wasn't derived):\n${offenders.join('\n')}`
    );
  });
}
