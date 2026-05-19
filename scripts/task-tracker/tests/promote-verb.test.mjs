#!/usr/bin/env node
// Unit tests for scripts/task-tracker/verbs/promote.mjs.
//
// All cases drive runPromote with stubbed deps — no network, no spawn.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runPromote } from '../verbs/promote.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({
  body = '',
  live = null,
  liveAfter,
  liveThrowsAfter = false,
  spawnCode = 0,
  moveCode = 0,
  fetchSecondBody,
} = {}) {
  let secondFetch = false;
  let liveCalls = 0;
  const calls = {
    writes: [],
    timings: [],
    spawns: [],
    moves: [],
    fetches: 0,
    liveCalls: 0,
  };
  return {
    calls,
    deps: {
      fetchIssueBody: async () => {
        calls.fetches++;
        if (secondFetch && fetchSecondBody !== undefined) return { body: fetchSecondBody };
        secondFetch = true;
        return { body };
      },
      writeIssueBody: async ({ body: b }) => {
        calls.writes.push(b);
      },
      getLiveState: async () => {
        liveCalls++;
        calls.liveCalls = liveCalls;
        if (liveCalls === 1) return live;
        if (liveThrowsAfter) throw new Error('boom');
        return liveAfter !== undefined ? liveAfter : live;
      },
      spawnVerb: async ({ verb, issueNumber }) => {
        calls.spawns.push({ verb, issueNumber });
        return spawnCode;
      },
      runMoveState: async ({ issueNumber, target }) => {
        calls.moves.push({ issueNumber, target });
        return moveCode;
      },
      postTimingRow: async ({ row }) => {
        calls.timings.push(row);
      },
      epicChildren: {
        fetchSiblings: async () => [],
      },
      codeCompleteGate: async () => ({ ok: true, blockers: [], shas: [] }),
      commitTrailHeadGate: async () => ({ ok: true, headSha: 'deadbeef', trailShas: ['deadbeef'] }),
    },
  };
}

function bodyWithState(state) {
  return `<!-- aitm-last-known-state: ${state} -->\n<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->\n\n## Issue\n\nbody.\n`;
}

test('promote: refine→plan is a direct move-state call with refine-estimate hook', async () => {
  const rationale =
    '<!-- aitm-refinement-rationale: {"size":"a","estimate":"b","priority":"c"} -->';
  const ac = '## Acceptance Criteria\n- [ ] foo\n';
  const body = `${bodyWithState('refine')}\n${rationale}\n\n${ac}`;
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
  assert.equal(r.from, 'refine');
  assert.equal(r.to, 'plan');
  assert.equal(r.via, 'direct');
  assert.equal(calls.spawns.length, 0);
  assert.deepEqual(calls.moves, [{ issueNumber: 100, target: 'plan' }]);
  // #128 — promote no longer emits a `move:<target>` audit row. The paired
  // `<prev>:complete` + `<next>:enter` rows are emitted from move-state.mjs
  // (the chokepoint) and not visible to this dependency-injected fake.
  assert.equal(calls.timings.length, 0);
  assert.equal(r.refinementPost.status, 'posted');
  // Entry-marker stamping is now centralized in move-state.mjs (see
  // feedback_single_state_mutator.md). promote.mjs no longer stamps
  // aitm-entered-<stage>; verify it does not write the marker itself.
  assert.ok(
    !calls.writes.some((b) => /aitm-entered-plan:/.test(b)),
    'promote must not stamp aitm-entered-plan; that is move-state.mjs responsibility'
  );
});

test('promote: refine→plan refused when full refine-estimate signals are missing', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('refine'), live: 'refine' });
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({}),
  };
  const r = await runPromote({ issueNumber: 1005, cfg, deps });
  assert.equal(r.status, 'refine-gate-refused');
  assert.ok(r.blockers.length >= 2);
  assert.equal(calls.moves.length, 0);
});

test('promote: refine→plan refused when Acceptance Criteria section is empty', async () => {
  const rationale =
    '<!-- aitm-refinement-rationale: {"size":"a","estimate":"b","priority":"c"} -->';
  const body = `${bodyWithState('refine')}\n${rationale}\n\n## Acceptance Criteria\n\n(none)\n`;
  const { deps, calls } = makeDeps({ body, live: 'refine' });
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ size: 'S', estimate: 4, priority: 'P2' }),
  };
  const r = await runPromote({ issueNumber: 1006, cfg, deps });
  assert.equal(r.status, 'refine-gate-refused');
  assert.ok(r.blockers.some((b) => b.startsWith('refine-ac-section-empty')));
  assert.equal(calls.moves.length, 0);
});

