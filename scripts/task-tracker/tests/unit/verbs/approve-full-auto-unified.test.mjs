// @story #310
// Unit tests for scripts/task-tracker/verbs/approve.mjs.
//
// Covers:
//   1. Refuses when issue is not in `review` (wrong-state).
//   2. First call inserts the marker and returns 'approved' with ts.
//   3. Second call is a no-op ('already-approved'); body is not rewritten.
//   4. Marker is inserted before the fields-block when present; legacy
//      encoding in fixture is normalized to canonical HTML-comment encoding.
//   5. Marker is appended at body end when no fields-block.
//   6. hasApprovalMarker / buildMarker pure helpers.
//   7. New-encoded body stays new-encoded after insertApprovalMarker.
//   8. Legacy-encoded body is normalized to new encoding.

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  runApprove,
  buildMarker,
  hasApprovalMarker,
  insertApprovalMarker,
  detectFullAuto,
} from '../../../verbs/approve.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const isolatedProjectDir = mkdtempSync(
  path.join(projectScratchDir('test'), 'approve-full-auto-unified-')
);
process.env.AI_TASK_MANAGER_PROJECT_DIR = isolatedProjectDir;
process.once('exit', () => rmSync(isolatedProjectDir, { recursive: true, force: true }));

// #881 — approve requires evidence that the Agent Review Gate (the Review state's
// action) passed. Every fixture body below is suffixed with it; tests that care
// about the refusal path live in approve-agent-review-complete.test.mjs.
const AGENT_REVIEW_PASSED =
  '\n<!-- aitm-entered-review ts="2026-07-29T10:00:00Z" -->\n<!-- aitm-dod-verified sha="abc1234" ts="2026-07-29T10:00:00Z" -->\n<!-- aitm-agent-review-proof schema="1" epoch="review:1:2026-07-29T10:00:00Z" sha="abc1234" ts="2026-07-29T10:01:00Z" validators="unit" result="pass" -->\n- [ ] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-05-10T00:00:00Z" sha="sandbox" validators="body-sections" result="pass" -->\n';

const cfg = { repo: 'o/r' };
const FIXED_TS = '2026-05-10T00:00:00Z';

function makeDeps(overrides = {}) {
  const calls = { writes: [], bodies: [], stateLookups: 0, comments: [] };
  const initialBody =
    overrides.initialBody ??
    '## Acceptance Criteria\n\n- [x] all\n\n<!-- ai-task-manager:fields:start -->\n```json\n{"schema":1,"values":{"size":"S"}}\n```\n<!-- ai-task-manager:fields:end -->\n';
  let body =
    initialBody +
    (initialBody.includes('aitm-entered-review')
      ? '\n- [ ] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-05-10T00:00:00Z" sha="sandbox" validators="body-sections" result="pass" -->\n'
      : AGENT_REVIEW_PASSED);
  return {
    calls,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => {
        calls.bodies.push(body);
        return body;
      },
      // #295 — closure-form body write. Track both base-in and result-out so
      // tests can assert "mutate produced body X from base Y" rather than just
      // observing the final body.
      mutateIssueBody: async ({ mutate }) => {
        const before = body;
        const next = mutate(before);
        if (next !== before) {
          body = next;
          calls.writes.push(next);
        }
        // #655 — the real mutateIssueBody returns the verified live `body`; the
        // fake must too so approve's read-back assertion sees the stamped marker.
        return { status: next !== before ? 'ok' : 'no-op', body };
      },
      getBoardState: async () => {
        calls.stateLookups++;
        return overrides.state ?? 'review';
      },
      nowIso: () => FIXED_TS,
      // Isolate baseline tests from ambient env (e.g. TT_FULL_AUTO=1 in
      // sandbox). Tests that exercise the full-auto path inject their own
      // detectFullAuto via overrides.deps.
      detectFullAuto: () => ({ fired: false, signals: '' }),
      postComment: async ({ body }) => {
        calls.comments.push(body);
      },
      fetchComments: async () => [],
      fetchProjectValues: async () => ({}),
      ...overrides.deps,
    },
    getBody: () => body,
  };
}

