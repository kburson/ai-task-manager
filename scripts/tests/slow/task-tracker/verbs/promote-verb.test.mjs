#!/usr/bin/env node
// @story #68
// Unit tests for scripts/task-tracker/verbs/promote.mjs.
//
// All cases drive runPromote with stubbed deps — no network, no spawn.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { stampRefinementSnapshot } from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import { runPromote } from '../../../../task-tracker/verbs/promote.mjs';

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
      projectDir: process.cwd(),
      assertBound: () => {},
      fetchIssueBody: async () => {
        calls.fetches++;
        if (secondFetch && fetchSecondBody !== undefined) return { body: fetchSecondBody };
        secondFetch = true;
        return { body };
      },
      // #295 — verbs write through `mutateIssueBody({mutate})`. The closure
      // is invoked with the FRESH base; this fake feeds whatever the current
      // fetch would return (initial body pre-soft-warning, fetchSecondBody
      // post-fetch toggle) so the marker-repair path sees the "post-move"
      // body when the soft-warning branch runs.
      mutateIssueBody: async ({ mutate }) => {
        const base = secondFetch && fetchSecondBody !== undefined ? fetchSecondBody : body;
        const next = mutate(base);
        if (next === base) return { status: 'no-op', attempts: 1 };
        calls.writes.push(next);
        return { status: 'ok', attempts: 1 };
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
      decomposition: {
        projectDir: process.cwd(),
        loadProjectFieldDefs: () => [],
        projectValuesForIssue: async () => ({ size: 'XS', estimate: 4 }),
      },
      ownership: {
        fetchCurrentUser: async () => 'kburson',
        fetchSnapshot: async () => ({ state: 'plan', assignees: ['kburson'] }),
      },
      codeCompleteGate: async () => ({ ok: true, blockers: [], shas: [] }),
      commitTrailHeadGate: async () => ({ ok: true, headSha: 'deadbeef', trailShas: ['deadbeef'] }),
    },
  };
}

// #297 — plan→develop now requires Deep-Dive Analysis signals. Tests that
// reach the children/bootstrap gates need the signals in the body so the
// new gate passes and the deeper gate under test runs.
const DEEP_DIVE_SIGNALS = [
  '',
  '## Plan Metadata',
  '',
  '- **size**: XS',
  '',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '',
  '- [x] Deep dive complete',
  '',
  '<!-- aitm-deep-dive-posted: 2026-06-04 -->',
  '## Deep-Dive Analysis (2026-06-04)',
  // #358 — planDeepDiveGate now enforces a size-bucketed substantive-chars
  // floor (XS=1200, default=2000). Pad the section past the XS floor and tag
  // the body as XS so the gate is satisfied.
  ...Array.from(
    { length: 20 },
    (_, i) =>
      `line ${i + 1}: substantive analysis paragraph describing the change, the surrounding subsystem, the risk surface, and the verification approach.`
  ),
  '<!-- aitm-deep-dive-complete: 2026-06-04T23:00:00Z -->',
  // #386 — plan→develop now refuses a body lacking a Verification Commands
  // section with >= 1 parseable entry (planExitVcPresenceGuard). Plan-state
  // fixtures that exercise the deeper promote gates need it present.
  '## Verification Commands',
  '',
  '- [ ] `npm run test:all`',
  `<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: { size: 'XS' } })} -->`,
  '',
].join('\n');

const USER_STORY_SECTION =
  '## User Story\n\nAs a developer\nI want to test the promote verb\nSo that the gate suite stays green\n';

function bodyWithState(state) {
  // #503 — `## User Story` must be the FIRST `## ` heading in the body; lead with
  // it so these fixtures satisfy the position check inherited by the gates.
  const base = `<!-- aitm-last-known-state: ${state} -->\n<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->\n\n${USER_STORY_SECTION}\n## Issue\n\nbody.\n`;
  return state === 'plan' ? base + DEEP_DIVE_SIGNALS : base;
}

// #282 — refine→R4P promotion requires this stage-completion marker.
// Tests that exercise the refine→R4P deeper gates include it in the body
// so the new marker-presence check passes and the deeper gate under test runs.
const REFINE_COMPLETE_MARKER = '<!-- aitm-refine-complete: 2026-06-03T00:00:00Z -->';

