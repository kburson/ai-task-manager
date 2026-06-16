#!/usr/bin/env node
// Unit tests for scripts/task-tracker/lib/guard-registry.mjs (#262).
//
// Skeleton-stage registry: GUARDS map, runGuards iterator, registerGuard
// idempotent appender. No integration with move-state.mjs yet — these tests
// pin the API contract that later children will register against.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

// Each test re-imports a fresh copy via a cache-busting query so global GUARDS
// state from one test doesn't leak into another. Module is pure data so this
// is cheap.
async function freshRegistry() {
  const mod = await import(`../lib/guard-registry.mjs?t=${Date.now()}-${Math.random()}`);
  return mod;
}

test('empty registry: runGuards returns { ok: true, refusals: [] } for any state pair', async () => {
  const { runGuards } = await freshRegistry();
  for (const pair of [
    ['backlog', 'on-deck'],
    ['on-deck', 'refine'],
    ['refine', 'plan'],
    ['plan', 'develop'],
    ['develop', 'test'],
    ['test', 'review'],
    ['review', 'done'],
  ]) {
    const r = await runGuards(pair[0], pair[1], {});
    assert.deepEqual(r, { ok: true, refusals: [] }, `pair ${pair.join('->')}`);
  }
});

test('GUARDS exposes all 8 states keyed with { exit: [], entry: [] }', async () => {
  const { GUARDS } = await freshRegistry();
  const expected = ['backlog', 'on-deck', 'refine', 'plan', 'develop', 'test', 'review', 'done'];
  assert.deepEqual(Object.keys(GUARDS).sort(), [...expected].sort());
  for (const s of expected) {
    assert.deepEqual(GUARDS[s], { exit: [], entry: [] }, `state ${s} shape`);
  }
});

test('registerGuard appends; re-registering same id is a no-op (length stays 1)', async () => {
  const { GUARDS, registerGuard } = await freshRegistry();
  const g = { id: 'demo-guard', run: () => ({ ok: true }) };

  const first = registerGuard('plan', 'exit', g);
  assert.equal(first, true, 'first registration returns true');
  assert.equal(GUARDS.plan.exit.length, 1);

  const second = registerGuard('plan', 'exit', g);
  assert.equal(second, false, 'duplicate id returns false');
  assert.equal(GUARDS.plan.exit.length, 1, 'no second copy appended');

  // Same id with a different run still no-ops.
  const third = registerGuard('plan', 'exit', {
    id: 'demo-guard',
    run: () => ({ ok: false, reason: 'nope' }),
  });
  assert.equal(third, false);
  assert.equal(GUARDS.plan.exit.length, 1);
});

test('runGuards aggregates refusals across exit + entry (no short-circuit)', async () => {
  const { registerGuard, runGuards } = await freshRegistry();

  registerGuard('plan', 'exit', {
    id: 'exit-fail',
    run: () => ({ ok: false, reason: 'exit refused' }),
  });
  registerGuard('develop', 'entry', {
    id: 'entry-fail',
    run: () => ({ ok: false, reason: 'entry refused' }),
  });

  const r = await runGuards('plan', 'develop', { issueNumber: 42 });
  assert.equal(r.ok, false);
  assert.equal(r.refusals.length, 2);
  const ids = r.refusals.map((x) => x.id).sort();
  assert.deepEqual(ids, ['entry-fail', 'exit-fail']);
  const reasonById = Object.fromEntries(r.refusals.map((x) => [x.id, x.reason]));
  assert.equal(reasonById['exit-fail'], 'exit refused');
  assert.equal(reasonById['entry-fail'], 'entry refused');
});

test('runGuards passes ctx to each guard.run', async () => {
  const { registerGuard, runGuards } = await freshRegistry();
  const seen = [];
  registerGuard('refine', 'exit', {
    id: 'ctx-spy-exit',
    run: (ctx) => {
      seen.push(['exit', ctx]);
      return { ok: true };
    },
  });
  registerGuard('plan', 'entry', {
    id: 'ctx-spy-entry',
    run: (ctx) => {
      seen.push(['entry', ctx]);
      return { ok: true };
    },
  });
  const ctx = { issueNumber: 1, repo: 'x/y' };
  await runGuards('refine', 'plan', ctx);
  assert.equal(seen.length, 2);
  assert.equal(seen[0][1], ctx);
  assert.equal(seen[1][1], ctx);
});

test('runGuards: a throwing guard is treated as a refusal, not a crash', async () => {
  const { registerGuard, runGuards } = await freshRegistry();
  registerGuard('plan', 'exit', {
    id: 'throws',
    run: () => {
      throw new Error('boom');
    },
  });
  registerGuard('develop', 'entry', { id: 'ok-after', run: () => ({ ok: true }) });
  const r = await runGuards('plan', 'develop', {});
  assert.equal(r.ok, false);
  assert.equal(r.refusals.length, 1);
  assert.equal(r.refusals[0].id, 'throws');
  assert.match(r.refusals[0].reason, /boom/);
});

test('registerGuard throws on unknown state', async () => {
  const { registerGuard } = await freshRegistry();
  assert.throws(
    () => registerGuard('shipped', 'exit', { id: 'x', run: () => ({ ok: true }) }),
    /unknown state "shipped"/
  );
});

test('registerGuard throws on unknown kind', async () => {
  const { registerGuard } = await freshRegistry();
  assert.throws(
    () => registerGuard('plan', 'sideways', { id: 'x', run: () => ({ ok: true }) }),
    /unknown kind "sideways"/
  );
});

test('registerGuard throws on malformed guard', async () => {
  const { registerGuard } = await freshRegistry();
  assert.throws(() => registerGuard('plan', 'exit', null), /must be \{ id/);
  assert.throws(() => registerGuard('plan', 'exit', { id: 'x' }), /must be \{ id/);
  assert.throws(
    () => registerGuard('plan', 'exit', { run: () => ({ ok: true }) }),
    /must be \{ id/
  );
});
