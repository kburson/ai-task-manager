#!/usr/bin/env node
// @story #438
// #438 AC4 — Recovery-path independence.
//
// The recovery verbs (`demote`, `unblock`) must not themselves fail on the
// body-write path when operating on an issue carrying realistic accumulated
// markers — that write-path fragility (Bug B) is exactly what turned a single
// stuck issue into a total seizure.
//
// It also pins the CONFIRMED current contract for a backward demote out of a
// `test` whose blockers are open. move-state runs the universal blockedByGuard
// on EVERY exit slot, including the `--demote` path (only TT_SKIP_NETWORK and
// --supersede bypass it). So a backward demote from `test` with an open
// blocker IS refused today — the sanctioned escape is `unblock` (clear the
// stale ref) THEN move, NOT a demote-specific guard exemption. Pinning it this
// way prevents a future "let demote skip the guard" change from silently
// re-opening the deadlock the guard exists to close.
//
// NOTE (deep-dive correction): the posted deep-dive predicted demote would be
// guard-EXEMPT. Reading move-state.mjs showed the opposite — the guard is
// universal across exit slots. This AC pins the true behavior; the discrepancy
// is recorded in the Full-Auto audit comment.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runDemote } from '../../verbs/demote.mjs';
import { runUnblock } from '../../verbs/unblock.mjs';
import { blockedByGuard } from '../../lib/blocked-by-guard.mjs';
import { addBlockedBy, parseBlockedBy } from '../../lib/blocked-marker.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

// A body carrying the kind of marker load a real in-flight issue accumulates.
function markerHeavyBody(state) {
  return [
    `<!-- aitm-last-known-state: ${state} -->`,
    `<!-- aitm-last-known-state-ts: 2026-06-17T00:00:00Z -->`,
    `<!-- aitm-body-version version="11" -->`,
    `<!-- aitm-entered-develop ts="2026-06-16T10:00:00Z" -->`,
    `<!-- aitm-entered-test ts="2026-06-17T09:00:00Z" -->`,
    ``,
    `## Scope`,
    `Real body prose.`,
    ``,
    `<!-- aitm-fields: {"schema":1,"values":{"priority":"P2"}} -->`,
    ``,
  ].join('\n');
}

// DI fake mirroring demote-verb.test.mjs's makeDeps.
function makeDemoteDeps({ body, live, moveCode = 0 }) {
  const calls = { writes: [], moves: [] };
  let remote = body;
  return {
    calls,
    deps: {
      fetchIssueBody: async () => ({ body: remote }),
      mutateIssueBody: async ({ mutate }) => {
        const next = mutate(remote);
        if (next !== remote) {
          remote = next;
          calls.writes.push({ after: next });
        }
        return { status: 'ok' };
      },
      getLiveState: async () => live,
      runMoveState: async ({ issueNumber, target }) => {
        calls.moves.push({ issueNumber, target });
        return moveCode;
      },
      postTimingRow: async () => {},
    },
  };
}

test('AC4: runDemote succeeds on a marker-heavy body (write path is not fragile)', async () => {
  const { deps, calls } = makeDemoteDeps({ body: markerHeavyBody('test'), live: 'test' });
  const r = await runDemote({ issueNumber: 500, cfg, deps });
  assert.equal(r.status, 'demoted');
  assert.equal(r.from, 'test');
  assert.equal(r.to, 'develop');
  assert.deepEqual(calls.moves, [{ issueNumber: 500, target: 'develop' }]);
  // The post-move develop stamp landed without a write-path failure.
  assert.ok(calls.writes.length >= 1);
});

test('AC4: runUnblock clears a stale blocker on a marker-heavy body (non-manual escape)', async () => {
  const base = addBlockedBy(markerHeavyBody('test'), 999);
  assert.deepEqual(parseBlockedBy(base), [999], 'fixture must carry the blocker');

  let remote = base;
  const labelCalls = [];
  const comments = [];
  const r = await runUnblock({
    target: 501,
    refs: null, // drop ALL
    cfg,
    deps: {
      mutateIssueBody: async ({ mutate }) => {
        const next = mutate(remote);
        if (next !== remote) remote = next;
        return { status: 'ok' };
      },
      runLabel: async ({ args }) => labelCalls.push(args),
      postComment: async ({ body }) => comments.push(body),
      writeFieldValue: async () => {},
    },
  });
  assert.equal(r.status, 'removed');
  assert.equal(r.cleared, true);
  assert.deepEqual(r.removed, [999]);
  assert.deepEqual(parseBlockedBy(remote), [], 'blocker marker must be gone from the body');
  assert.ok(
    labelCalls.some((a) => a.includes('--remove-label')),
    'BLOCKED label must be dropped when fully cleared'
  );
});

test('AC4: backward demote exit guard fires while a blocker is open (confirmed contract)', async () => {
  const body = addBlockedBy(markerHeavyBody('test'), 600);
  // Open blocker → guard refuses the exit (the demote cannot proceed until
  // `unblock` clears the ref; demote gets NO special exemption).
  const refused = await blockedByGuard.run({
    issueNumber: 501,
    repo: 'o/r',
    body,
    fetchBlockerState: async () => 'develop', // open
  });
  assert.equal(refused.ok, false, 'open blocker must refuse the test exit slot');
  assert.match(refused.reason, /blockers are open: #600/);

  // Once the blocker is done, the same exit slot is permitted.
  const allowed = await blockedByGuard.run({
    issueNumber: 501,
    repo: 'o/r',
    body,
    fetchBlockerState: async () => 'done',
  });
  assert.equal(allowed.ok, true, 'done blocker must permit the exit');
});