test('promote: refine→plan refused when refine-exit gate returns blockers (#147)', async () => {
  const rationale =
    '<!-- aitm-refinement-rationale: {"size":"a","estimate":"b","priority":"c"} -->';
  const ac = '## Acceptance Criteria\n- [ ] foo\n';
  const body = `${bodyWithState('refine')}\n${rationale}\n\n${ac}`;
  const { deps, calls } = makeDeps({ body, live: 'refine' });
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ size: 'S', estimate: 4, priority: 'P2' }),
    listCommentBodies: async () => [],
    postComment: async () => {},
    writeIssueBody: async () => {},
  };
  deps.refineToPlanGate = async () => ({
    ok: false,
    blockers: ['refine-exit-missing: Sequence is not set on the project board'],
  });
  const r = await runPromote({ issueNumber: 1471, cfg, deps });
  assert.equal(r.status, 'refine-exit-refused');
  assert.ok(r.blockers.some((b) => /Sequence/.test(b)));
  assert.equal(calls.moves.length, 0);
  assert.equal(calls.spawns.length, 0);
});

test('promote: backlog→refine stamps Start time on success (#147)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('backlog'), live: 'backlog' });
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ priority: 'P2' }),
  };
  let stampCalls = 0;
  let stampArgs = null;
  deps.stampStartTime = async (opts) => {
    stampCalls += 1;
    stampArgs = opts;
    return { status: 'stamped', value: '2026-05-16 10:00 -0700' };
  };
  const r = await runPromote({ issueNumber: 1472, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.deepEqual(calls.moves, [{ issueNumber: 1472, target: 'refine' }]);
  assert.equal(stampCalls, 1);
  assert.equal(stampArgs.issueNumber, 1472);
});

test('promote: plan→develop is a direct move-state call when planned-estimate appendix is present', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'plan' });
  deps.plannedEstimate = {
    listComments: async () => [
      {
        id: 'IC_1',
        body: '<!-- aitm-refined-estimate: 101 -->\n### 🛠 Refine estimate\n\n### Planned Estimate\n\n| Field | Refine | Plan | Δ |\n',
      },
    ],
  };
  const r = await runPromote({ issueNumber: 101, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'develop');
  assert.equal(r.via, 'direct');
  assert.equal(calls.spawns.length, 0);
  assert.deepEqual(calls.moves, [{ issueNumber: 101, target: 'develop' }]);
});

test('promote: plan→develop refused when refine-estimate comment is missing (#134)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'plan' });
  deps.plannedEstimate = {
    listComments: async () => [],
  };
  const r = await runPromote({ issueNumber: 1011, cfg, deps });
  assert.equal(r.status, 'planned-estimate-refused');
  assert.ok(r.blockers.some((b) => b.startsWith('planned-estimate-missing-comment')));
  assert.equal(calls.moves.length, 0);
});

