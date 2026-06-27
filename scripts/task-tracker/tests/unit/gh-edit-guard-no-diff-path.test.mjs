// @story #566
// Proves the unreachable post-hard-refusal diff path was removed from
// `evaluateGhEdit`. The guard now resolves every `gh issue edit` via exactly
// two live exits: a `source === 'none'` pass-through and the #361 hard refusal
// of `--body` / `--body-file`. It must reach neither `checkBodyChange` nor the
// old `currentBody = ''` fail-open — even when invoked with no fetch/read deps.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { evaluateGhEdit } from '../../lib/gh-edit-guard.mjs';

const GUARD_SRC = readFileSync(
  fileURLToPath(new URL('../../lib/gh-edit-guard.mjs', import.meta.url)),
  'utf8'
);
// Executable source only — strip `//` line-comments so an assertion targeting a
// removed code construct is not tripped by a comment that *names* it (e.g. the
// comment documenting why the `currentBody = ''` fail-open was deleted).
const GUARD_CODE = GUARD_SRC.replace(/\/\/[^\n]*/g, '');

// AC1 — --body / --body-file resolve via the #361 hard refusal even when
// evaluateGhEdit is called with NO fetchCurrentBody/readBodyFile/resolveCurrentState
// deps. A reachable diff path would have thrown or produced a marker-loss reason.
// The hard-refusal reason is fixed text; the removed diff path produced
// content-specific refusals ("...would drop hidden marker X", "stale snapshot").
// Matching the hard-refusal signature proves the live exit was taken, not the
// deleted diff path — and it holds with no fetch/read deps wired in.
const DIFF_PATH_REASON = /would drop|stale snapshot|legacy/i;

test('AC1: --body-file is hard-refused with no deps', () => {
  const res = evaluateGhEdit({ command: 'gh issue edit 566 --body-file /tmp/x.md' });
  assert.equal(res.block, true);
  assert.match(res.reason, /direct body writes from Bash are forbidden/);
  assert.doesNotMatch(res.reason, DIFF_PATH_REASON, 'must not reach the deleted diff path');
});

test('AC1: --body is hard-refused with no deps', () => {
  const res = evaluateGhEdit({ command: 'gh issue edit #566 --body "rewritten"' });
  assert.equal(res.block, true);
  assert.match(res.reason, /direct body writes from Bash are forbidden/);
  assert.doesNotMatch(res.reason, DIFF_PATH_REASON, 'must not reach the deleted diff path');
});

// AC2 — the source no longer contains the fail-open or any fetch wiring.
test('AC2: guard source has no currentBody fail-open', () => {
  assert.doesNotMatch(
    GUARD_CODE,
    /currentBody\s*=\s*''/,
    "the `currentBody = ''` fail-open must be gone from executable code"
  );
});

test('AC2: guard source has no fetchCurrentBody / resolveCurrentState reference', () => {
  assert.doesNotMatch(GUARD_CODE, /fetchCurrentBody/);
  assert.doesNotMatch(GUARD_CODE, /resolveCurrentState/);
});

test('AC2: evaluateGhEdit takes only { command }', () => {
  // A single destructured `command` param — no vestigial dep params.
  assert.match(GUARD_CODE, /export function evaluateGhEdit\(\{\s*command\s*\}\)/);
});

// Non-body edits still pass cleanly.
test('non-body edits still pass', () => {
  assert.deepEqual(evaluateGhEdit({ command: 'gh issue edit 566 --add-label BLOCKED' }), {
    block: false,
  });
  assert.deepEqual(evaluateGhEdit({ command: 'gh issue edit 566 --title "new title"' }), {
    block: false,
  });
  assert.deepEqual(evaluateGhEdit({ command: 'echo not an edit' }), { block: false });
});
