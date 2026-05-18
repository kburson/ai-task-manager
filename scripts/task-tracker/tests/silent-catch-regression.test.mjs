// #168 — Anti-pattern lint: empty `catch {}` or `catch (_) {}` blocks
// must not wrap correctness-critical writeIssueBody / postTimingEvent
// calls. Offenders must either retry+warn or carry a justifying comment
// in the preceding 5 lines (e.g. `// audit-only, not correctness-critical`).

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
  'scripts/task-tracker/verbs/demote.mjs',
  'scripts/gh/move-state.mjs',
];

const CRITICAL_RE = /writeIssueBody\s*\(/;
const TRY_RE = /\btry\s*\{/g;
const EMPTY_CATCH_RE = /catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*\n\s*)*\}/;
const JUSTIFY_RE =
  /(audit-only|best-effort|board.*already.*committed|board is already|gate-refused|body fetch itself failed)/i;

function findMatchingClose(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

for (const rel of FILES) {
  test(`${rel} — no silent catch around writeIssueBody`, () => {
    const src = readFileSync(path.join(repoRoot, rel), 'utf8');
    const offenders = [];
    let m;
    TRY_RE.lastIndex = 0;
    while ((m = TRY_RE.exec(src)) !== null) {
      const openIdx = m.index + m[0].lastIndexOf('{');
      const closeIdx = findMatchingClose(src, openIdx);
      if (closeIdx === -1) continue;
      const tryBlock = src.slice(openIdx, closeIdx + 1);
      if (!CRITICAL_RE.test(tryBlock)) continue;
      const afterClose = src.slice(closeIdx + 1, closeIdx + 400);
      const catchMatch = afterClose.match(EMPTY_CATCH_RE);
      if (!catchMatch) continue;
      const lineIdx = src.slice(0, m.index).split('\n').length;
      const preLines = src
        .split('\n')
        .slice(Math.max(0, lineIdx - 6), lineIdx)
        .join('\n');
      const catchWindow = afterClose.slice(0, catchMatch.index + catchMatch[0].length);
      if (JUSTIFY_RE.test(preLines) || JUSTIFY_RE.test(catchWindow)) continue;
      offenders.push(`${rel}:${lineIdx}`);
    }
    assert.deepEqual(
      offenders,
      [],
      `Empty catch around writeIssueBody needs retry+warn OR a justifying comment:\n${offenders.join('\n')}`
    );
  });
}