// --- #177 — unified Full-Auto trigger (footnote ↔ audit-comment parity) ---

// 17. Claude Code shape: TASK_TRACKER_HUMAN_REVIEWER unset, stdin is a TTY
// (legacy signals all inert). The footnote MUST be inserted and the
// consolidated aitm-review-approved marker carries full-auto="yes" (#480 AC6).
{
  const prevReviewer = process.env.TASK_TRACKER_HUMAN_REVIEWER;
  const prevAuto = process.env.TT_FULL_AUTO;
  const prevCi = process.env.CI;
  delete process.env.TASK_TRACKER_HUMAN_REVIEWER;
  delete process.env.TT_FULL_AUTO;
  delete process.env.CI;
  try {
    const { deps, getBody } = makeDeps({
      // do NOT override detectFullAuto — exercise the real predicate against
      // a stubbed TTY=true and the cleared env.
      deps: { detectFullAuto: () => detectFullAuto({ env: process.env, tty: true }) },
    });
    const r = await runApprove({ issueNumber: 58, cfg, deps });
    assert.equal(r.status, 'approved');
    assert.equal(r.fullAuto, true);
    // #480 AC6 — full-auto folded into the single aitm-review-approved marker.
    assert.match(
      getBody(),
      /<!-- aitm-review-approved schema="1" epoch="review:1:2026-07-29T10:00:00Z"[^>]*provenance="full-auto"/
    );
    assert.doesNotMatch(getBody(), /aitm-full-auto-approved/);
    assert.match(getBody(), /<!-- aitm-full-auto-footnote:start -->/);
    assert.match(getBody(), /reviewer-unset=1/);
  } finally {
    if (prevReviewer !== undefined) process.env.TASK_TRACKER_HUMAN_REVIEWER = prevReviewer;
    if (prevAuto !== undefined) process.env.TT_FULL_AUTO = prevAuto;
    if (prevCi !== undefined) process.env.CI = prevCi;
  }
}

// 18. Human path: TASK_TRACKER_HUMAN_REVIEWER=alice → footnote NOT inserted,
// body marker NOT stamped, despite TTY signal being absent (legacy override
// would have fired before #177).
{
  const prevReviewer = process.env.TASK_TRACKER_HUMAN_REVIEWER;
  const prevAuto = process.env.TT_FULL_AUTO;
  const prevCi = process.env.CI;
  process.env.TASK_TRACKER_HUMAN_REVIEWER = 'alice';
  delete process.env.TT_FULL_AUTO;
  delete process.env.CI;
  try {
    const { deps, getBody } = makeDeps({
      deps: { detectFullAuto: () => detectFullAuto({ env: process.env, tty: true }) },
    });
    const r = await runApprove({ issueNumber: 58, cfg, deps });
    assert.equal(r.status, 'approved');
    assert.notEqual(r.fullAuto, true);
    assert.doesNotMatch(getBody(), /aitm-full-auto-approved/);
    assert.doesNotMatch(getBody(), /<!-- aitm-full-auto-footnote:start -->/);
  } finally {
    if (prevReviewer !== undefined) process.env.TASK_TRACKER_HUMAN_REVIEWER = prevReviewer;
    else delete process.env.TASK_TRACKER_HUMAN_REVIEWER;
    if (prevAuto !== undefined) process.env.TT_FULL_AUTO = prevAuto;
    if (prevCi !== undefined) process.env.CI = prevCi;
  }
}

