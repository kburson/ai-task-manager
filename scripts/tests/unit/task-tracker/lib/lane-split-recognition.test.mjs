#!/usr/bin/env node
// @story #934
// AC3 — `STANDARD_DOD_COMMANDS` recognizes `npm run test:slow`, and the
// verifier-state gate's RESTRICTED_COMMAND_RE matches it, so the slow lane (like
// test:all) cannot run before the Test stage. The fast lane (`npm test`) stays
// unrestricted so its targeted develop use is unaffected — but because the
// two-lane `tests` stamp declares BOTH lanes, gating the slow lane keeps the
// whole stamp barred pre-Test (Develop-Phase Verification Contract preserved).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { STANDARD_DOD_COMMANDS } from '../../../../task-tracker/lib/evidence-markers.mjs';
import { isRestrictedVerifierCommand } from '../../../../task-tracker/lib/verifier-state-gate.mjs';

test('STANDARD_DOD_COMMANDS recognizes both lanes and the legacy floor', () => {
  assert.ok(STANDARD_DOD_COMMANDS.has('npm test'));
  assert.ok(STANDARD_DOD_COMMANDS.has('npm run test:slow'));
  assert.ok(STANDARD_DOD_COMMANDS.has('npm run test:all'));
});

test('RESTRICTED_COMMAND_RE gates the slow lane and legacy floor, not the fast lane', () => {
  assert.ok(isRestrictedVerifierCommand('npm run test:slow'), 'slow lane restricted');
  assert.ok(isRestrictedVerifierCommand('npm run test:all'), 'legacy floor restricted');
  assert.ok(!isRestrictedVerifierCommand('npm test'), 'fast lane unrestricted');
  assert.ok(!isRestrictedVerifierCommand('npm run lint'), 'lint unrestricted');
});