test('promote: plan→develop refused when any sub-issue still in Backlog (#135)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'plan' });
  deps.plannedEstimate = {
    listComments: async () => [
      {
        id: 'IC_E',
        body: '<!-- aitm-refined-estimate: 200 -->\n### 🛠 Refine estimate\n\n### Planned Estimate\n',
      },
    ],
  };
  deps.epicChildren = {
    fetchSiblings: async () => [
      { number: 201, state: 'refine', sequence: 1 },
      { number: 202, state: 'backlog', sequence: 2 },
    ],
  };
  const r = await runPromote({ issueNumber: 200, cfg, deps });
  assert.equal(r.status, 'epic-children-refused');
  assert.ok(r.blockers.some((b) => /#202/.test(b)));
  assert.equal(calls.moves.length, 0);
});

test('promote: plan→develop refused when any sub-issue is PAST refine (#149 — children must not lead parent)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'plan' });
  deps.plannedEstimate = {
    listComments: async () => [
      {
        id: 'IC_E',
        body: '<!-- aitm-refined-estimate: 2000 -->\n### 🛠 Refine estimate\n\n### Planned Estimate\n',
      },
    ],
  };
  deps.epicChildren = {
    fetchSiblings: async () => [
      { number: 201, state: 'refine', sequence: 1 },
      { number: 202, state: 'plan', sequence: 2 },
      { number: 203, state: 'develop', sequence: 3 },
    ],
  };
  const r = await runPromote({ issueNumber: 2000, cfg, deps });
  assert.equal(r.status, 'epic-children-refused');
  assert.ok(r.blockers.some((b) => /epic-children-not-at-refine/.test(b)));
  assert.ok(r.blockers.some((b) => /#202/.test(b)));
  assert.ok(r.blockers.some((b) => /#203/.test(b)));
  assert.equal(calls.moves.length, 0);
});

test('promote: refine→plan refused when an epic child is PAST refine (#149 — lead-rule)', async () => {
  const rationale =
    '<!-- aitm-refinement-rationale: {"size":"a","estimate":"b","priority":"c"} -->';
  const ac = '## Acceptance Criteria\n- [ ] foo\n';
  const body = `${bodyWithState('refine')}\n${rationale}\n\n${ac}`;
  const { deps, calls } = makeDeps({ body, live: 'refine' });
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ size: 'S', estimate: 4, priority: 'P2' }),
    listCommentBodies: async () => [],
    postComment: async () => {},
    writeIssueBody: async () => {},
  };
  deps.refineToPlanGate = async () => ({
    ok: false,
    blockers: [
      'refine-exit-children-not-at-refine: every epic child must be at refine (children must not lead the parent): #202 (state=plan)',
    ],
  });
  const r = await runPromote({ issueNumber: 1490, cfg, deps });
  assert.equal(r.status, 'refine-exit-refused');
  assert.ok(r.blockers.some((b) => /children-not-at-refine/.test(b)));
  assert.equal(calls.moves.length, 0);
});

test('promote: plan→develop refused when planned-estimate appendix is missing (#134)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'plan' });
  deps.plannedEstimate = {
    listComments: async () => [
      {
        id: 'IC_2',
        body: '<!-- aitm-refined-estimate: 1012 -->\n### 🛠 Refine estimate\n\nNo appendix yet.\n',
      },
    ],
  };
  const r = await runPromote({ issueNumber: 1012, cfg, deps });
  assert.equal(r.status, 'planned-estimate-refused');
  assert.ok(r.blockers.some((b) => b.startsWith('planned-estimate-appendix-missing')));
  assert.equal(calls.moves.length, 0);
});

test('promote: develop→test delegates to /task test (#137)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('develop'), live: 'develop' });
  const r = await runPromote({ issueNumber: 102, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'test');
  assert.equal(r.via, 'alias:test');
  assert.deepEqual(calls.spawns, [{ verb: 'test', issueNumber: 102 }]);
});

test('promote: develop→test refused when CODE_COMPLETE gate returns blockers (#136)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('develop'), live: 'develop' });
  deps.codeCompleteGate = async () => ({
    ok: false,
    blockers: ['code-complete-ac-unverified: First AC', 'code-complete-commits-missing: ...'],
    shas: [],
  });
  const r = await runPromote({ issueNumber: 1361, cfg, deps });
  assert.equal(r.status, 'code-complete-refused');
  assert.equal(r.blockers.length, 2);
  assert.equal(calls.spawns.length, 0);
  assert.equal(calls.moves.length, 0);
});

test('promote: develop→test allowed when CODE_COMPLETE gate passes (#136)', async () => {
  let gateCalled = 0;
  const { deps, calls } = makeDeps({ body: bodyWithState('develop'), live: 'develop' });
  deps.codeCompleteGate = async ({ issueNumber }) => {
    gateCalled += 1;
    assert.equal(issueNumber, 1362);
    return { ok: true, blockers: [], shas: ['abc'] };
  };
  const r = await runPromote({ issueNumber: 1362, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'test');
  assert.equal(gateCalled, 1);
  assert.deepEqual(calls.spawns, [{ verb: 'test', issueNumber: 1362 }]);
});

test('promote: test→review is a direct move-state call (no alias verb exists)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('test'), live: 'test' });
  const r = await runPromote({ issueNumber: 103, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'review');
  assert.equal(r.via, 'direct');
  assert.equal(calls.spawns.length, 0);
  assert.deepEqual(calls.moves, [{ issueNumber: 103, target: 'review' }]);
});

test('promote: review→done delegates to /task close', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('review'), live: 'review' });
  const r = await runPromote({ issueNumber: 104, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'done');
  assert.equal(r.via, 'alias:close');
  assert.deepEqual(calls.spawns, [{ verb: 'close', issueNumber: 104 }]);
});

