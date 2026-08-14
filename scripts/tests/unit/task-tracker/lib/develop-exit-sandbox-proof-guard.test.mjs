#!/usr/bin/env node
// @story #270
// Unit tests for the develop→test sandbox-proof guard (#270).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  developExitSandboxProofGuard,
  GUARD_ID,
} from '../../../../task-tracker/lib/develop-exit-sandbox-proof-guard.mjs';

function bodyWithDodVerified() {
  return [
    '## Scope',
    'stuff',
    '',
    '<!-- aitm-dod-verified: abc1234:2026-06-08T00:00:00.000Z -->',
    '',
  ].join('\n');
}

function bodyWithoutDodVerified() {
  return ['## Scope', 'stuff', ''].join('\n');
}

test('guard accepts develop→test when dod-verified marker is present', async () => {
  const r = await developExitSandboxProofGuard.run({
    issueNumber: 270,
    fromState: 'develop',
    toState: 'test',
    body: bodyWithDodVerified(),
  });
  assert.equal(r.ok, true);
});

test('guard refuses develop→test when dod-verified marker is absent', async () => {
  const r = await developExitSandboxProofGuard.run({
    issueNumber: 270,
    fromState: 'develop',
    toState: 'test',
    body: bodyWithoutDodVerified(),
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /develop-to-test-sandbox-proof-missing/);
  assert.match(r.reason, /#270/);
  assert.ok(Array.isArray(r.blockers) && r.blockers.length === 1);
});

test('guard fails open for non-test target transitions', async () => {
  const r = await developExitSandboxProofGuard.run({
    issueNumber: 270,
    fromState: 'develop',
    toState: 'review',
    body: bodyWithoutDodVerified(),
  });
  assert.equal(r.ok, true);
});

test('guard fails open when ctx.body is not a string', async () => {
  const r = await developExitSandboxProofGuard.run({
    issueNumber: 270,
    fromState: 'develop',
    toState: 'test',
  });
  assert.equal(r.ok, true);
});

test('guard id is stable', () => {
  assert.equal(GUARD_ID, 'develop-exit-sandbox-proof');
  assert.equal(developExitSandboxProofGuard.id, 'develop-exit-sandbox-proof');
});

// #270 AC5 — parity. Both /task test (direct) and /task promote N test (alias)
// flow through verbs/test.mjs → moveState → runGuards. The same guard
// instance fires for both, so given structurally identical ctx, the verdicts
// are bitwise identical. This pins the parity at the guard layer.
test('guard parity: identical ctx from /task test path and promote alias path yields identical verdict', async () => {
  const ctxFromTaskTest = {
    issueNumber: 270,
    fromState: 'develop',
    toState: 'test',
    body: bodyWithDodVerified(),
  };
  const ctxFromPromote = {
    issueNumber: 270,
    fromState: 'develop',
    toState: 'test',
    body: bodyWithDodVerified(),
  };
  const a = await developExitSandboxProofGuard.run(ctxFromTaskTest);
  const b = await developExitSandboxProofGuard.run(ctxFromPromote);
  assert.deepEqual(a, b);

  // Refusal parity on the red path: same missing marker, same refusal text.
  const redA = await developExitSandboxProofGuard.run({
    ...ctxFromTaskTest,
    body: bodyWithoutDodVerified(),
  });
  const redB = await developExitSandboxProofGuard.run({
    ...ctxFromPromote,
    body: bodyWithoutDodVerified(),
  });
  assert.deepEqual(redA, redB);
  assert.equal(redA.ok, false);
});

// #270 — Registered in the develop state-object's exit list.
test('guard is registered on GUARDS.develop.exit', async () => {
  // Side-effect import: states/develop.mjs registers the guard at load time
  // via guard-bootstrap; but in this lightweight test we assert the state
  // module exports the guard in its exitGuards list.
  const developState = (await import('../../../../task-tracker/states/develop.mjs')).default;
  const ids = developState.exitGuards.map((g) => g.id);
  assert.ok(
    ids.includes('develop-exit-sandbox-proof'),
    `expected develop.exitGuards to include develop-exit-sandbox-proof, got ${JSON.stringify(ids)}`
  );
});
