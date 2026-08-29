// @story #820
// #820 — `promote` from Test must delegate to the `review` verb so the Agent
// Review Gate runs. Before this fix `ALIAS_VERB` was `{develop:'test',
// review:'close'}` — no `test` entry — so a Test source fell through to the
// direct move-state call and reached the Review column with the gate never
// invoked. The gate was enforced only when someone explicitly ran
// `/task review <N>`; on the default forward-drive path it was silently
// skipped. Observed live on #812, #849, and #878 (`test → review (direct)`).
//
// The code fix (add `test: 'review'` to `ALIAS_VERB`) shipped on trunk via
// #881; #881's companion suite (`promote-test-review-alias.test.mjs`) pins the
// map SHAPE structurally. These tests are the BEHAVIORAL complement: they drive
// `runPromote` end-to-end and pin that the Test source ROUTES through the review
// delegate rather than around it, and that the alias path's failure handling
// (#175 board-reached-target classification, #710 false-success defense) covers
// the Test source now that it takes that path.
//
// #881 also fixed the state-action MODEL: entering Review is unconditional and
// the Agent Review Gate is the action performed WHILE in Review — a gate
// objection now LEAVES the issue in Review rather than demoting it to Develop.
// The AC3 cases below are framed to that model: promote must never fabricate a
// direct move-state fallback, and a delegate that objects after the issue has
// entered Review surfaces as `promoted-with-warning` (still in Review), not as
// a false `promoted` and not as a demote.

import { test } from 'node:test';
import '../../../fixtures/offline-gh-auto.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { runPromote } from '../../../../task-tracker/verbs/promote.mjs';

// Keep the verb's withIssueLock dir off the live project tree.
process.env.AI_TASK_MANAGER_PROJECT_DIR = mkdtempSync(
  join(projectScratchDir('test'), 'promote-820-')
);

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

const DOD_MARKER = '\n<!-- aitm-dod-verified: abc1234:2026-05-18T00:00:00Z -->\n';

// A Test-state body that satisfies the test→review exit guards: the
// dod-verified marker is present and every checkbox is ticked.
function readyTestBody() {
  return (
    '<!-- aitm-last-known-state: test -->\n' +
    '<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->\n\n' +
    '## User Story\n\nAs a developer\nI want the gate to run\nSo that Review means something\n\n' +
    '## Issue\n\nbody.\n' +
    DOD_MARKER +
    '\n## Acceptance Criteria\n- [x] First AC\n'
  );
}

function makeDeps({ body, live, liveAfter, spawnCode = 0, moveCode = 0 } = {}) {
  let liveCalls = 0;
  const calls = { spawns: [], moves: [] };
  return {
    calls,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body }),
      mutateIssueBody: async () => ({ status: 'no-op', attempts: 1 }),
      getLiveState: async () => {
        liveCalls += 1;
        if (liveCalls === 1) return live;
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
      epicChildren: { fetchSiblings: async () => [] },
      codeCompleteGate: async () => ({ ok: true, blockers: [], shas: [] }),
      commitTrailHeadGate: async () => ({ ok: true, headSha: 'deadbeef', trailShas: ['deadbeef'] }),
    },
  };
}

// --- AC1 / AC2: the transition routes through the gate ----------------------

test('AC1 — promote from Test delegates to the review verb, not the direct move path', async () => {
  const { deps, calls } = makeDeps({
    body: readyTestBody(),
    live: 'test',
    liveAfter: 'review',
  });

  const r = await runPromote({ issueNumber: 820, cfg, deps });

  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'review');
  // The gate lives inside verbReview; spawning it IS running the gate.
  assert.deepEqual(calls.spawns, [{ verb: 'review', issueNumber: 820 }]);
  // Pre-#820 this was the ONLY thing that happened, and it is what let the
  // issue reach Review un-gated.
  assert.deepEqual(calls.moves, [], 'must not take the direct move-state path');
});

// --- AC5: the route label ---------------------------------------------------