function validRefineBody() {
  const rationale =
    '<!-- aitm-refinement-rationale: {"size":"S","estimate":"4","priority":"P2","rank":3,"rationale":"current"} -->';
  return stampRefinementSnapshot(
    `${bodyWithState('refine')}\n${REFINE_COMPLETE_MARKER}\n${rationale}\n\n## Scope\n\nCurrent refinement scope for promote behavior.\n\n## Plan Metadata\n\n- **Depends On**: none\n\n## Acceptance Criteria\n\n- [ ] foo\n\n<!-- aitm-fields: {"schema":1,"values":{"priority":"P2","size":"S","estimate":4,"rank":3,"blockedBy":null}} -->\n`,
    { labels: ['enhancement'], ts: '2026-06-03T00:00:00Z' }
  );
}

function addRefinementSnapshotDeps(deps) {
  deps.refinementSnapshot = {
    fetchLabels: async () => ['enhancement'],
    fetchBoardFields: async () => ({ priority: 'P2', size: 'S', estimate: 4, rank: 3 }),
  };
}

test('promote: refine→R4P is a direct move-state call with refine-estimate hook', async () => {
  const body = validRefineBody();
  const { deps, calls } = makeDeps({ body, live: 'refine' });
  addRefinementSnapshotDeps(deps);
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
  assert.equal(r.to, 'ready-for-plan');
  assert.equal(r.via, 'direct');
  assert.equal(calls.spawns.length, 0);
  assert.deepEqual(calls.moves, [{ issueNumber: 100, target: 'ready-for-plan' }]);
  // #128 — promote no longer emits a `move:<target>` audit row. The paired
  // `<prev>:complete` + `<next>:enter` rows are emitted from move-state.mjs
  // (the chokepoint) and not visible to this dependency-injected fake.
  assert.equal(calls.timings.length, 0);
  assert.equal(r.refinementPost.status, 'posted');
  // Entry-marker stamping is now centralized in move-state.mjs (see
  // feedback_single_state_mutator.md). promote.mjs no longer stamps
  // aitm-entered-<stage>; verify it does not write the marker itself.
  assert.ok(
    !calls.writes.some((b) => /aitm-entered-ready-for-plan(?::|\s+ts=")/.test(b)),
    'promote must not stamp R4P entry; that is move-state.mjs responsibility'
  );
});

test('promote: refine→R4P refused when full refine-estimate signals are missing', async () => {
  const body = validRefineBody();
  const { deps, calls } = makeDeps({ body, live: 'refine' });
  addRefinementSnapshotDeps(deps);
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({}),
  };
  const r = await runPromote({ issueNumber: 1005, cfg, deps });
  assert.equal(r.status, 'refine-gate-refused');
  assert.ok(r.blockers.length >= 2);
  assert.equal(calls.moves.length, 0);
});

test('promote: refine→R4P refuses when Acceptance Criteria drift after snapshot', async () => {
  const body = validRefineBody().replace('- [ ] foo', '(none)');
  const { deps, calls } = makeDeps({ body, live: 'refine' });
  addRefinementSnapshotDeps(deps);
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ size: 'S', estimate: 4, priority: 'P2' }),
  };
  const r = await runPromote({ issueNumber: 1006, cfg, deps });
  assert.equal(r.status, 'refine-exit-refused');
  assert.ok(r.blockers.some((b) => /refinement-snapshot:acceptance-criteria/.test(b)));
  assert.equal(calls.moves.length, 0);
});

test('promote: refine→R4P refused when refine-exit gate returns blockers (#147)', async () => {
  const body = validRefineBody();
  const { deps, calls } = makeDeps({ body, live: 'refine' });
  addRefinementSnapshotDeps(deps);
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ size: 'S', estimate: 4, priority: 'P2' }),
    listCommentBodies: async () => [],
    postComment: async () => {},
    writeIssueBody: async () => {},
  };
  deps.refineToPlanGate = async () => ({
    ok: false,
    blockers: ['refine-exit-missing: Rank is not set on the project board'],
  });
  const r = await runPromote({ issueNumber: 1471, cfg, deps });
  assert.equal(r.status, 'refine-exit-refused');
  assert.ok(r.blockers.some((b) => /Rank/.test(b)));
  assert.equal(calls.moves.length, 0);
  assert.equal(calls.spawns.length, 0);
});

