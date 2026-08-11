// @story #473
// Tests for scripts/task-tracker/lib/discuss-block-guard.mjs — the blocking
// exit guard that makes the #405 `{discuss}` token enforce a full-auto-proof
// promotion gate. Covers guard.run directly and registry wiring on the
// `backlog` and `assigned` exit slots.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { discussBlockGuard, GUARD_ID } from '../../../lib/discuss-block-guard.mjs';
import { markDiscussed, convergeDiscuss } from '../../../lib/discuss-marker.mjs';
import { runGuards } from '../../../lib/guard-registry.mjs';
import '../../../lib/state-bootstrap.mjs';

const TOKEN = '{' + 'discuss' + '}'; // avoid a literal bare token in source

function ctx(body) {
  return { issueNumber: 100, repo: 'owner/name', body };
}

// ── guard.run ────────────────────────────────────────────────────────────────

test('discussBlockGuard: no token → ok', async () => {
  const r = await discussBlockGuard.run(ctx('## Scope\n\nplain body, no directive.\n'));
  assert.deepEqual(r, { ok: true });
});

test('discussBlockGuard: spaced token does NOT trigger', async () => {
  const r = await discussBlockGuard.run(ctx('Please { discuss } this with me.\n'));
  assert.deepEqual(r, { ok: true });
});

// #479: inline / prose / backticked mentions are NOT markers and must NOT
// trip the guard — this is the false positive that blocked promotion.
test('discussBlockGuard: inline prose mention does NOT trigger (#479)', async () => {
  const r = await discussBlockGuard.run(
    ctx(`## Scope\n\nthe ${TOKEN} fix must land first; see \`${TOKEN}\` in code.\n`)
  );
  assert.deepEqual(r, { ok: true });
});

test('discussBlockGuard: bare token alone on its line → refuse with context', async () => {
  const r = await discussBlockGuard.run(ctx(`## Scope\n\nNeed direction here\n\n${TOKEN}\n`));
  assert.equal(r.ok, false);
  assert.match(r.reason, /unresolved .*discuss.* directive/i);
  assert.match(r.reason, /discussion complete/);
  assert.ok(Array.isArray(r.blockers) && r.blockers.length === 1);
  // the bare-token line is surfaced as context
  assert.match(r.reason, /\{discuss\}/);
});

// #486 — after convergence the visible token is gone but the durable
// `aitm-discuss-requested` marker remains; the guard must STILL block, keyed on
// `isDiscussPending`, so stripping the token at bind never disables the gate.
test('discussBlockGuard: converged request-marker-only body → still refuse (#486)', async () => {
  const converged = convergeDiscuss(`## Scope\n\nNeed direction\n\n${TOKEN}\n`, { ts: 'T' });
  assert.ok(!converged.includes(TOKEN), 'token is stripped post-converge');
  const r = await discussBlockGuard.run(ctx(converged));
  assert.equal(r.ok, false);
  assert.match(r.reason, /aitm-discuss-requested marker present/);
  assert.ok(Array.isArray(r.blockers) && r.blockers.length === 1);
});

// #486 — completing the discussion (request marker stripped + aitm-discussed
// stamped) clears the gate.
test('discussBlockGuard: aitm-discussed marker → ok (#486)', async () => {
  const done = markDiscussed(convergeDiscuss(`x\n${TOKEN}`, { ts: 'T' }), { ts: 'T' });
  const r = await discussBlockGuard.run(ctx(done));
  assert.deepEqual(r, { ok: true });
});

test('discussBlockGuard: fail-open when ctx missing', async () => {
  assert.deepEqual(await discussBlockGuard.run(undefined), { ok: true });
});

test('discussBlockGuard: fail-open when body absent', async () => {
  assert.deepEqual(await discussBlockGuard.run({ issueNumber: 1 }), { ok: true });
});

test('discussBlockGuard: markDiscussed resolves it → ok', async () => {
  const blocked = `## Scope\n\nNeed direction\n\n${TOKEN}\n`;
  const resolved = markDiscussed(blocked, { ts: '2026-06-20T00:00:00Z' });
  const r = await discussBlockGuard.run(ctx(resolved));
  assert.deepEqual(r, { ok: true });
});

test('GUARD_ID is stable', () => {
  assert.equal(GUARD_ID, 'discuss-unresolved');
});

// ── registry wiring (full-auto-proof: runGuards is never exempted) ──────────

test('runGuards backlog→assigned refuses on bare token', async () => {
  const res = await runGuards('backlog', 'assigned', ctx(`body\n${TOKEN}`));
  const refusal = (res.refusals || []).find((r) => r.id === GUARD_ID);
  assert.ok(refusal, 'discuss-unresolved refusal should be present on backlog exit');
});

test('runGuards assigned→refine refuses on bare token', async () => {
  const res = await runGuards('assigned', 'refine', ctx(`body\n${TOKEN}`));
  const refusal = (res.refusals || []).find((r) => r.id === GUARD_ID);
  assert.ok(refusal, 'discuss-unresolved refusal should be present on assigned exit');
});

// #479: an inline mention must not block promotion under runGuards either.
test('runGuards backlog→assigned passes on an inline-only mention (#479)', async () => {
  const res = await runGuards('backlog', 'assigned', ctx(`body mentions ${TOKEN} inline`));
  const refusal = (res.refusals || []).find((r) => r.id === GUARD_ID);
  assert.ok(!refusal, 'inline mention is not a marker; no refusal');
});

// #486 — a converged (token-stripped, marker-bearing) body still refuses.
test('runGuards backlog→assigned refuses on a converged request marker (#486)', async () => {
  const converged = convergeDiscuss(`body\n${TOKEN}`, { ts: 'T' });
  const res = await runGuards('backlog', 'assigned', ctx(converged));
  const refusal = (res.refusals || []).find((r) => r.id === GUARD_ID);
  assert.ok(refusal, 'request marker keeps the gate live after token convergence');
});

test('runGuards backlog→assigned passes once token is stripped', async () => {
  const resolved = markDiscussed(`body\n${TOKEN}`, { ts: '2026-06-20T00:00:00Z' });
  const res = await runGuards('backlog', 'assigned', ctx(resolved));
  const refusal = (res.refusals || []).find((r) => r.id === GUARD_ID);
  assert.ok(!refusal, 'no discuss-unresolved refusal after resolution');
});