// 19. Footnote anchor survives current preflight DoD template — invoke
// preflight-issue.mjs --shape solo, then runApprove, assert footnote lands
// after Lifecycle subsection.
{
  const { execFileSync } = await import('node:child_process');
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { projectScratchDir } = await import('../../../lib/scratch-dir.mjs');
  const path = await import('node:path');
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'preflight-test-'));
  const scopeFile = path.join(dir, 'scope.md');
  const acFile = path.join(dir, 'ac.md');
  const planFile = path.join(dir, 'plan.md');
  writeFileSync(scopeFile, 'Scope text.\n');
  writeFileSync(acFile, '- [ ] one\n');
  writeFileSync(planFile, '- **Size:** S\n- **Estimate:** 1h\n- **Priority:** P2\n- **Rank:** —\n');
  const rendered = execFileSync(
    'node',
    [
      'scripts/task-tracker/preflight-issue.mjs',
      '--shape',
      'solo',
      '--scope-file',
      scopeFile,
      '--ac-file',
      acFile,
      '--plan-metadata-file',
      planFile,
    ],
    { encoding: 'utf8' }
  );
  const { deps, getBody } = makeDeps({ initialBody: rendered });
  const r = await runApprove({
    issueNumber: 58,
    cfg,
    deps: {
      ...deps,
      detectFullAuto: () => ({ fired: true, signals: 'reviewer-unset=1,env=0,tty=1,ci=0' }),
    },
  });
  assert.equal(r.status, 'approved');
  const body = getBody();
  // #480 — preflight now emits a 3-hash `### Lifecycle` subheader.
  const lifecycleIdx = body.indexOf('### Lifecycle');
  const footnoteIdx = body.indexOf('<!-- aitm-full-auto-footnote:start -->');
  assert.ok(lifecycleIdx > -1, 'preflight body contains Lifecycle subsection');
  assert.ok(footnoteIdx > lifecycleIdx, 'footnote anchors after Lifecycle subsection');
}

// 20. (#178) Body whose prose mentions the start delimiter (e.g., a deep-dive
// describing the marker format in a code span) must still get the real footnote
// inserted. Pre-fix bug: `hasFullAutoFootnote` used `String.includes` on the
// start delimiter alone, so the prose mention tripped the presence check,
// pushing `insertFullAutoFootnote` down the "replace existing block" branch,
// which then no-op'd because the block regex requires both delimiters in order.
{
  const body = [
    '## Scope',
    'The bug is that `<!-- aitm-full-auto-footnote:start -->` is mentioned',
    'in this prose (code span), which used to fool the presence check.',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [ ] Passed final human review',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
    '',
    '<!-- aitm-fields: {"schema":1,"values":{"size":"S"}} -->',
    '',
  ].join('\n');
  const { deps, getBody } = makeDeps({
    initialBody: body,
    deps: { detectFullAuto: () => ({ fired: true, signals: 'reviewer-unset=1,env=0,tty=1,ci=0' }) },
  });
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'approved');
  assert.equal(r.fullAuto, true);
  const out = getBody();
  // The real block must be inserted in addition to the prose mention — so the
  // start delimiter appears exactly twice (prose + real block).
  const startMatches = out.match(/<!-- aitm-full-auto-footnote:start -->/g);
  assert.equal(startMatches.length, 2, 'prose mention + real block');
  assert.match(out, /<!-- aitm-full-auto-footnote:end -->/);
  assert.match(out, /Full-Auto mode enabled: human review skipped/);
  // Lifecycle item ticked.
  assert.match(out, /- \[x\] Passed final human review/);
  // Footnote anchored after Lifecycle subsection.
  const lifeIdx = out.indexOf('#### Lifecycle');
  const endIdx = out.indexOf('<!-- aitm-full-auto-footnote:end -->');
  assert.ok(endIdx > lifeIdx, 'footnote block anchors after Lifecycle subsection');
}

