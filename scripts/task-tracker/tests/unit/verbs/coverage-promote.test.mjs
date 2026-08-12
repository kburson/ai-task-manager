#!/usr/bin/env node
// @story #621
// Coverage for verbs/promote.mjs: drives core `runPromote` via its dep seam and
// the CLI `verbPromote` via a process.exit/stdout trap (one prod change:
// `verbPromote(rest, cfg, deps = {})` forwards `deps` so every arm runs offline).
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { runPromote, verbPromote } from '../../../verbs/promote.mjs';
// Isolate the verb's withIssueLock dir from the live project tree.
process.env.AI_TASK_MANAGER_PROJECT_DIR = mkdtempSync(join(projectScratchDir('test'), 'promote-'));
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
  const calls = { writes: [], spawns: [], moves: [], fetches: 0, liveCalls: 0 };
  return {
    calls,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => {
        calls.fetches++;
        if (secondFetch && fetchSecondBody !== undefined) return { body: fetchSecondBody };
        secondFetch = true;
        return { body };
      },
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
      spawnVerb: async ({ verb, issueNumber }) =>
        calls.spawns.push({ verb, issueNumber }) && spawnCode,
      runMoveState: async ({ issueNumber, target }) =>
        calls.moves.push({ issueNumber, target }) && moveCode,
      epicChildren: { fetchSiblings: async () => [] },
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
const dev = (over = {}) => makeDeps({ body: bodyWithState('develop'), live: 'develop', ...over });
// #998 — review→close only fires once Agent Review genuinely passed; the
// fixture must carry that evidence marker, same signal `approve.mjs` gates on.
const AGENT_REVIEW_PASSED_LINE =
  '- [x] Agent Review Passed <!-- aitm-verified ts="2026-05-10T00:00:00Z" gate="agent-review" result="pass" -->\n';
const rev = (over = {}) =>
  makeDeps({ body: bodyWithState('review') + AGENT_REVIEW_PASSED_LINE, live: 'review', ...over }); // #710
const DD_PROSE = Array.from(
  { length: 20 },
  (_, i) =>
    `line ${i + 1}: substantive analysis paragraph describing the change, subsystem, risk surface, and verification approach.`
).join('\n');
const DD_FIELDS = `<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: { size: 'XS' } })} -->`;
const DEEP_DIVE_SIGNALS = `\n## Plan Metadata\n\n- **size**: XS\n\n## Pickup Directive — MANDATORY, DO NOT SKIP\n\n- [x] Deep dive complete\n\n<!-- aitm-deep-dive-posted: 2026-06-04 -->\n## Deep-Dive Analysis (2026-06-04)\n${DD_PROSE}\n<!-- aitm-deep-dive-complete: 2026-06-04T23:00:00Z -->\n## Verification Commands\n\n- [ ] \`npm run test:all\`\n${DD_FIELDS}\n`;
const USER_STORY_SECTION =
  '## User Story\n\nAs a developer\nI want to test the promote verb\nSo that the gate suite stays green\n';
const REFINE_COMPLETE_MARKER = '<!-- aitm-refine-complete: 2026-06-03T00:00:00Z -->';
const DOD_MARKER = '\n<!-- aitm-dod-verified: abc1234:2026-05-18T00:00:00Z -->\n';
const BOGUS_BODY =
  '<!-- aitm-last-known-state: bogus -->\n<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->\n';

function bodyWithState(state) {
  const base = `<!-- aitm-last-known-state: ${state} -->\n<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->\n\n${USER_STORY_SECTION}\n## Issue\n\nbody.\n`;
  return state === 'plan' ? base + DEEP_DIVE_SIGNALS : base;
}
const STALE_AFTER = bodyWithState('develop') + DOD_MARKER;
function refineBody() {
  const rationale =
    '<!-- aitm-refinement-rationale: {"size":"a","estimate":"b","priority":"c"} -->';
  return `${bodyWithState('refine')}\n${REFINE_COMPLETE_MARKER}\n${rationale}\n\n## Acceptance Criteria\n- [ ] foo\n`;
}
function refineEstimateOk(deps) {
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ size: 'S', estimate: 4, priority: 'P2' }),
    listCommentBodies: async () => [],
    postComment: async () => {},
    writeIssueBody: async () => {},
  };
  deps.refineToPlanGate = async () => ({ ok: true, blockers: [] });
}
function plannedEstimateOk(deps, issueNumber) {
  deps.plannedEstimate = {
    listComments: async () => [
      {
        id: 'IC_1',
        body: `<!-- aitm-refined-estimate: ${issueNumber} -->\n### 🛠 Refine estimate\n\n### Planned Estimate\n\n| Field | Refine | Plan | Δ |\n`,
      },
    ],
  };
}
test('runPromote: throws without issueNumber or cfg', async () => {
  await assert.rejects(() => runPromote({ cfg }), /issueNumber is required/);
  await assert.rejects(() => runPromote({ issueNumber: 5 }), /cfg is required/);
});
test('runPromote: assertBound is invoked and may throw', async () => {
  const { deps } = makeDeps({ body: bodyWithState('test'), live: 'test' });
  deps.assertBound = () => {
    throw new Error('not bound to #9');
  };
  await assert.rejects(() => runPromote({ issueNumber: 9, cfg, deps }), /not bound/);
});
test('runPromote: refine→R4P promoted via direct move + refine-estimate hook', async () => {
  const { deps, calls } = makeDeps({ body: refineBody(), live: 'refine' });
  refineEstimateOk(deps);
  const r = await runPromote({ issueNumber: 100, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'ready-for-plan');
  assert.deepEqual(calls.moves, [{ issueNumber: 100, target: 'ready-for-plan' }]);
  assert.equal(r.refinementPost.status, 'posted');
});
test('runPromote: refine→R4P refused when refine-estimate signals missing', async () => {
  const { deps, calls } = makeDeps({
    body: `${bodyWithState('refine')}\n${REFINE_COMPLETE_MARKER}\n`,
    live: 'refine',
  });
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({}),
  };
  const r = await runPromote({ issueNumber: 1005, cfg, deps });
  assert.equal(r.status, 'refine-gate-refused');
  assert.equal(calls.moves.length, 0);
});
test('runPromote: refine→R4P refused when refine-exit gate returns blockers', async () => {
  const { deps, calls } = makeDeps({ body: refineBody(), live: 'refine' });
  refineEstimateOk(deps);
  deps.refineToPlanGate = async () => ({ ok: false, blockers: ['refine-exit-missing: Rank'] });
  const r = await runPromote({ issueNumber: 1471, cfg, deps });
  assert.equal(r.status, 'refine-exit-refused');
  assert.equal(calls.moves.length, 0);
});
test('runPromote: backlog→refine direct move', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('backlog'), live: 'backlog' });
  const r = await runPromote({ issueNumber: 1473, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'refine');
  assert.equal(r.refinementPost, null);
});
test('runPromote: backlog→refine stamps Start time on success', async () => {
  const { deps } = makeDeps({ body: bodyWithState('backlog'), live: 'backlog' });
  let stampArgs = null;
  deps.stampStartTime = async (opts) => ((stampArgs = opts), { status: 'stamped' });
  const r = await runPromote({ issueNumber: 1472, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'refine');
  assert.equal(stampArgs.issueNumber, 1472);
});
test('runPromote: plan→develop promoted when planned-estimate appendix present', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'plan' });
  plannedEstimateOk(deps, 101);
  const r = await runPromote({ issueNumber: 101, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'develop');
  assert.deepEqual(calls.moves, [{ issueNumber: 101, target: 'develop' }]);
});
test('runPromote: plan→develop refused when refine-estimate comment missing', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'plan' });
  deps.plannedEstimate = { listComments: async () => [] };
  const r = await runPromote({ issueNumber: 1011, cfg, deps });
  assert.equal(r.status, 'planned-estimate-refused');
  assert.equal(calls.moves.length, 0);
});
test('runPromote: develop→test delegates to /task test', async () => {
  const { deps, calls } = dev({ liveAfter: 'test' });
  const r = await runPromote({ issueNumber: 102, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.via, 'alias:test');
  assert.deepEqual(calls.spawns, [{ verb: 'test', issueNumber: 102 }]);
});
test('runPromote: develop→test refused when CODE_COMPLETE gate blocks', async () => {
  const { deps, calls } = dev();
  deps.codeCompleteGate = async () => ({
    ok: false,
    blockers: ['code-complete: First AC'],
    shas: [],
  });
  const r = await runPromote({ issueNumber: 1361, cfg, deps });
  assert.equal(r.status, 'code-complete-refused');
  assert.equal(calls.spawns.length, 0);
});
// #881 — `test` gained an alias. It used to take the bare direct-move branch, so
// the issue landed in Review having never run the Agent Review Gate (the Review
// state's action) and the human was then asked to approve an agent-unreviewed
// story. Delegating to `review` runs the action on arrival.
test('runPromote: test→review delegates to /task review', async () => {
  const body = bodyWithState('test') + DOD_MARKER + '\n## Acceptance Criteria\n- [x] First AC\n';
  const { deps, calls } = makeDeps({ body, live: 'test', liveAfter: 'review' });
  const r = await runPromote({ issueNumber: 2572, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'review');
  assert.equal(r.via, 'alias:review');
  assert.deepEqual(calls.spawns, [{ verb: 'review', issueNumber: 2572 }]);
  assert.deepEqual(calls.moves, [], 'the alias verb owns the move, not promote');
});
test('runPromote: test→review refused when dod-verified marker missing', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('test'), live: 'test' });
  const r = await runPromote({ issueNumber: 1031, cfg, deps });
  assert.equal(r.status, 'dod-verified-missing');
  assert.equal(calls.moves.length, 0);
});
test('runPromote: review→done delegates to /task close', async () => {
  const { deps, calls } = rev({ liveAfter: 'done' });
  const r = await runPromote({ issueNumber: 104, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.via, 'alias:close');
  assert.deepEqual(calls.spawns, [{ verb: 'close', issueNumber: 104 }]);
});
test('runPromote: terminal refusal on done', async () => {
  const { deps } = makeDeps({ body: bodyWithState('done'), live: 'done' });
  const r = await runPromote({ issueNumber: 106, cfg, deps });
  assert.equal(r.status, 'terminal-refused');
  assert.match(r.message, /already in done/);
});
test('runPromote: drift refused when live ≠ recorded', async () => {
  const { deps } = makeDeps({ body: bodyWithState('plan'), live: 'develop' });
  const r = await runPromote({ issueNumber: 107, cfg, deps });
  assert.equal(r.status, 'drift-refused');
  assert.equal(r.live, 'develop');
  assert.equal(r.recorded, 'plan');
});
test('runPromote: bootstrap when lastKnownState absent', async () => {
  const { deps, calls } = makeDeps({ body: '## just a body\n' + DEEP_DIVE_SIGNALS, live: 'plan' });
  plannedEstimateOk(deps, 108);
  const r = await runPromote({ issueNumber: 108, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.bootstrapped, true);
  assert.match(calls.writes[0], /aitm-last-known-state state="plan"/);
});
test('runPromote: error when no recorded and no live state', async () => {
  const { deps } = makeDeps({ body: '## body only\n', live: null });
  const r = await runPromote({ issueNumber: 1090, cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /board item missing/);
});
test('runPromote: transition-failed when alias verb exits non-zero', async () => {
  const { deps } = dev({ liveAfter: 'develop', spawnCode: 4 });
  const r = await runPromote({ issueNumber: 109, cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.transitionResult.exitCode, 4);
  assert.equal(r.reconciledTo, null);
});
test('runPromote: promoted-with-warning, markers already synced (noop repair)', async () => {
  const after =
    bodyWithState('test') + '\n<!-- aitm-entered-test: 2026-05-18T00:00:00Z -->\n' + DOD_MARKER;
  const { deps, calls } = dev({ liveAfter: 'test', spawnCode: 3, fetchSecondBody: after });
  const r = await runPromote({ issueNumber: 132, cfg, deps });
  assert.equal(r.status, 'promoted-with-warning');
  assert.equal(r.markerRepair.status, 'noop');
  assert.equal(calls.writes.length, 0);
});
test('runPromote: promoted-with-warning, stale marker → repair write fires', async () => {
  const { deps, calls } = dev({ liveAfter: 'test', spawnCode: 1, fetchSecondBody: STALE_AFTER });
  const r = await runPromote({ issueNumber: 1751, cfg, deps });
  assert.equal(r.status, 'promoted-with-warning');
  assert.equal(r.markerRepair.status, 'ok');
  assert.match(calls.writes[0], /aitm-last-known-state state="test"/);
});
test('runPromote: delegate non-zero AND board drifted to non-target → transition-failed', async () => {
  const { deps, calls } = dev({ liveAfter: 'review', spawnCode: 3 });
  const r = await runPromote({ issueNumber: 1753, cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.reconciledTo, 'review');
  assert.match(calls.writes[0], /aitm-reconciled/);
});
test('runPromote: post-failure getLiveState throw is swallowed', async () => {
  const { deps, calls } = dev({ liveThrowsAfter: true, spawnCode: 3 });
  const r = await runPromote({ issueNumber: 134, cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.reconciledTo, null);
  assert.equal(calls.writes.length, 0);
});
test('runPromote: error when recorded state is unknown', async () => {
  const { deps } = makeDeps({ body: BOGUS_BODY, live: 'bogus' });
  const r = await runPromote({ issueNumber: 110, cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /unknown recorded state/);
});
test('spawnVerbTimeout: test → undefined, others → finite budget', async () => {
  const { spawnVerbTimeout } = await import('../../../verbs/promote.mjs');
  assert.equal(spawnVerbTimeout('test'), undefined);
  assert.equal(typeof spawnVerbTimeout('close'), 'number');
});
// --- verbPromote: process.exit + stdout/stderr trapped, deps injected ---
function runVerb(rest, deps) {
  const realExit = process.exit;
  const realErr = process.stderr.write.bind(process.stderr);
  const realOut = process.stdout.write.bind(process.stdout);
  let exitCode = null;
  const errOut = [];
  const outOut = [];
  process.exit = (code) => {
    exitCode = code ?? 0;
    throw new Error(`__exit_${exitCode}__`);
  };
  // Write-THROUGH: withIssueLock yields inside this trap; buffering alone would
  // swallow a neighboring test's TAP line, so forward every chunk live.
  process.stderr.write = (s) => (errOut.push(String(s)), realErr(s), true);
  process.stdout.write = (s) => (outOut.push(String(s)), realOut(s), true);
  const restore = () => {
    process.exit = realExit;
    process.stderr.write = realErr;
    process.stdout.write = realOut;
  };
  const result = () => ({ exitCode, stderr: errOut.join(''), stdout: outOut.join('') });
  return verbPromote(rest, cfg, deps)
    .then(result)
    .catch((err) => {
      if (!/__exit_\d+__/.test(err.message)) throw err;
      return result();
    })
    .finally(restore);
}
test('verbPromote: no issue number → usage, exit 1', async () => {
  const r = await runVerb([]);
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /Usage: promote/);
});
test('verbPromote: promoted → stdout, no exit', async () => {
  const { deps } = makeDeps({ body: bodyWithState('backlog'), live: 'backlog' });
  const r = await runVerb(['1473'], deps);
  assert.equal(r.exitCode, null);
  assert.match(r.stdout, /promoted: backlog → refine/);
});
test('verbPromote: refine→R4P promoted prints refine-estimate comment line', async () => {
  const { deps } = makeDeps({ body: refineBody(), live: 'refine' });
  refineEstimateOk(deps);
  const r = await runVerb(['100'], deps);
  assert.equal(r.exitCode, null);
  assert.match(r.stdout, /Refine estimate/);
});
test('verbPromote: refused gate → exit 4 with BLOCKED lines', async () => {
  const { deps } = makeDeps({ body: bodyWithState('test'), live: 'test' });
  const r = await runVerb(['1031'], deps);
  assert.equal(r.exitCode, 4);
  assert.match(r.stderr, /BLOCKED/);
});
test('verbPromote: decomposition refusal renders blockers and exits 4', async () => {
  const { deps } = makeDeps({ body: bodyWithState('plan'), live: 'plan' });
  plannedEstimateOk(deps, 1134);
  deps.decomposition.projectValuesForIssue = async () => ({ size: 'XL', estimate: 24 });

  const r = await runVerb(['1134'], deps);

  assert.equal(r.exitCode, 4);
  assert.match(r.stderr, /Refusing to promote #1134 to develop/);
  assert.match(r.stderr, /BLOCKED:.*Decomposition Waiver/s);
  assert.doesNotMatch(r.stderr, /unknown result status/);
  assert.doesNotMatch(r.stdout, /promoted:/);
});
test('verbPromote: drift-refused → exit 4', async () => {
  const { deps } = makeDeps({ body: bodyWithState('plan'), live: 'develop' });
  const r = await runVerb(['107'], deps);
  assert.equal(r.exitCode, 4);
  assert.match(r.stderr, /drift detected/);
});
test('verbPromote: terminal-refused → exit 4', async () => {
  const { deps } = makeDeps({ body: bodyWithState('done'), live: 'done' });
  const r = await runVerb(['106'], deps);
  assert.equal(r.exitCode, 4);
  assert.match(r.stderr, /already in done/);
});
test('verbPromote: promoted-with-warning prints soft-warning', async () => {
  const { deps } = dev({ liveAfter: 'test', spawnCode: 1, fetchSecondBody: STALE_AFTER });
  const r = await runVerb(['1751'], deps);
  assert.equal(r.exitCode, null);
  assert.match(r.stderr, /soft warning/);
});
test('verbPromote: transition-failed → exits with delegate code', async () => {
  const { deps } = dev({ liveAfter: 'develop', spawnCode: 4 });
  const r = await runVerb(['109'], deps);
  assert.equal(r.exitCode, 4);
  assert.match(r.stderr, /exited 4/);
});
test('verbPromote: error status → exit 1', async () => {
  const { deps } = makeDeps({ body: BOGUS_BODY, live: 'bogus' });
  const r = await runVerb(['110'], deps);
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /unknown recorded state/);
});
test('verbPromote: runPromote throw → catch → exit 1', async () => {
  const { deps } = makeDeps({ body: bodyWithState('test'), live: 'test' });
  deps.assertBound = () => {
    throw new Error('not bound to #9');
  };
  const r = await runVerb(['9'], deps);
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /promote: not bound/);
});
