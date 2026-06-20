// @story #473
// Tests for scripts/task-tracker/lib/discuss-block-guard.mjs — the blocking
// exit guard that makes the #405 `{discuss}` token enforce a full-auto-proof
// promotion gate. Covers guard.run directly and registry wiring on the
// `backlog` and `on-deck` exit slots.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { discussBlockGuard, GUARD_ID } from '../../lib/discuss-block-guard.mjs';
import { markDiscussed } from '../../lib/discuss-marker.mjs';
import { runGuards } from '../../lib/guard-registry.mjs';
import '../../lib/state-bootstrap.mjs';

const TOKEN = '{' + 'discuss' + '}'; // avoid a literal bare token in source

function ctx(body) {
  return { issueNumber: 100, repo: 'owner/name', body };
}

// ── guard.run ────────────────────────────────────────────────────────────────

test('discussBlockGuard: no token → ok', async () => {
  const r = await discussBlockGuard.run(ctx('## Scope\n\nplain body, no directive.\n'));
  assert.deepEqual(r, { ok: true });
});

test('discussBlockGuard: spaced token does NOT trigger (substring is exact)', async () => {
  const r = await discussBlockGuard.run(ctx('Please { discuss } this with me.\n'));
  assert.deepEqual(r, { ok: true });
});

test('discussBlockGuard: bare token → refuse with context', async () => {
  const r = await discussBlockGuard.run(ctx(`## Scope\n\nNeed direction here ${TOKEN}\n`));
  assert.equal(r.ok, false);
  assert.match(r.reason, /unresolved .*discuss.* directive/i);
  assert.match(r.reason, /discussion complete/);
  assert.ok(Array.isArray(r.blockers) && r.blockers.length === 1);
  // surrounding context line is surfaced
  assert.match(r.reason, /Need direction here/);
});

test('discussBlockGuard: fail-open when ctx missing', async () => {
  assert.deepEqual(await discussBlockGuard.run(undefined), { ok: true });
});

test('discussBlockGuard: fail-open when body absent', async () => {
  assert.deepEqual(await discussBlockGuard.run({ issueNumber: 1 }), { ok: true });
});

test('discussBlockGuard: markDiscussed resolves it → ok', async () => {
  const blocked = `## Scope\n\nNeed direction ${TOKEN}\n`;
  const resolved = markDiscussed(blocked, { ts: '2026-06-20T00:00:00Z' });
  const r = await discussBlockGuard.run(ctx(resolved));
  assert.deepEqual(r, { ok: true });
});

test('GUARD_ID is stable', () => {
  assert.equal(GUARD_ID, 'discuss-unresolved');
});

// ── registry wiring (full-auto-proof: runGuards is never exempted) ──────────

test('runGuards backlog→on-deck refuses on bare token', async () => {
  const res = await runGuards('backlog', 'on-deck', ctx(`body ${TOKEN}`));
  const refusal = (res.refusals || []).find((r) => r.id === GUARD_ID);
  assert.ok(refusal, 'discuss-unresolved refusal should be present on backlog exit');
});

test('runGuards on-deck→refine refuses on bare token', async () => {
  const res = await runGuards('on-deck', 'refine', ctx(`body ${TOKEN}`));
  const refusal = (res.refusals || []).find((r) => r.id === GUARD_ID);
  assert.ok(refusal, 'discuss-unresolved refusal should be present on on-deck exit');
});

test('runGuards backlog→on-deck passes once token is stripped', async () => {
  const resolved = markDiscussed(`body ${TOKEN}`, { ts: '2026-06-20T00:00:00Z' });
  const res = await runGuards('backlog', 'on-deck', ctx(resolved));
  const refusal = (res.refusals || []).find((r) => r.id === GUARD_ID);
  assert.ok(!refusal, 'no discuss-unresolved refusal after resolution');
});
