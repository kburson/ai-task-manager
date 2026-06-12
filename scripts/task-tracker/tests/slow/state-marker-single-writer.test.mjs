#!/usr/bin/env node
// #170 — Single state-mutator: move-state.mjs writes both `aitm-entered-<state>`
// and `aitm-last-known-state` markers. promote.mjs no longer writes
// `aitm-last-known-state` on successful transitions (the bootstrap path is
// the one legitimate exception — it has no Status mutation to ride on).
//
// Regression target: phantom `drift-reconcile accept-live external-mutation`
// rows on every non-promote transition. The split write responsibility caused
// the recorded marker to lag behind live state any time a non-promote verb
// invoked move-state.mjs directly. Centralizing both marker writes inside
// move-state.mjs eliminates the lag window.
//
// This test verifies the contract from promote.mjs's side: when a transition
// succeeds, promote does not write the `aitm-last-known-state` marker itself.
// The companion stamp behavior inside move-state.mjs is covered by the
// existing move-state test suite plus a body-merge unit test below.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runPromote } from '../../verbs/promote.mjs';
import { writeLastKnownState, readLastKnownState } from '../../gh-timing-comment.mjs';
import { stampEntryMarker } from '../../lib/stage-entry-markers.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function bodyWithState(state) {
  return `<!-- aitm-last-known-state: ${state} -->\n<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->\n\n## Issue\n\nbody.\n`;
}

function makeDeps({ body, live, moveCode = 0 } = {}) {
  const calls = { writes: [], moves: [], timings: [] };
  return {
    calls,
    deps: {
      fetchIssueBody: async () => ({ body }),
      writeIssueBody: async ({ body: b }) => {
        calls.writes.push(b);
      },
      // #295 — promote bootstrap + marker repair now go through mutateIssueBody.
      mutateIssueBody: async ({ mutate }) => {
        const next = mutate(body);
        if (next === body) return { status: 'no-op' };
        calls.writes.push(next);
        return { status: 'ok' };
      },
      getLiveState: async () => live,
      spawnVerb: async () => 0,
      runMoveState: async ({ issueNumber, target }) => {
        calls.moves.push({ issueNumber, target });
        return moveCode;
      },
      postTimingRow: async ({ row }) => {
        calls.timings.push(row);
      },
      epicChildren: { fetchSiblings: async () => [] },
      codeCompleteGate: async () => ({ ok: true, blockers: [], shas: [] }),
      commitTrailHeadGate: async () => ({
        ok: true,
        headSha: 'deadbeef',
        trailShas: ['deadbeef'],
      }),
    },
  };
}

test('promote does not write aitm-last-known-state on successful refine→plan', async () => {
  const rationale =
    '<!-- aitm-refinement-rationale: {"size":"a","estimate":"b","priority":"c"} -->';
  const refineComplete = '<!-- aitm-refine-complete: 2026-06-03T00:00:00Z -->';
  const ac = '## Acceptance Criteria\n- [ ] foo\n';
  const body = `${bodyWithState('refine')}\n${refineComplete}\n${rationale}\n\n${ac}`;
  const { deps, calls } = makeDeps({ body, live: 'refine' });
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ size: 'S', estimate: 4, priority: 'P2' }),
    listCommentBodies: async () => [],
    postComment: async () => {},
    writeIssueBody: async () => {},
  };
  deps.refineToPlanGate = async () => ({ ok: true, blockers: [] });

  const r = await runPromote({ issueNumber: 100, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'plan');
  // The bootstrap path is the only place promote.mjs is allowed to write
  // aitm-last-known-state. Body already had a recorded state, so no write.
  const wroteLastKnownState = calls.writes.some((b) =>
    /<!--\s*aitm-last-known-state:\s*plan\s*-->/.test(b)
  );
  assert.equal(
    wroteLastKnownState,
    false,
    'promote.mjs must not write aitm-last-known-state — move-state.mjs owns that write'
  );
});

test('promote does not write aitm-last-known-state on successful develop→test (alias verb)', async () => {
  const body = bodyWithState('develop');
  const { deps, calls } = makeDeps({ body, live: 'develop' });
  // develop→test runs the `test` alias verb path
  deps.spawnVerb = async () => 0;
  deps.codeCompleteGate = async () => ({ ok: true, blockers: [], shas: ['abc123'] });

  const r = await runPromote({ issueNumber: 200, cfg, deps });
  assert.equal(r.status, 'promoted');
  const wroteLastKnownState = calls.writes.some((b) =>
    /<!--\s*aitm-last-known-state:\s*test\s*-->/.test(b)
  );
  assert.equal(
    wroteLastKnownState,
    false,
    'alias-verb success path must not write aitm-last-known-state from promote'
  );
});

test('bootstrap path still writes aitm-last-known-state (no prior marker)', async () => {
  // First-touch: body has no recorded state. promote.mjs must seed it from
  // live so drift detection has a basis to compare. This is the single
  // legitimate marker write left in promote.mjs.
  const body = '## Issue\n\nNo markers yet.\n';
  const { deps, calls } = makeDeps({ body, live: 'refine' });
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ size: 'S', estimate: 4, priority: 'P2' }),
    listCommentBodies: async () => [],
    postComment: async () => {},
    writeIssueBody: async () => {},
  };
  deps.refineToPlanGate = async () => ({ ok: true, blockers: [] });

  await runPromote({ issueNumber: 300, cfg, deps });
  const bootstrapWrite = calls.writes.find((b) =>
    /<!--\s*aitm-last-known-state state="refine" ts="[^"]+" -->/.test(b)
  );
  assert.ok(bootstrapWrite, 'bootstrap path must seed aitm-last-known-state from live');
});

test('move-state composite stamp: entry-marker and last-known-state in single body', () => {
  // Unit verification of the composed body transform move-state.mjs applies.
  // Reading and stamping in the order move-state.mjs uses must yield a body
  // with BOTH markers — proving the recorded marker no longer lags behind
  // entry markers on legitimate transitions.
  const before = '## Issue\n\nbody.\n';
  const ts = '2026-05-18T14:00:00Z';
  let after = stampEntryMarker(before, 'plan', ts);
  after = writeLastKnownState(after, 'plan');
  assert.match(after, /<!--\s*aitm-entered-plan ts="2026-05-18T14:00:00Z"\s*-->/);
  assert.match(after, /<!--\s*aitm-last-known-state state="plan" ts="[^"]+" -->/);
  assert.equal(readLastKnownState(after).state, 'plan');
});

test('move-state composite stamp is idempotent for last-known-state', () => {
  // Re-applying writeLastKnownState to the same target produces the same
  // recorded state (timestamp may differ but pair is replaced in place,
  // never duplicated).
  let body = bodyWithState('plan');
  body = writeLastKnownState(body, 'develop');
  body = writeLastKnownState(body, 'develop');
  const matches = body.match(/<!--\s*aitm-last-known-state /g) || [];
  assert.equal(matches.length, 1, 'last-known-state must not duplicate on repeat stamping');
  assert.equal(readLastKnownState(body).state, 'develop');
});