// #363 — Full-Auto approve must pass `allowUnverifiedTicks: true` to
// mutateIssueBody so the #362 checkbox-proof gate doesn't refuse the
// lifecycle-line tick of "Passed final human review". The truth-bearing
// proof for that tick is the audit comment + the consolidated
// `aitm-review-approved full-auto="yes"` body marker (#480 AC6), not an
// inline `aitm-verified-at` HTML comment (which would also
// break lifecycle-dod.mjs's exact-label match).
{
  const body =
    [
      '## Acceptance Criteria',
      '- [x] x',
      '',
      '#### Lifecycle (auto-ticked at Review/Close)',
      '- [ ] Passed final human review',
      '- [ ] Story closed and moved to Done',
      '- [ ] Timing data flushed to issue',
      '',
    ].join('\n') + AGENT_REVIEW_PASSED;
  let capturedOpts = null;
  let liveBody = body;
  const r = await runApprove({
    issueNumber: 58,
    cfg,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => liveBody,
      mutateIssueBody: async (opts) => {
        capturedOpts = opts;
        const next = opts.mutate(liveBody);
        liveBody = next;
        // #655 — return the verified live body so approve's read-back assertion
        // sees the stamped aitm-review-approved marker.
        return { status: 'ok', body: next };
      },
      getBoardState: async () => 'review',
      nowIso: () => FIXED_TS,
      detectFullAuto: () => ({ fired: true, signals: 'reviewer-unset=1' }),
      postComment: async () => {},
      fetchComments: async () => [],
      fetchProjectValues: async () => ({}),
    },
  });
  assert.equal(r.status, 'approved');
  assert.ok(capturedOpts, 'mutateIssueBody must be called');
  assert.equal(
    capturedOpts.allowUnverifiedTicks,
    true,
    'approve must pass allowUnverifiedTicks:true so the #362 checkbox-proof gate does not refuse the lifecycle tick'
  );
  assert.match(liveBody, /- \[x\] Passed final human review/);
  // Asserting the gate stays clean for non-lifecycle ticks is out of scope
  // for this regression — covered by mutateIssueBody's own tests.
}

// #363 — also covers the non-Full-Auto (human-reviewer) path: same bypass is
// required because the lifecycle line is still ticked by the verb itself,
// not by an agent attestation.
{
  const body =
    [
      '## Acceptance Criteria',
      '- [x] x',
      '',
      '#### Lifecycle (auto-ticked at Review/Close)',
      '- [ ] Passed final human review',
      '',
    ].join('\n') + AGENT_REVIEW_PASSED;
  let capturedOpts = null;
  let liveBody = body;
  const r = await runApprove({
    issueNumber: 58,
    cfg,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => liveBody,
      mutateIssueBody: async (opts) => {
        capturedOpts = opts;
        const next = opts.mutate(liveBody);
        liveBody = next;
        // #655 — return the verified live body (carries aitm-review-approved).
        return { status: 'ok', body: next };
      },
      getBoardState: async () => 'review',
      nowIso: () => FIXED_TS,
      detectFullAuto: () => ({ fired: false, signals: '' }),
      postComment: async () => {},
      fetchComments: async () => [],
      fetchProjectValues: async () => ({}),
    },
  });
  assert.equal(r.status, 'approved');
  assert.equal(
    capturedOpts.allowUnverifiedTicks,
    true,
    'human-reviewer approve must also pass allowUnverifiedTicks:true — verb-driven tick, not agent attestation'
  );
}

console.log('approve.test.mjs: all passed');

// #1050 / #979 — a fresh `--human` approval supersedes stale Full-Auto
// authority, removes its footnote, and records human provenance regardless of
// the stale lifecycle check mark.
{
  const epochOne = 'review:1:2026-07-29T10:00:00Z';
  const epochTwo = 'review:2:2026-07-29T11:00:00Z';
  const staleFullAuto = [
    '<!-- aitm-entered-review ts="2026-07-29T10:00:00Z" -->',
    `<!-- aitm-agent-review-proof schema="1" epoch="${epochOne}" sha="abc1234" ts="2026-07-29T10:01:00Z" validators="unit" result="pass" -->`,
    `<!-- aitm-review-approved schema="1" epoch="${epochOne}" proof-sha="abc1234" ts="2026-07-29T10:02:00Z" provenance="full-auto" signals="old-signal" -->`,
    '<!-- aitm-full-auto-footnote:start -->',
    '> ⚙️ **Full-Auto mode enabled: human review skipped.**',
    '<!-- aitm-full-auto-footnote:end -->',
    '<!-- aitm-entered-review-2 ts="2026-07-29T11:00:00Z" -->',
    '<!-- aitm-dod-verified sha="def5678" ts="2026-07-29T11:00:00Z" -->',
    `<!-- aitm-agent-review-proof schema="1" epoch="${epochTwo}" sha="def5678" ts="2026-07-29T11:01:00Z" validators="unit" result="pass" -->`,
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Passed final human review',
  ].join('\n');
  const { deps, getBody } = makeDeps({
    initialBody: staleFullAuto,
    deps: { detectFullAuto: () => ({ fired: true, signals: 'must-not-survive' }) },
  });
  const r = await runApprove({ issueNumber: 58, cfg, deps, human: true });

  assert.equal(r.status, 'approved');
  assert.equal(r.fullAuto, false);
  assert.match(getBody(), /aitm-review-approval-history[^>]*provenance="full-auto"/);
  assert.match(
    getBody(),
    /aitm-review-approved[^>]*epoch="review:2:2026-07-29T11:00:00Z"[^>]*provenance="human"/
  );
  assert.doesNotMatch(getBody(), /aitm-full-auto-footnote:start/);
}

