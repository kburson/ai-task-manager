// Unit tests for the plan-exit guards introduced in #277:
//   - planApprovedGuard       (lib/plan-approved-guard.mjs)
//   - planEpicChildrenGuard   (lib/plan-epic-children-guard.mjs)
//
// Asserts:
//   1. Each guard's pure behavior in isolation.
//   2. Each guard short-circuits when ctx.toState !== 'develop'
//      (rollback/bounce-back semantics — does NOT fire on plan → refine).
//   3. Both guards are wired into STATES.plan.exitGuards in the correct order.
//   4. runGuards('plan','develop', ctx) surfaces refusals from both.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planApprovedGuard } from '../lib/plan-approved-guard.mjs';
import { planEpicChildrenGuard } from '../lib/plan-epic-children-guard.mjs';
import { STATES } from '../states/index.mjs';
import { runGuards } from '../lib/guard-registry.mjs';
import '../lib/guard-bootstrap.mjs';

const APPROVED_BODY = '## Scope\n\n<!-- aitm-plan-approved: 2026-06-07T06:00:00Z -->\n';
const BARE_BODY = '## Scope\n\nno marker here\n';

const CFG = { repo: 'owner/name', projectId: 'PVT' };

// ── planApprovedGuard ────────────────────────────────────────────────────────

test('planApprovedGuard: body with marker → ok', async () => {
  const r = await planApprovedGuard.run({ toState: 'develop', body: APPROVED_BODY });
  assert.deepEqual(r, { ok: true });
});

test('planApprovedGuard: missing marker, toState=develop → refuse', async () => {
  const r = await planApprovedGuard.run({ toState: 'develop', body: BARE_BODY });
  assert.equal(r.ok, false);
  assert.match(r.reason, /aitm-plan-approved/);
  assert.match(r.reason, /plan-approve/);
});

test('planApprovedGuard: missing marker, toState=refine (rollback) → ok', async () => {
  // Bounce-backs out of plan must NOT require fresh plan-approved markers.
  const r = await planApprovedGuard.run({ toState: 'refine', body: BARE_BODY });
  assert.deepEqual(r, { ok: true });
});

test('planApprovedGuard: missing marker, toState absent → falls through (refuse)', async () => {
  // Ctx without toState is the legacy caller shape; we still enforce the marker.
  const r = await planApprovedGuard.run({ body: BARE_BODY });
  assert.equal(r.ok, false);
});

test('planApprovedGuard: empty/undefined body → refuse', async () => {
  const r = await planApprovedGuard.run({ toState: 'develop' });
  assert.equal(r.ok, false);
});

// ── planEpicChildrenGuard ───────────────────────────────────────────────────

test('planEpicChildrenGuard: toState=refine (rollback) → ok regardless of children', async () => {
  // No deps wired; guard must short-circuit before touching `gh`.
  const r = await planEpicChildrenGuard.run({
    toState: 'refine',
    cfg: CFG,
    issueNumber: 999,
  });
  assert.deepEqual(r, { ok: true });
});

test('planEpicChildrenGuard: missing cfg/issueNumber → fail-open', async () => {
  // Parity-test shape sometimes omits these; refusal here would mask the
  // real cause.
  const r1 = await planEpicChildrenGuard.run({ toState: 'develop' });
  assert.deepEqual(r1, { ok: true });
  const r2 = await planEpicChildrenGuard.run({ toState: 'develop', cfg: CFG });
  assert.deepEqual(r2, { ok: true });
});

test('planEpicChildrenGuard: solo issue (no children) → ok', async () => {
  const r = await planEpicChildrenGuard.run({
    toState: 'develop',
    cfg: CFG,
    issueNumber: 277,
    deps: {
      epicChildren: {
        fetchSiblings: async () => [],
      },
    },
  });
  assert.deepEqual(r, { ok: true });
});

test('planEpicChildrenGuard: epic with all children at refine → ok', async () => {
  const r = await planEpicChildrenGuard.run({
    toState: 'develop',
    cfg: CFG,
    issueNumber: 999,
    deps: {
      epicChildren: {
        fetchSiblings: async () => [
          { number: 1, state: 'refine' },
          { number: 2, state: 'refine' },
        ],
      },
    },
  });
  assert.deepEqual(r, { ok: true });
});

test('planEpicChildrenGuard: epic with backlog child → refuse', async () => {
  const r = await planEpicChildrenGuard.run({
    toState: 'develop',
    cfg: CFG,
    issueNumber: 999,
    deps: {
      epicChildren: {
        fetchSiblings: async () => [
          { number: 1, state: 'refine' },
          { number: 2, state: 'backlog' },
        ],
      },
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /epic-children-not-at-refine/);
  assert.match(r.reason, /#2/);
});

// ── states/plan.mjs wiring ───────────────────────────────────────────────────

test('STATES.plan.exitGuards: includes plan-exit-plan-approved', () => {
  const ids = STATES.plan.exitGuards.map((g) => g.id);
  assert.ok(
    ids.includes('plan-exit-plan-approved'),
    `expected plan-exit-plan-approved in [${ids.join(', ')}]`
  );
});

test('STATES.plan.exitGuards: includes plan-exit-epic-children-refine-or-beyond', () => {
  const ids = STATES.plan.exitGuards.map((g) => g.id);
  assert.ok(
    ids.includes('plan-exit-epic-children-refine-or-beyond'),
    `expected plan-exit-epic-children-refine-or-beyond in [${ids.join(', ')}]`
  );
});

test('STATES.plan.exitGuards: blockedBy runs before plan-exit guards', () => {
  const ids = STATES.plan.exitGuards.map((g) => g.id);
  const blocked = ids.indexOf('blocked-by-not-done');
  const approved = ids.indexOf('plan-exit-plan-approved');
  assert.ok(blocked !== -1 && approved !== -1);
  assert.ok(blocked < approved, `blocked-by should run first; got order [${ids.join(', ')}]`);
});

// ── runGuards integration ────────────────────────────────────────────────────

test('runGuards(plan,develop): missing plan-approved marker → refusal', async () => {
  const r = await runGuards('plan', 'develop', {
    issueNumber: 277,
    repo: 'owner/name',
    fromState: 'plan',
    toState: 'develop',
    body: BARE_BODY,
    cfg: CFG,
    deps: { epicChildren: { fetchSiblings: async () => [] } },
    fetchBlockerState: async () => null,
  });
  assert.equal(r.ok, false);
  const ids = r.refusals.map((x) => x.id);
  assert.ok(ids.includes('plan-exit-plan-approved'), JSON.stringify(r));
});

test('runGuards(plan,refine): rollback bypasses plan-exit guards', async () => {
  // No body marker, no epic-children deps — both guards must short-circuit
  // because toState !== 'develop'.
  const r = await runGuards('plan', 'refine', {
    issueNumber: 277,
    repo: 'owner/name',
    fromState: 'plan',
    toState: 'refine',
    body: BARE_BODY,
    cfg: CFG,
    fetchBlockerState: async () => null,
  });
  assert.equal(r.ok, true, JSON.stringify(r.refusals));
});

test('runGuards(plan,develop): marker present + solo issue → ok', async () => {
  const r = await runGuards('plan', 'develop', {
    issueNumber: 277,
    repo: 'owner/name',
    fromState: 'plan',
    toState: 'develop',
    body: APPROVED_BODY,
    cfg: CFG,
    deps: { epicChildren: { fetchSiblings: async () => [] } },
    fetchBlockerState: async () => null,
  });
  assert.equal(r.ok, true, JSON.stringify(r.refusals));
});
