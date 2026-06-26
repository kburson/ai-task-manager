#!/usr/bin/env node
// @story #555
// Proves three representative fail-closed paths abort rather than swallow. Each
// corresponds to a row in docs/guides/fail-open-policy.md classified fail-closed:
//   1. State mutation     — move-state.mjs refuses unsanctioned invocation.
//   2. Marker loss         — findLostMarkers + MarkerLossError surface a dropped
//                            invariant marker.
//   3. Close precondition  — findCheckboxesTickedWithoutProof flags a tick that
//                            carries no execution evidence.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLostMarkers, findCheckboxesTickedWithoutProof } from '../../lib/body-invariants.mjs';
import { MarkerLossError } from '../../lib/issue-body-mutate.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const STATE_MUTATOR = resolve(__dir, '..', '..', '..', 'gh', 'move-state.mjs');

// --- 1. State mutation: the single Status mutator must refuse out-of-band use.
test('fail-closed: move-state refuses unsanctioned (non-verb, non-TTY) invocation', async () => {
  const result = await new Promise((res) => {
    // Clean env: strip the verb-context markers a sanctioned caller would set.
    const env = { ...process.env };
    delete env.AITM_VERB_CONTEXT;
    delete env.AITM_INTERNAL;
    const child = spawn('node', [STATE_MUTATOR, '999', 'develop'], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (b) => (stderr += b.toString()));
    child.on('close', (code) => res({ code, stderr }));
    child.stdin.end(); // non-TTY stdin
  });
  assert.notEqual(result.code, 0, 'must exit non-zero rather than mutate');
  assert.match(
    result.stderr,
    /internal|verb pipeline/i,
    'must explain it is internal and route through the verb pipeline'
  );
});

// --- 2. Marker loss: dropping an invariant marker must be detected + typed.
test('fail-closed: findLostMarkers reports a dropped invariant marker', () => {
  const base =
    'body\n<!-- aitm-fields: {"schema":1,"values":{}} -->\n<!-- aitm-body-version version="3" -->';
  const next = 'body\n<!-- aitm-body-version version="3" -->'; // aitm-fields dropped
  const lost = findLostMarkers(base, next);
  assert.ok(lost.includes('aitm-fields'), `expected aitm-fields in ${JSON.stringify(lost)}`);

  // No loss when both markers survive.
  assert.deepEqual(findLostMarkers(base, base), []);

  // The typed failure mutateIssueBody throws for this case.
  const err = new MarkerLossError(555, lost);
  assert.equal(err.name, 'MarkerLossError');
  assert.match(err.message, /aitm-fields/);
});

// --- 3. Close precondition: a tick without execution proof must be flagged.
test('fail-closed: findCheckboxesTickedWithoutProof flags an unproven tick', () => {
  const before = '- [ ] Acceptance criteria met';
  const afterUnproven = '- [x] Acceptance criteria met';
  const offenders = findCheckboxesTickedWithoutProof(before, afterUnproven);
  assert.equal(offenders.length, 1, 'an unproven tick must be flagged');

  const afterProven =
    '- [x] Acceptance criteria met <!-- aitm-dod-evidence:acs sha=abc123 ts=2026-06-26T00:00:00Z -->';
  assert.deepEqual(
    findCheckboxesTickedWithoutProof(before, afterProven),
    [],
    'a tick carrying canonical ac-evidence proof must pass'
  );
});
