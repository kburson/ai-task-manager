// Regression: deriveStateMoveDelta MUST be called with the timing-comment
// body (where timing rows actually live), not the issue body. Passing the
// issue body silently returns {0,0} because lastRowTsFromBody finds no
// table rows there. Observed on #162: every move row recorded a=0 i=0 and
// the Review-delta rolled up to 0:00:00 actual.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

const FILES = [
  'scripts/task-tracker/verbs/promote.mjs',
  'scripts/task-tracker/verbs/reconcile.mjs',
  'scripts/gh/move-state.mjs',
];

// Allowed argument shapes for the first arg of deriveStateMoveDelta:
//   - any identifier containing "timing" (case-insensitive) — i.e. the
//     timing-comment body
//   - the literal '' (empty string) — only legal when the immediately
//     preceding 10 lines carry a justifying comment (gate-refused etc.)
const CALL_RE = /deriveStateMoveDelta\(\s*([^,\)]+?)\s*,/g;
const JUSTIFY_RE = /(gate-refused|no prior|honest 0\/0|empty by design|first row)/i;

for (const rel of FILES) {
  test(`${rel} — deriveStateMoveDelta receives timing-comment body`, () => {
    const src = readFileSync(path.join(repoRoot, rel), 'utf8');
    const lines = src.split('\n');
    const offenders = [];
    let m;
    CALL_RE.lastIndex = 0;
    while ((m = CALL_RE.exec(src)) !== null) {
      const arg = m[1].trim();
      const lineIdx = src.slice(0, m.index).split('\n').length - 1;
      if (/timing/i.test(arg)) continue;
      if (arg === "''" || arg === '""') {
        const window = lines.slice(Math.max(0, lineIdx - 10), lineIdx).join('\n');
        if (JUSTIFY_RE.test(window)) continue;
      }
      offenders.push(`${rel}:${lineIdx + 1}  deriveStateMoveDelta(${arg}, …)`);
    }
    assert.deepEqual(
      offenders,
      [],
      `deriveStateMoveDelta must be called with the timing-comment body (var name must contain "timing"). The issue body never has timing rows.\n${offenders.join('\n')}`
    );
  });
}