test('promote: backlog→refine is a direct move-state call gated only on Priority (#133)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('backlog'), live: 'backlog' });
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ priority: 'P2' }),
  };
  const r = await runPromote({ issueNumber: 105, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.via, 'direct');
  assert.deepEqual(calls.moves, [{ issueNumber: 105, target: 'refine' }]);
  // No refine-estimate comment posted on backlog→refine; that fires at refine→plan.
  assert.equal(r.refinementPost, null);
});

test('promote: backlog→refine refused when Priority is missing on the board', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('backlog'), live: 'backlog' });
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({}),
  };
  const r = await runPromote({ issueNumber: 1055, cfg, deps });
  assert.equal(r.status, 'refine-gate-refused');
  assert.ok(r.blockers.some((b) => b.startsWith('refine-field-missing')));
  assert.equal(calls.moves.length, 0);
});

test('promote: terminal refusal on done', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('done'), live: 'done' });
  const r = await runPromote({ issueNumber: 106, cfg, deps });
  assert.equal(r.status, 'terminal-refused');
  assert.match(r.message, /already in done/);
  assert.equal(calls.spawns.length, 0);
  assert.equal(calls.moves.length, 0);
});

test('promote: drift refused when live ≠ recorded', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'develop' });
  const r = await runPromote({ issueNumber: 107, cfg, deps });
  assert.equal(r.status, 'drift-refused');
  assert.equal(r.live, 'develop');
  assert.equal(r.recorded, 'plan');
  assert.match(r.message, /drift detected/);
  assert.match(r.message, /\/task reconcile/);
  assert.equal(calls.spawns.length, 0);
  assert.equal(calls.moves.length, 0);
});

