// Tests for scripts/task-tracker/lib/blocked-by-guard.mjs and the
// guard-bootstrap that registers it at every exit slot (#286).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blockedByGuard, GUARD_ID } from '../lib/blocked-by-guard.mjs';
import { GUARDS, runGuards } from '../lib/guard-registry.mjs';
import { bootstrapGuards, EXIT_STATES } from '../lib/guard-bootstrap.mjs';

function makeCtx({ body = '', stateMap = {} } = {}) {
  return {
    issueNumber: 100,
    repo: 'owner/name',
    fromState: 'develop',
    toState: 'test',
    body,
    fetchBlockerState: async (n) => stateMap[n] ?? null,
  };
}

// ── guard.run ────────────────────────────────────────────────────────────────

test('blockedByGuard: no marker → ok', async () => {
  const r = await blockedByGuard.run(makeCtx({ body: '## Scope\n\nbody.\n' }));
  assert.deepEqual(r, { ok: true });
});

test('blockedByGuard: single blocker, done → ok', async () => {
  const r = await blockedByGuard.run(
    makeCtx({
      body: 'x\n<!-- aitm-blocked-by: #5 -->\n',
      stateMap: { 5: 'done' },
    })
  );
  assert.deepEqual(r, { ok: true });
});

test('blockedByGuard: single blocker, refine → refuse', async () => {
  const r = await blockedByGuard.run(
    makeCtx({
      body: 'x\n<!-- aitm-blocked-by: #5 -->\n',
      stateMap: { 5: 'refine' },
    })
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /cannot exit because blockers are open: #5 \(refine\)/);
});

test('blockedByGuard: three blockers, mixed → refusal lists only open ones', async () => {
  const r = await blockedByGuard.run(
    makeCtx({
      body: 'x\n<!-- aitm-blocked-by: #5, #7, #9 -->\n',
      stateMap: { 5: 'done', 7: 'test', 9: 'done' },
    })
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /#7 \(test\)/);
  assert.doesNotMatch(r.reason, /#5/);
  assert.doesNotMatch(r.reason, /#9/);
});

test('blockedByGuard: multiple open blockers listed in sorted order', async () => {
  const r = await blockedByGuard.run(
    makeCtx({
      body: 'x\n<!-- aitm-blocked-by: #11, #3, #7 -->\n',
      stateMap: { 3: 'refine', 7: 'test', 11: 'plan' },
    })
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /#3 \(refine\), #7 \(test\), #11 \(plan\)/);
});

test('blockedByGuard: null state from fetcher counts as open (unknown)', async () => {
  const r = await blockedByGuard.run(
    makeCtx({
      body: 'x\n<!-- aitm-blocked-by: #5 -->\n',
      stateMap: {},
    })
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /#5 \(unknown\)/);
});

test('blockedByGuard: fetcher throws → counts as open', async () => {
  const ctx = makeCtx({ body: 'x\n<!-- aitm-blocked-by: #5 -->\n' });
  ctx.fetchBlockerState = async () => {
    throw new Error('boom');
  };
  const r = await blockedByGuard.run(ctx);
  assert.equal(r.ok, false);
});

test('blockedByGuard: missing fetchBlockerState → ok (fail-open)', async () => {
  const r = await blockedByGuard.run({
    issueNumber: 100,
    repo: 'r',
    body: 'x\n<!-- aitm-blocked-by: #5 -->\n',
  });
  assert.deepEqual(r, { ok: true });
});

// ── bootstrap registration ───────────────────────────────────────────────────

test('bootstrap: guard registered at all 6 exit slots, no entry slots', () => {
  bootstrapGuards();
  for (const state of EXIT_STATES) {
    const ids = GUARDS[state].exit.map((g) => g.id);
    assert.ok(ids.includes(GUARD_ID), `missing exit guard at ${state}`);
    const entryIds = GUARDS[state].entry.map((g) => g.id);
    assert.ok(!entryIds.includes(GUARD_ID), `unexpected entry guard at ${state}`);
  }
  // done has no exit slot for our guard
  const doneIds = GUARDS.done.exit.map((g) => g.id);
  assert.ok(!doneIds.includes(GUARD_ID), 'done should not have blocked-by guard');
});

test('bootstrap: idempotent on repeat call', () => {
  bootstrapGuards();
  const before = GUARDS.develop.exit.filter((g) => g.id === GUARD_ID).length;
  bootstrapGuards();
  bootstrapGuards();
  const after = GUARDS.develop.exit.filter((g) => g.id === GUARD_ID).length;
  assert.equal(after, before, 'guard must not duplicate across bootstrap calls');
  assert.equal(after, 1);
});

test('runGuards: invokes registered guard and surfaces refusal', async () => {
  bootstrapGuards();
  const ctx = makeCtx({
    body: 'x\n<!-- aitm-blocked-by: #5 -->\n',
    stateMap: { 5: 'develop' },
  });
  const r = await runGuards('develop', 'test', ctx);
  assert.equal(r.ok, false);
  const refusal = r.refusals.find((x) => x.id === GUARD_ID);
  assert.ok(refusal, 'expected blocked-by-not-done refusal');
  assert.match(refusal.reason, /#5 \(develop\)/);
});

test('runGuards: clean transition when all blockers done', async () => {
  bootstrapGuards();
  // #355 — contiguity guard now fires on every forward transition; need
  // prior-stage entry markers so develop→test passes contiguity check.
  const ENTRY_MARKERS = [
    '<!-- aitm-entered-backlog: 2026-06-07T05:00:00Z -->',
    '<!-- aitm-entered-refine: 2026-06-07T05:30:00Z -->',
    '<!-- aitm-entered-plan: 2026-06-07T05:45:00Z -->',
    '<!-- aitm-entered-develop: 2026-06-07T06:00:00Z -->',
  ].join('\n');
  // #270 — develop→test now requires a sandbox-proof marker.
  const SANDBOX_PROOF = '<!-- aitm-dod-verified: abc1234:2026-06-08T00:00:00.000Z -->';
  const ctx = makeCtx({
    body: `${ENTRY_MARKERS}\n${SANDBOX_PROOF}\nx\n<!-- aitm-blocked-by: #5, #7 -->\n`,
    stateMap: { 5: 'done', 7: 'done' },
  });
  const r = await runGuards('develop', 'test', ctx);
  assert.equal(r.ok, true, JSON.stringify(r.refusals));
});
