#!/usr/bin/env node
// @story #935
//
// demote-to-develop is a CODE-REWORK path and nothing else (#935). The verb
// HARD-REFUSES unless the caller declares the code-change intent with a non-empty
// `--rework "<reason>"`, and threads that reason into `move-state.mjs
// --demote-reason` so it lands on the `demoted:<state>` timing row.
//
// These tests drive the pure core (`runDemote`) and the arg/argv seams directly,
// via dependency injection, so no live GitHub round-trip is needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runDemote, defaultRunMoveState, parseArgs } from './demote.mjs';
import { invalidateEvidence } from '../lib/evidence-invalidation.mjs';
import { upsertProofMarker } from '../lib/proof-marker.mjs';
import { findLostMarkers } from '../lib/body-invariants.mjs';

const CFG = { repo: 'owner/repo', projectId: 'PROJ' };

// A deps bundle whose every seam is a spy. The refusal path must trip BEFORE any
// of these are touched, so an untouched-spy assertion proves fail-fast ordering.
function makeDeps({ recorded = 'review', moveExit = 0 } = {}) {
  const calls = { fetchIssueBody: 0, getLiveState: 0, runMoveState: [], mutateIssueBody: 0 };
  return {
    calls,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => {
        calls.fetchIssueBody += 1;
        return {
          body: `<!-- aitm-last-known-state: ${recorded} --><!-- aitm-last-known-state-ts: 2026-07-22T00:00:00.000Z -->`,
        };
      },
      getLiveState: async () => {
        calls.getLiveState += 1;
        return recorded;
      },
      runMoveState: async (args) => {
        calls.runMoveState.push(args);
        return moveExit;
      },
      mutateIssueBody: async () => {
        calls.mutateIssueBody += 1;
      },
    },
  };
}

