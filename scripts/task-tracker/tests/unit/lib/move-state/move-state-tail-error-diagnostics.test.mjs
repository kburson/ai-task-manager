#!/usr/bin/env node
// @story #716
// Proves the move-state tail-step failure formatter produces a STRUCTURED
// diagnostic that names the failing step and its child exit code, rather than
// surfacing an arbitrary trailing stderr line. Three cases:
//
//   AC1 — a child exiting non-zero WITH stderr detail → the message names the
//         step and the exit code (`<step> exited <N>`), carrying the real detail.
//   AC2 — a benign informational line (the `[human-reviewer-audit] ... posted
//         full-auto audit comment` line, or any `[move-state:warn]` level-tagged
//         line) present on stderr is NEVER chosen as the failure reason.
//   AC3 — a non-zero child exit carrying no structured error detail yields an
//         explicit `child exited <N> with no error detail` fallback, not an
//         empty or misleading string.
//
// Also asserts the audit-timing informational lines are level-tagged so a
// consumer can recognize them as non-failure output (AC2 at the source).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatTailStepFailure } from '../../../../lib/move-state/post-commit-tail.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)) + '/../..';
const AUDIT_TIMING = resolve(HERE, '..', '..', 'lib', 'move-state', 'audit-timing.mjs');

test('AC1: a child exiting non-zero WITH stderr detail names the step and exit code', () => {
  const err = Object.assign(new Error('Command failed'), {
    code: 3,
    stderr: 'gh: could not resolve project field\n',
  });
  const msg = formatTailStepFailure({ name: 'syncEventFields', error: err });
  assert.match(msg, /syncEventFields/);
  assert.match(msg, /\bexited 3\b/);
  assert.match(msg, /could not resolve project field/);
});

test('AC1: exit code read from `.status` when `.code` is a string (spawn-style)', () => {
  const err = Object.assign(new Error('spawn'), {
    status: 7,
    stderr: 'boom detail',
  });
  const msg = formatTailStepFailure({ name: 'emitPhasePairRows', error: err });
  assert.match(msg, /emitPhasePairRows/);
  assert.match(msg, /\bexited 7\b/);
});

test('AC3: a non-zero exit with NO usable stderr detail yields the explicit fallback', () => {
  const err = Object.assign(new Error(''), { code: 2, stderr: '   \n' });
  const msg = formatTailStepFailure({ name: 'unparkDoneDependents', error: err });
  assert.match(msg, /unparkDoneDependents/);
  assert.match(msg, /child exited 2 with no error detail/);
  // Never empty / never just whitespace.
  assert.ok(msg.trim().length > 0);
});

test('AC2: a benign human-reviewer-audit line is NOT chosen as the failure reason', () => {
  const err = Object.assign(new Error('Command failed'), {
    code: 1,
    stderr:
      '[human-reviewer-audit] #716: posted full-auto audit comment (no human reviewer)\ngh: real failure line\n',
  });
  const msg = formatTailStepFailure({ name: 'emitFullAutoReviewAudit', error: err });
  // The real failure line is surfaced...
  assert.match(msg, /real failure line/);
  // ...and the benign informational line is filtered out of the reason.
  assert.doesNotMatch(msg, /posted full-auto audit comment/);
});

test('AC2: when ONLY benign informational lines are present, fall back to no-detail', () => {
  const err = Object.assign(new Error('Command failed'), {
    code: 4,
    stderr:
      '[human-reviewer-audit] #716: posted full-auto audit comment (no human reviewer)\n[move-state:warn] emitPhasePairRows failed post-commit: transient\n',
  });
  const msg = formatTailStepFailure({ name: 'emitOutOfBandAudit', error: err });
  // No benign line leaks in as the reason.
  assert.doesNotMatch(msg, /posted full-auto audit comment/);
  assert.doesNotMatch(msg, /\[move-state:warn\]/);
  // Explicit fallback instead.
  assert.match(msg, /child exited 4 with no error detail/);
});

test('a plain (non-child) Error throw without an exit code names the step and message', () => {
  const err = new Error('unexpected null deref');
  const msg = formatTailStepFailure({ name: 'syncTrackerState', error: err });
  assert.match(msg, /syncTrackerState/);
  assert.match(msg, /unexpected null deref/);
  // No fabricated exit code.
  assert.doesNotMatch(msg, /exited/);
});

test('AC2 (source): audit-timing informational lines are level-tagged as non-failure', () => {
  const src = readFileSync(AUDIT_TIMING, 'utf8');
  // The full-auto audit informational emission must carry an explicit
  // non-failure level tag so consumers never mistake it for an error.
  assert.match(src, /\[move-state:warn\]|\[human-reviewer-audit:info\]/);
});