// #1050 — an explicit human approval is higher-fidelity provenance even when
// the existing Full-Auto approval is otherwise current for the same epoch and
// proof. Preserve the machine approval as history and replace its authority;
// do not let the idempotent fast path discard the human signal.
{
  const epoch = 'review:1:2026-07-29T10:00:00Z';
  const currentFullAuto = [
    '<!-- aitm-entered-review ts="2026-07-29T10:00:00Z" -->',
    '<!-- aitm-dod-verified sha="abc1234" ts="2026-07-29T10:00:00Z" -->',
    `<!-- aitm-agent-review-proof schema="1" epoch="${epoch}" sha="abc1234" ts="2026-07-29T10:01:00Z" validators="unit" result="pass" -->`,
    `<!-- aitm-review-approved schema="1" epoch="${epoch}" proof-sha="abc1234" ts="2026-07-29T10:02:00Z" provenance="full-auto" signals="old-signal" -->`,
    '<!-- aitm-full-auto-footnote:start -->',
    '> ⚙️ **Full-Auto mode enabled: human review skipped.**',
    '<!-- aitm-full-auto-footnote:end -->',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Passed final human review',
  ].join('\n');
  const { deps, getBody } = makeDeps({
    initialBody: currentFullAuto,
    deps: { detectFullAuto: () => ({ fired: true, signals: 'must-not-survive' }) },
  });

  const r = await runApprove({ issueNumber: 58, cfg, deps, human: true });

  assert.equal(r.status, 'approved');
  assert.equal(r.fullAuto, false);
  assert.match(getBody(), /aitm-review-approval-history[^>]*provenance="full-auto"/);
  assert.match(
    getBody(),
    /aitm-review-approved[^>]*epoch="review:1:2026-07-29T10:00:00Z"[^>]*provenance="human"/
  );
  assert.doesNotMatch(getBody(), /aitm-full-auto-footnote:start/);
}

// #1050 — the pre-consolidation marker pair is one Full-Auto approval. When it
// becomes stale, archive the truthful provenance/signals together and retire
// the standalone companion instead of rewriting history as human.
{
  const epochTwo = 'review:2:2026-07-29T11:00:00Z';
  const staleLegacyFullAuto = [
    '<!-- aitm-entered-review ts="2026-07-29T10:00:00Z" -->',
    '<!-- aitm-review-approved ts="2026-07-29T10:02:00Z" -->',
    '<!-- aitm-full-auto-approved: 2026-07-29T10:02:00Z:old-signal -->',
    '<!-- aitm-full-auto-footnote:start -->',
    '> ⚙️ **Full-Auto mode enabled: human review skipped.**',
    '<!-- aitm-full-auto-footnote:end -->',
    '<!-- aitm-entered-review-2 ts="2026-07-29T11:00:00Z" -->',
    '<!-- aitm-dod-verified sha="def5678" ts="2026-07-29T11:00:00Z" -->',
    `<!-- aitm-agent-review-proof schema="1" epoch="${epochTwo}" sha="def5678" ts="2026-07-29T11:01:00Z" validators="unit" result="pass" -->`,
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Passed final human review',
  ].join('\n');
  const { deps, getBody } = makeDeps({
    initialBody: staleLegacyFullAuto,
    deps: { detectFullAuto: () => ({ fired: true, signals: 'must-not-survive' }) },
  });

  const r = await runApprove({ issueNumber: 58, cfg, deps, human: true });

  assert.equal(r.status, 'approved');
  assert.match(
    getBody(),
    /aitm-review-approval-history[^>]*provenance="full-auto"[^>]*signals="old-signal"/
  );
  assert.doesNotMatch(getBody(), /<!-- aitm-full-auto-approved/);
  assert.match(
    getBody(),
    /aitm-review-approved[^>]*epoch="review:2:2026-07-29T11:00:00Z"[^>]*provenance="human"/
  );
}