test('runDemote hard-refuses with no --rework (from review)', async () => {
  const { calls, deps } = makeDeps({ recorded: 'review' });
  const result = await runDemote({ issueNumber: 935, cfg: CFG, deps });
  assert.equal(result.status, 'rework-required');
  assert.match(result.message, /CODE-REWORK path/);
  assert.match(result.message, /re-invoke that stage's verb in place/);
  assert.equal(calls.fetchIssueBody, 0, 'refuses BEFORE any network fetch');
  assert.equal(calls.runMoveState.length, 0, 'never moves the board');
});

test('runDemote hard-refuses with no --rework (from test)', async () => {
  const { calls, deps } = makeDeps({ recorded: 'test' });
  const result = await runDemote({ issueNumber: 935, cfg: CFG, deps });
  assert.equal(result.status, 'rework-required');
  assert.equal(calls.runMoveState.length, 0, 'never moves the board');
});

test('runDemote treats a whitespace-only --rework as absent', async () => {
  const { calls, deps } = makeDeps({ recorded: 'review' });
  const result = await runDemote({ issueNumber: 935, cfg: CFG, rework: '   \t ', deps });
  assert.equal(result.status, 'rework-required');
  assert.equal(calls.runMoveState.length, 0);
});

test('runDemote with a real --rework from a legal source demotes and threads the reason', async () => {
  const { calls, deps } = makeDeps({ recorded: 'review', moveExit: 0 });
  const result = await runDemote({
    issueNumber: 935,
    cfg: CFG,
    rework: 'fix off-by-one in resolver',
    deps,
  });
  assert.equal(result.status, 'demoted');
  assert.equal(result.from, 'review');
  assert.equal(result.to, 'develop');
  assert.equal(calls.runMoveState.length, 1, 'move-state invoked exactly once');
  assert.equal(
    calls.runMoveState[0].rework,
    'fix off-by-one in resolver',
    'the declared reason is threaded into runMoveState'
  );
  assert.equal(calls.runMoveState[0].target, 'develop');
});

test('runDemote still refuses an illegal source even with --rework', async () => {
  const { calls, deps } = makeDeps({ recorded: 'plan' });
  const result = await runDemote({ issueNumber: 935, cfg: CFG, rework: 'code change', deps });
  assert.equal(result.status, 'invalid-source-refused');
  assert.equal(result.from, 'plan');
  assert.equal(calls.runMoveState.length, 0);
});

test('defaultRunMoveState appends --demote and --demote-reason when a reason is present', async () => {
  let seen = null;
  const exit = await defaultRunMoveState(
    { issueNumber: 935, target: 'develop', rework: 'my reason' },
    { host: async ({ argv }) => ((seen = argv), 0) }
  );
  assert.equal(exit, 0);
  assert.ok(seen.includes('--demote'), 'preserves the --demote flag');
  const i = seen.indexOf('--demote-reason');
  assert.notEqual(i, -1, '--demote-reason present');
  assert.equal(seen[i + 1], 'my reason', 'reason follows the flag');
  assert.ok(seen.includes('935') && seen.includes('develop'));
});

test('defaultRunMoveState omits --demote-reason when the reason is blank', async () => {
  let seen = null;
  await defaultRunMoveState(
    { issueNumber: 935, target: 'develop', rework: '   ' },
    { host: async ({ argv }) => ((seen = argv), 0) }
  );
  assert.ok(seen.includes('--demote'));
  assert.equal(seen.includes('--demote-reason'), false, 'no reason flag for a blank reason');
});

test('parseArgs extracts issue number and --rework in both forms', () => {
  assert.deepEqual(parseArgs(['#5', '--rework', 'x']), { issueNumber: 5, rework: 'x' });
  assert.deepEqual(parseArgs(['5', '--rework=y']), { issueNumber: 5, rework: 'y' });
  assert.deepEqual(parseArgs(['7']), { issueNumber: 7, rework: null });
  // A trailing bare `--rework` captures an empty string (treated as absent downstream).
  assert.deepEqual(parseArgs(['#9', '--rework']), { issueNumber: 9, rework: '' });
});

// ---------------------------------------------------------------------------
// #932 — demote invalidates stale AC/VC/Functional-DoD evidence.
// ---------------------------------------------------------------------------

// A realistic fixture mirroring #932's own body shape: a stamped vc-list AC,
// stamped Functional DoD tests/lint/commits items, un-stampable derived items
// (acs/checkboxes), unstamped Lifecycle checkboxes, an unchecked VC list entry,
// and the full protected-marker set that must never be touched.
function fixtureBody() {
  return [
    '<!-- aitm-last-known-state state="test" ts="2026-07-20T00:00:00.000Z" -->',
    '<!-- aitm-refine-complete ts="2026-07-18T00:00:00.000Z" -->',
    '',
    '## Acceptance Criteria',
    '',
    '- [x] Demote invalidates stale evidence <!-- aitm-verified vc-list="vc:1" cmd="`node --test x`" sha="abc1234" ts="2026-07-20T00:00:00.000Z" exit="0" key="abc12345" -->',
    '- [ ] A not-yet-verified AC <!-- aitm-verified cmd="`node --test y`" -->',
    '',
    '### Functional (verified at Test)',
    '',
    '- [x] All automated tests pass <!-- aitm-verified cmd="`npm run test:all`" sha="abc1234" ts="2026-07-20T00:00:00.000Z" exit="0" --> <!-- dod:functional:tests -->',
    '- [x] Lint and format checks pass <!-- aitm-verified cmd="`npm run lint`" sha="abc1234" ts="2026-07-20T00:00:00.000Z" exit="0" --> <!-- dod:functional:lint -->',
    '- [x] Acceptance criteria met (including additions from deep dive) <!-- dod:functional:acs -->',
    '- [x] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->',
    '',
    '### Lifecycle (auto-ticked at Review/Close)',
    '',
    '- [x] Agent Review Passed',
    '- [ ] Final Review Passed',
    '',
    '### Verification Commands',
    '',
    '- [ ] `node --test scripts/task-tracker/verbs/demote.test.mjs`',
    '',
    '<!-- aitm-deep-dive-posted ts="2026-07-18T00:00:00.000Z" -->',
    '<!-- aitm-entered-develop ts="2026-07-18T01:00:00.000Z" -->',
    '<!-- aitm-entered-test ts="2026-07-19T00:00:00.000Z" -->',
    '<!-- aitm-plan-approved ts="2026-07-18T00:30:00.000Z" -->',
    '<!-- aitm-stage-rollup: {"schema":2} -->',
    '<!-- aitm-body-version version="7" -->',
    '<!-- aitm-fields: {"schema":1,"values":{"priority":"P1"}} -->',
    '',
  ].join('\n');
}

test('#932 demote-strips-VC-evidence: uncheck + drop run-props, keep declaration', () => {
  const body = fixtureBody();
  const { body: next, invalidated } = invalidateEvidence(body);

  // The stamped AC and the two stamped Functional DoD items are un-ticked and
  // lose their run-props, but keep cmd/vc-list/key.
  assert.match(
    next,
    /- \[ \] Demote invalidates stale evidence <!-- aitm-verified cmd="`node --test x`" key="abc12345" vc-list="vc:1" -->/
  );
  assert.match(
    next,
    /- \[ \] All automated tests pass <!-- aitm-verified cmd="`npm run test:all`" --> <!-- dod:functional:tests -->/
  );
  assert.match(
    next,
    /- \[ \] Lint and format checks pass <!-- aitm-verified cmd="`npm run lint`" --> <!-- dod:functional:lint -->/
  );
  // The run-props are gone from the checkbox lines specifically (the
  // `aitm-last-known-state` marker legitimately keeps its own unrelated
  // `ts=`, so the assertion is scoped to `aitm-verified` markers only).
  assert.doesNotMatch(next, /aitm-verified[^>]*sha="abc1234"/);
  assert.doesNotMatch(next, /aitm-verified[^>]*ts="2026-07-20T00:00:00\.000Z"/);
  assert.doesNotMatch(next, /aitm-verified[^>]*exit="0"/);

  assert.equal(invalidated.length, 3);
  assert.ok(invalidated.some((l) => l.includes('Demote invalidates stale evidence')));
  assert.ok(invalidated.some((l) => l.includes('All automated tests pass')));
  assert.ok(invalidated.some((l) => l.includes('Lint and format checks pass')));

  // Items with no execution proof are left byte-identical: the declaration-only
  // AC, the derived acs/checkboxes lines (no aitm-verified marker of their
  // own), the unstamped Lifecycle box, and the unchecked VC list entry.
  assert.match(next, /- \[ \] A not-yet-verified AC <!-- aitm-verified cmd="`node --test y`" -->/);
  assert.match(next, /- \[x\] Acceptance criteria met/);
  assert.match(next, /- \[x\] Issue body checkboxes ticked/);
  assert.match(next, /- \[x\] Agent Review Passed/);
  assert.match(next, /- \[ \] `node --test scripts\/task-tracker\/verbs\/demote\.test\.mjs`/);
});

test('#932 demote-preserves-protected: no invariant marker is lost', () => {
  const body = fixtureBody();
  const { body: next } = invalidateEvidence(body);
  assert.deepEqual(findLostMarkers(body, next), []);
  // Spot-check the markers are byte-identical, not merely "matched by regex".
  for (const marker of [
    '<!-- aitm-last-known-state state="test" ts="2026-07-20T00:00:00.000Z" -->',
    '<!-- aitm-deep-dive-posted ts="2026-07-18T00:00:00.000Z" -->',
    '<!-- aitm-entered-develop ts="2026-07-18T01:00:00.000Z" -->',
    '<!-- aitm-entered-test ts="2026-07-19T00:00:00.000Z" -->',
    '<!-- aitm-plan-approved ts="2026-07-18T00:30:00.000Z" -->',
    '<!-- aitm-stage-rollup: {"schema":2} -->',
    '<!-- aitm-body-version version="7" -->',
    '<!-- aitm-fields: {"schema":1,"values":{"priority":"P1"}} -->',
  ]) {
    assert.ok(next.includes(marker), `expected to still find: ${marker}`);
  }
});

test('#932 re-promote-restamps-new-sha: stripped item re-stamps against the new HEAD, not the old', () => {
  const body = fixtureBody();
  const { body: afterDemote } = invalidateEvidence(body);

  // Simulate the forward re-drive's sandbox re-stamping the now-unverified AC
  // line against a NEW commit (this is what `ac-stamp`/`autoTickVerified`
  // does in the real pipeline via `upsertProofMarker`).
  const acLineRe =
    /^- \[ \] Demote invalidates stale evidence <!-- aitm-verified cmd="`node --test x`" key="abc12345" vc-list="vc:1" -->$/m;
  const acLine = afterDemote.match(acLineRe)[0];
  const restamped = upsertProofMarker(acLine, {
    exit: 0,
    sha: 'def5678',
    ts: '2026-07-26T12:00:00.000Z',
  });

  assert.match(restamped, /sha="def5678"/);
  assert.doesNotMatch(restamped, /sha="abc1234"/);
  // Declaration survives the round trip untouched.
  assert.match(restamped, /vc-list="vc:1"/);
  assert.match(restamped, /cmd="`node --test x`"/);
  assert.match(restamped, /key="abc12345"/);
});

test('#932 demote-with-nothing-to-strip: a body with only declarations is a safe no-op', () => {
  const body = [
    '## Acceptance Criteria',
    '',
    '- [ ] Not yet verified <!-- aitm-verified cmd="`node --test z`" -->',
    '',
    '### Functional (verified at Test)',
    '',
    '- [ ] All automated tests pass <!-- aitm-verified cmd="`npm run test:all`" --> <!-- dod:functional:tests -->',
    '',
    '<!-- aitm-fields: {"schema":1,"values":{}} -->',
    '',
  ].join('\n');
  const { body: next, invalidated } = invalidateEvidence(body);
  assert.equal(next, body);
  assert.deepEqual(invalidated, []);
  assert.deepEqual(findLostMarkers(body, next), []);
});

test('#932 runDemote wires invalidateEvidence into the state-recording mutate and reports it', async () => {
  let pushedBody = null;
  const deps = {
    assertBound: () => {},
    fetchIssueBody: async () => ({
      body:
        `<!-- aitm-last-known-state: test --><!-- aitm-last-known-state-ts: 2026-07-22T00:00:00.000Z -->\n` +
        fixtureBody(),
    }),
    getLiveState: async () => 'test',
    runMoveState: async () => 0,
    mutateIssueBody: async ({ mutate }) => {
      const fresh =
        `<!-- aitm-last-known-state: test --><!-- aitm-last-known-state-ts: 2026-07-22T00:00:00.000Z -->\n` +
        fixtureBody();
      pushedBody = await mutate(fresh);
    },
  };

  const result = await runDemote({
    issueNumber: 935,
    cfg: CFG,
    rework: 'fix stale evidence bug',
    deps,
  });

  assert.equal(result.status, 'demoted');
  assert.ok(Array.isArray(result.invalidated));
  assert.equal(result.invalidated.length, 3);
  assert.ok(pushedBody.includes('- [ ] Demote invalidates stale evidence'));
  assert.ok(!pushedBody.includes('sha="abc1234"'));
});