test('promote: backlog→refine stamps Start time on success (#147, #1211)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('backlog'), live: 'backlog' });
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

test('promote: backlog→refine is a direct move-state call without a Priority gate', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('backlog'), live: 'backlog' });
  let stampCalls = 0;
  deps.stampStartTime = async () => {
    stampCalls += 1;
    return { status: 'stamped' };
  };
  const r = await runPromote({ issueNumber: 1473, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.from, 'backlog');
  assert.equal(r.to, 'refine');
  assert.equal(r.via, 'direct');
  assert.deepEqual(calls.moves, [{ issueNumber: 1473, target: 'refine' }]);
  assert.equal(stampCalls, 1, 'Start time is stamped on Refine entry');
  assert.equal(r.refinementPost, null);
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

test('promote: plan→develop surfaces an empty Plan Metadata refusal before move-state', async () => {
  const body = bodyWithState('plan').replace('- **size**: XS', 'Planning discussion only.');
  const { deps, calls } = makeDeps({ body, live: 'plan' });
  deps.plannedEstimate = {
    listComments: async () => [
      {
        id: 'IC_1',
        body: '<!-- aitm-refined-estimate: 892 -->\n### Planned Estimate\n',
      },
    ],
  };

  const result = await runPromote({ issueNumber: 892, cfg, deps });

  assert.equal(result.status, 'plan-metadata-refused');
  assert.ok(result.blockers.some((blocker) => /plan-develop-plan-metadata-empty/.test(blocker)));
  assert.equal(calls.moves.length, 0);
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
      { number: 201, state: 'ready-for-plan', rank: 1, hasCurrentRefinement: true },
      { number: 202, state: 'backlog', rank: 2 },
    ],
  };
  const r = await runPromote({ issueNumber: 200, cfg, deps });
  assert.equal(r.status, 'epic-children-refused');
  assert.ok(r.blockers.some((b) => /#202/.test(b)));
  assert.equal(calls.moves.length, 0);
});

test('promote: plan→develop refuses only children without current R4P-or-later evidence', async () => {
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
      { number: 201, state: 'ready-for-plan', rank: 1, hasCurrentRefinement: true },
      { number: 202, state: 'plan', rank: 2, hasCurrentRefinement: true },
      { number: 203, state: 'develop', rank: 3, hasCurrentRefinement: true },
      { number: 204, state: 'backlog', rank: 4, hasCurrentRefinement: false },
    ],
  };
  const r = await runPromote({ issueNumber: 2000, cfg, deps });
  assert.equal(r.status, 'epic-children-refused');
  assert.ok(r.blockers.some((b) => /epic-children-not-r4p/.test(b)));
  assert.ok(r.blockers.some((b) => /#204/.test(b)));
  // Current R4P-or-later children must NOT appear in the offender list.
  assert.ok(!r.blockers.some((b) => /#202/.test(b)));
  assert.ok(!r.blockers.some((b) => /#203/.test(b)));
  assert.equal(calls.moves.length, 0);
});

test('promote: refine→plan refused when an epic child is PAST refine (#149 — lead-rule)', async () => {
  const body = validRefineBody();
  const { deps, calls } = makeDeps({ body, live: 'refine' });
  addRefinementSnapshotDeps(deps);
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
  // #710 — alias transition; success path re-reads the board (post-move = test).
  const { deps, calls } = makeDeps({
    body: bodyWithState('develop'),
    live: 'develop',
    liveAfter: 'test',
  });
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
  // #710 — develop→test is an alias transition (the `test` verb); the success
  // path now re-reads the live board, so the fixture must reflect the post-move
  // state (a successful `/task test` moves the board to `test`).
  const { deps, calls } = makeDeps({
    body: bodyWithState('develop'),
    live: 'develop',
    liveAfter: 'test',
  });
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

// #881 — test→review is an ALIAS transition (the `review` verb), so the Agent
// Review Gate — the Review state's action — runs on arrival. It used to be a
// direct move, which parked the issue in Review with its action never run.
test('promote: test→review delegates to the review verb', async () => {
  // #210 (Fix C) — test→review requires `aitm-dod-verified` in the body.
  const body =
    bodyWithState('test') + '\n<!-- aitm-dod-verified: abc1234:2026-05-18T00:00:00Z -->\n';
  const { deps, calls } = makeDeps({ body, live: 'test', liveAfter: 'review' });
  const r = await runPromote({ issueNumber: 103, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'review');
  assert.equal(r.via, 'alias:review');
  assert.deepEqual(calls.spawns, [{ verb: 'review', issueNumber: 103 }]);
  assert.deepEqual(calls.moves, [], 'the alias verb owns the move, not promote');
});

test('promote: test→review refused when aitm-dod-verified marker is missing (#210 Fix C)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('test'), live: 'test' });
  const r = await runPromote({ issueNumber: 1031, cfg, deps });
  assert.equal(r.status, 'dod-verified-missing');
  assert.ok(r.blockers.some((b) => b.startsWith('test-to-review-dod-missing')));
  assert.equal(calls.moves.length, 0, 'no move-state call when gate refuses');
});

test('promote: test→review REFUSED when a non-lifecycle checkbox is still unticked (#257)', async () => {
  // The defect: `/task promote` test→review is a DIRECT move that bypasses
  // verbReview, so verbReview's completeness gate never ran on this path. The
  // gate now lives in promote's preflight and reuses the close-gate scanner.
  const body =
    bodyWithState('test') +
    '\n<!-- aitm-dod-verified: abc1234:2026-05-18T00:00:00Z -->\n' +
    '\n## Acceptance Criteria\n- [x] Functional AC ticked at CODE_COMPLETE\n' +
    '- [ ] A manual checklist item nobody ticked\n';
  const { deps, calls } = makeDeps({ body, live: 'test' });
  const r = await runPromote({ issueNumber: 2571, cfg, deps });
  assert.equal(r.status, 'completeness-refused');
  assert.ok(
    r.blockers.some((b) => b.startsWith('test-to-review-incomplete')),
    'blocker must name the incomplete-checkbox gate'
  );
  assert.ok(
    r.blockers.some((b) => /A manual checklist item nobody ticked/.test(b)),
    'blocker must surface the offending checkbox label'
  );
  assert.equal(calls.moves.length, 0, 'no move-state call when completeness gate refuses');
  assert.equal(calls.spawns.length, 0);
});

test('promote: test→review ALLOWED when dod-verified present and every checkbox ticked (#257)', async () => {
  const body =
    bodyWithState('test') +
    '\n<!-- aitm-dod-verified: abc1234:2026-05-18T00:00:00Z -->\n' +
    '\n## Acceptance Criteria\n- [x] First AC\n- [x] Second AC\n';
  const { deps, calls } = makeDeps({ body, live: 'test', liveAfter: 'review' });
  const r = await runPromote({ issueNumber: 2572, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'review');
  assert.equal(r.via, 'alias:review');
  assert.deepEqual(calls.spawns, [{ verb: 'review', issueNumber: 2572 }]);
});

// #998 — review→close only fires once Agent Review genuinely passed; these
// fixtures must carry that evidence marker, same signal `approve.mjs` gates on.
const AGENT_REVIEW_PASSED_LINE =
  '- [x] Agent Review Passed <!-- aitm-verified ts="2026-05-10T00:00:00Z" gate="agent-review" result="pass" -->\n';

test('promote: review→done delegates to /task close', async () => {
  // #710 — the happy path now re-reads the live board after the alias close and
  // only reports `promoted` when it actually reached `done`. A successful close
  // moves the board to done, so the fixture must reflect that post-move state.
  const { deps, calls } = makeDeps({
    body: bodyWithState('review') + AGENT_REVIEW_PASSED_LINE,
    live: 'review',
    liveAfter: 'done',
  });
  const r = await runPromote({ issueNumber: 104, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'done');
  assert.equal(r.via, 'alias:close');
  assert.deepEqual(calls.spawns, [{ verb: 'close', issueNumber: 104 }]);
});

test('promote: review→done reports transition-failed when close exits 0 but board stays review (#710)', async () => {
  // The original defect: close.mjs exited 0 on a blocked dirty-close, so promote
  // reported a false `✓ promoted`. With the alias re-verify, an exit-0 that did
  // NOT move the board to `done` is caught and downgraded to transition-failed.
  const { deps, calls } = makeDeps({
    body: bodyWithState('review') + AGENT_REVIEW_PASSED_LINE,
    live: 'review',
    spawnCode: 0,
    liveAfter: 'review',
  });
  const r = await runPromote({ issueNumber: 710, cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.match(r.message, /exited 0 but board is "review"/);
  assert.match(r.message, /refusing to report a false success/);
  // The close was still delegated — the guard fires only on its result.
  assert.deepEqual(calls.spawns, [{ verb: 'close', issueNumber: 710 }]);
});

test('promote: historical Assigned body canonicalizes to R4P before drift comparison', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('assigned'), live: 'ready-for-plan' });
  const r = await runPromote({ issueNumber: 105, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.via, 'direct');
  assert.deepEqual(calls.moves, [{ issueNumber: 105, target: 'plan' }]);
  assert.equal(r.refinementPost, null);
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
  // #297 — plan→develop now needs deep-dive signals; bootstrap is mid-flight
  // but still hits the same pre-flight, so include them in the seed body.
  const { deps, calls } = makeDeps({
    body: '## just a body\n' + DEEP_DIVE_SIGNALS,
    live: 'plan',
  });
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
  assert.match(calls.writes[0], /aitm-last-known-state state="plan"/);
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
  // #210 (Fix B) — soft-warning path requires `aitm-dod-verified` to be
  // present in the post-move body. Sandbox produced its green proof; only a
  // *subsequent* alias-internal step failed.
  const bodyAfter =
    bodyWithState('test') +
    '\n<!-- aitm-entered-test: 2026-05-18T00:00:00Z -->\n' +
    '<!-- aitm-dod-verified: abc1234:2026-05-18T00:00:00Z -->\n';
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
  // #210 (Fix B) — dod-verified must be present so the soft-warning path
  // applies; otherwise the alias=test failure falls through to transition-failed.
  const staleBodyAfter =
    bodyWithState('develop') + '\n<!-- aitm-dod-verified: abc1234:2026-05-18T00:00:00Z -->\n';
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
  assert.match(calls.writes[0], /aitm-last-known-state state="test"/);
  assert.match(calls.writes[0], /aitm-entered-test(?::|\s+ts=")/);
});

test('promote: delegate non-zero, marker repair write fails → audit comment posted (#175, #168)', async () => {
  // #210 (Fix B) — needs dod-verified present so the soft-warning path applies.
  const staleBodyAfter =
    bodyWithState('develop') + '\n<!-- aitm-dod-verified: abc1234:2026-05-18T00:00:00Z -->\n';
  const { deps, calls } = makeDeps({
    body: bodyWithState('develop'),
    live: 'develop',
    liveAfter: 'test',
    spawnCode: 1,
    fetchSecondBody: staleBodyAfter,
  });
  // Force mutateIssueBody to fail (twice → audit fallback).
  deps.mutateIssueBody = async () => {
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

test('promote: alias=test exit non-zero, board at target, NO aitm-dod-verified → promoted-with-warning, no rollback (#271 regression guard)', async () => {
  // #271 removed the #210 (Fix B) defensive post-move rollback. Under #270 the
  // `test` verb is gate-first: the develop-exit sandbox-proof guard refuses the
  // Status write before the board ever moves, so "board reached `test` without
  // an `aitm-dod-verified` proof" is structurally unreachable on the supported
  // path. The dead rollback branch is gone, and promote no longer requires a
  // dod-verified marker to take the soft-warning path.
  //
  // This test pins that behavioral change: the delegate exits non-zero, the
  // board reached `test`, and the post-move body carries the sync markers
  // (last-known-state + entered-test) but NO `aitm-dod-verified` proof. Promote
  // must return `promoted-with-warning` with markers already in sync (noop
  // repair, zero body writes) and must NOT roll the board back to `develop`
  // (zero moveState calls — the alias path spawns `/task test`, never
  // move-state directly). If a future change reintroduces the rollback this
  // assertion fails.
  const bodyAfterNoDod =
    bodyWithState('test') + '\n<!-- aitm-entered-test: 2026-05-18T00:00:00Z -->\n';
  const { deps, calls } = makeDeps({
    body: bodyWithState('develop'),
    live: 'develop',
    liveAfter: 'test',
    spawnCode: 1,
    fetchSecondBody: bodyAfterNoDod,
  });
  const r = await runPromote({ issueNumber: 2101, cfg, deps });
  assert.equal(r.status, 'promoted-with-warning');
  assert.equal(r.from, 'develop');
  assert.equal(r.to, 'test');
  assert.equal(r.delegate, 'test');
  assert.equal(r.delegateExitCode, 1);
  assert.equal(r.markerRepair.status, 'noop');
  assert.equal(calls.writes.length, 0, 'markers already in sync — no repair write');
  assert.equal(calls.moves.length, 0, 'no rollback: the #210 Fix B rollback was removed in #271');
});

test('promote: delegate non-zero AND board drifted to non-target → transition-failed (#175)', async () => {
  // Drifted to an intermediate / unrelated state (not target). Existing
  // transition-failed behavior preserved — #516 demotes the reconcile to a
  // body audit marker (`aitm-reconciled`) instead of a ⏱ Timing Log row.
  const { deps, calls } = makeDeps({
    body: bodyWithState('develop'),
    live: 'develop',
    liveAfter: 'review', // not target (target would be 'test')
    spawnCode: 3,
  });
  const r = await runPromote({ issueNumber: 1753, cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.reconciledTo, 'review');
  assert.equal(calls.writes.length, 1);
  assert.match(calls.writes[0], /aitm-reconciled/);
  assert.match(calls.writes[0], /develop → review/);
  assert.equal(calls.timings.length, 0);
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