// #1050 — do not erase or misattribute an unpaired legacy Full-Auto marker.
// It remains historical evidence while the independently human legacy approval
// is archived and the current epoch receives explicit human authority.
{
  const epochTwo = 'review:2:2026-07-29T11:00:00Z';
  const unmatched = [
    '<!-- aitm-entered-review ts="2026-07-29T10:00:00Z" -->',
    '<!-- aitm-review-approved ts="2026-07-29T10:02:00Z" -->',
    '<!-- aitm-full-auto-approved: 2026-07-29T10:03:00Z:orphan-signal -->',
    '<!-- aitm-entered-review-2 ts="2026-07-29T11:00:00Z" -->',
    '<!-- aitm-dod-verified sha="def5678" ts="2026-07-29T11:00:00Z" -->',
    `<!-- aitm-agent-review-proof schema="1" epoch="${epochTwo}" sha="def5678" ts="2026-07-29T11:01:00Z" validators="unit" result="pass" -->`,
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Passed final human review',
  ].join('\n');
  const { deps, getBody } = makeDeps({ initialBody: unmatched });

  const r = await runApprove({ issueNumber: 58, cfg, deps, human: true });

  assert.equal(r.status, 'approved');
  assert.match(getBody(), /aitm-review-approval-history[^>]*provenance="human"/);
  assert.match(getBody(), /<!-- aitm-full-auto-approved: 2026-07-29T10:03:00Z:orphan-signal -->/);
}

// #1050 — duplicate same-timestamp companions are ambiguous, not two reasons
// to rewrite the legacy approval as human. Preserve the evidence and refuse
// the replacement until an operator repairs the historical ambiguity.
{
  const epochTwo = 'review:2:2026-07-29T11:00:00Z';
  const ambiguous = [
    '<!-- aitm-entered-review ts="2026-07-29T10:00:00Z" -->',
    '<!-- aitm-review-approved ts="2026-07-29T10:02:00Z" -->',
    '<!-- aitm-full-auto-approved: 2026-07-29T10:02:00Z:first-signal -->',
    '<!-- aitm-full-auto-approved: 2026-07-29T10:02:00Z:second-signal -->',
    '<!-- aitm-entered-review-2 ts="2026-07-29T11:00:00Z" -->',
    '<!-- aitm-dod-verified sha="def5678" ts="2026-07-29T11:00:00Z" -->',
    `<!-- aitm-agent-review-proof schema="1" epoch="${epochTwo}" sha="def5678" ts="2026-07-29T11:01:00Z" validators="unit" result="pass" -->`,
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Passed final human review',
  ].join('\n');
  const { deps, calls, getBody } = makeDeps({ initialBody: ambiguous });

  const r = await runApprove({ issueNumber: 58, cfg, deps, human: true });

  assert.equal(r.status, 'agent-review-incomplete');
  assert.equal(calls.writes.length, 0);
  assert.equal((getBody().match(/aitm-full-auto-approved/g) || []).length, 2);
  assert.match(getBody(), /<!-- aitm-review-approved ts="2026-07-29T10:02:00Z" -->/);
}