test('promote: bootstrap when lastKnownState absent — syncs to live, then promotes', async () => {
  const { deps, calls } = makeDeps({ body: '## just a body\n', live: 'plan' });
  deps.plannedEstimate = {
    listComments: async () => [
      {
        id: 'IC_BOOT',
        body: '<!-- aitm-refined-estimate: 108 -->\n### 🛠 Refine estimate\n\n### Planned Estimate\n',
      },
    ],
  };
  const r = await runPromote({ issueNumber: 108, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.bootstrapped, true);
  assert.equal(r.from, 'plan');
  assert.equal(r.to, 'develop');
  // The bootstrap write happens before the transition; the post-transition
  // re-stamp may also write. At minimum the bootstrap write was made.
  assert.ok(calls.writes.length >= 1);
  assert.match(calls.writes[0], /aitm-last-known-state: plan/);
});

test('promote: transition-failed when alias verb exits non-zero — no metadata update', async () => {
  const { deps, calls } = makeDeps({
    body: bodyWithState('develop'),
    live: 'develop',
    liveAfter: 'develop',
    spawnCode: 4,
  });
  const r = await runPromote({ issueNumber: 109, cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.transitionResult.exitCode, 4);
  assert.equal(r.reconciledTo, null);
  // Live state matches recorded after failure — no drift, no row, no write.
  assert.equal(calls.timings.length, 0);
  assert.equal(calls.writes.length, 0);
});

test('promote: delegate non-zero but board reached target → promoted-with-warning (#175)', async () => {
  // #175 — when the alias verb's Status move lands the board at `target`
  // and a *subsequent* alias-internal step fails, promote treats the outcome
  // as a soft warning (not transition-failed). Markers are already in sync
  // (move-state stamps centrally per #170), so no body repair write fires.
  const bodyAfter = bodyWithState('test') + '\n<!-- aitm-entered-test: 2026-05-18T00:00:00Z -->\n';
  const { deps, calls } = makeDeps({
    body: bodyWithState('develop'),
    live: 'develop',
    liveAfter: 'test',
    spawnCode: 3,
    fetchSecondBody: bodyAfter,
  });
  const r = await runPromote({ issueNumber: 132, cfg, deps });
  assert.equal(r.status, 'promoted-with-warning');
  assert.equal(r.from, 'develop');
  assert.equal(r.to, 'test');
  assert.equal(r.delegate, 'test');
  assert.equal(r.delegateExitCode, 3);
  assert.equal(r.markerRepair.status, 'noop');
  assert.equal(calls.writes.length, 0, 'no repair write when markers already correct');
  // #128 — promoted-with-warning no longer emits a `move:<target>` audit row.
  // The paired phase rows are emitted from move-state.mjs (chokepoint) on
  // every successful Status mutation, including the path that produced this
  // warning. The verb no longer duplicates that row.
  assert.equal(calls.timings.length, 0);
});

test('promote: delegate non-zero, board at target, marker stale → repair write fires (#175)', async () => {
  // Post-failure body still reads lastKnownState=develop even though Status
  // is at test (centralized #170 stamp didn't run, e.g. move-state crashed
  // after Status mutation but before marker write). promote must repair.
  const staleBodyAfter = bodyWithState('develop');
  const { deps, calls } = makeDeps({
    body: bodyWithState('develop'),
    live: 'develop',
    liveAfter: 'test',
    spawnCode: 1,
    fetchSecondBody: staleBodyAfter,
  });
  const r = await runPromote({ issueNumber: 1751, cfg, deps });
  assert.equal(r.status, 'promoted-with-warning');
  assert.equal(r.markerRepair.status, 'ok');
  assert.equal(r.markerRepair.attempts, 1);
  assert.equal(calls.writes.length, 1);
  assert.match(calls.writes[0], /aitm-last-known-state: test/);
  assert.match(calls.writes[0], /aitm-entered-test:/);
});

test('promote: delegate non-zero, marker repair write fails → audit comment posted (#175, #168)', async () => {
  const staleBodyAfter = bodyWithState('develop');
  const { deps, calls } = makeDeps({
    body: bodyWithState('develop'),
    live: 'develop',
    liveAfter: 'test',
    spawnCode: 1,
    fetchSecondBody: staleBodyAfter,
  });
  // Force writeIssueBody to fail (twice → audit fallback).
  deps.writeIssueBody = async () => {
    throw new Error('simulated gh failure');
  };
  const auditPosts = [];
  deps.postComment = async ({ body }) => {
    auditPosts.push(body);
  };
  const r = await runPromote({ issueNumber: 1752, cfg, deps });
  assert.equal(r.status, 'promoted-with-warning');
  assert.equal(r.markerRepair.status, 'failed');
  assert.equal(r.markerRepair.auditPosted, true);
  assert.equal(auditPosts.length, 1);
  assert.match(auditPosts[0], /state-recording-failed/);
});

test('promote: delegate non-zero AND board drifted to non-target → transition-failed (#175)', async () => {
  // Drifted to an intermediate / unrelated state (not target). Existing
  // transition-failed behavior preserved — drift-reconcile audit row only.
  const { deps, calls } = makeDeps({
    body: bodyWithState('develop'),
    live: 'develop',
    liveAfter: 'review', // not target (target would be 'test')
    spawnCode: 3,
  });
  const r = await runPromote({ issueNumber: 1753, cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.reconciledTo, 'review');
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.timings.length, 1);
  assert.match(calls.timings[0], /drift-reconcile/);
});

test('promote: drift-reconcile is a no-op when live state matches recorded after failure', async () => {
  const { deps, calls } = makeDeps({
    body: bodyWithState('develop'),
    live: 'develop',
    liveAfter: 'develop',
    spawnCode: 3,
  });
  const r = await runPromote({ issueNumber: 133, cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.reconciledTo, null);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.timings.length, 0);
});

test('promote: drift-reconcile survives getLiveState throwing on the post-failure read', async () => {
  const { deps, calls } = makeDeps({
    body: bodyWithState('develop'),
    live: 'develop',
    liveThrowsAfter: true,
    spawnCode: 3,
  });
  const r = await runPromote({ issueNumber: 134, cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.reconciledTo, null);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.timings.length, 0);
});

test('promote: error when recorded state is unknown', async () => {
  const { deps } = makeDeps({
    body: '<!-- aitm-last-known-state: bogus -->\n<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->\n',
    live: 'bogus',
  });
  const r = await runPromote({ issueNumber: 110, cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /unknown recorded state/);
});

test('promote: no longer writes a move:<target> audit row (#128 — chokepoint emits paired phase rows)', async () => {
  // #128 — the legacy `move:<target>` audit row was redundant with the
  // paired `<prev>:complete` + `<next>:enter` rows emitted from
  // move-state.mjs. promote no longer writes the audit row inline.
  const { deps, calls } = makeDeps({ body: bodyWithState('test'), live: 'test' });
  await runPromote({ issueNumber: 111, cfg, deps });
  assert.equal(calls.timings.length, 0);
});