test('AC5 — the reported route is alias:review, never direct', async () => {
  const { deps } = makeDeps({ body: readyTestBody(), live: 'test', liveAfter: 'review' });
  const r = await runPromote({ issueNumber: 820, cfg, deps });
  assert.equal(r.via, 'alias:review');
  assert.notEqual(r.via, 'direct', "the regression's live signature must be unreproducible");
});

// --- AC3: a delegate failure never becomes a direct move --------------------

test('AC3 — a delegate that never reaches Review does not fall back to a direct move', async () => {
  // The review delegate exits non-zero and the board is not at Review (the
  // move never took). promote must NOT paper over that with the direct
  // move-state path — doing so would reach Review with the gate bypassed,
  // the exact regression #820/#881 close.
  const { deps, calls } = makeDeps({
    body: readyTestBody(),
    live: 'test',
    liveAfter: 'test',
    spawnCode: 4,
  });

  const r = await runPromote({ issueNumber: 820, cfg, deps });

  assert.equal(r.status, 'transition-failed');
  assert.notEqual(r.status, 'promoted');
  assert.deepEqual(calls.moves, [], 'a failed delegate must not fall back to a direct move');
});

test('AC3 — #881 model: a gate objection after entry leaves the issue in Review (no demote, no direct move)', async () => {
  // #881: entering Review is unconditional; the gate is the in-Review action.
  // So when the delegate exits non-zero AFTER the board has reached Review
  // (gate objected in-place), promote surfaces a soft warning — the issue is
  // correctly still in Review, NOT demoted to Develop and NOT moved by a
  // direct fallback.
  const { deps, calls } = makeDeps({
    body: readyTestBody(),
    live: 'test',
    liveAfter: 'review',
    spawnCode: 4,
  });

  const r = await runPromote({ issueNumber: 820, cfg, deps });

  assert.equal(r.status, 'promoted-with-warning');
  assert.equal(r.to, 'review');
  assert.equal(r.delegate, 'review');
  assert.deepEqual(calls.moves, [], 'the in-Review objection must not trigger a direct move');
});

test('AC3 — #710 defense: delegate exits 0 but board never reached Review', async () => {
  const { deps } = makeDeps({
    body: readyTestBody(),
    live: 'test',
    liveAfter: 'test',
    spawnCode: 0,
  });

  const r = await runPromote({ issueNumber: 820, cfg, deps });

  assert.equal(r.status, 'transition-failed');
  assert.match(r.message, /refusing to report a false success/i);
});

// --- AC6: the other alias routes are untouched ------------------------------

test('AC6 — develop still delegates to test', async () => {
  const body =
    '<!-- aitm-last-known-state: develop -->\n' +
    '<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->\n\n## Issue\n\nbody.\n';
  const { deps, calls } = makeDeps({ body, live: 'develop', liveAfter: 'test' });

  const r = await runPromote({ issueNumber: 821, cfg, deps });

  assert.equal(r.via, 'alias:test');
  assert.deepEqual(calls.spawns, [{ verb: 'test', issueNumber: 821 }]);
});

test('AC6 — review still delegates to close (when Agent Review genuinely passed)', async () => {
  // #998 — promote's review→close alias only fires once the Review state's
  // own action (the Agent Review Gate) has actually completed with a passing
  // result; the fixture must carry that evidence or the new precondition
  // check redirects to `review` instead.
  const body =
    '<!-- aitm-last-known-state: review -->\n' +
    '<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->\n\n## Issue\n\nbody.\n\n' +
    '- [x] Agent Review Passed <!-- aitm-verified ts="2026-05-10T00:00:00Z" gate="agent-review" result="pass" -->\n';
  const { deps, calls } = makeDeps({ body, live: 'review', liveAfter: 'done' });

  const r = await runPromote({ issueNumber: 822, cfg, deps });

  assert.equal(r.via, 'alias:close');
  assert.deepEqual(calls.spawns, [{ verb: 'close', issueNumber: 822 }]);
});
