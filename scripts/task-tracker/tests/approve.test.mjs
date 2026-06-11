#!/usr/bin/env node
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
import {
  runApprove,
  buildMarker,
  hasApprovalMarker,
  insertApprovalMarker,
  detectFullAuto,
} from '../verbs/approve.mjs';

const cfg = { repo: 'o/r' };
const FIXED_TS = '2026-05-10T00:00:00Z';

function makeDeps(overrides = {}) {
  const calls = { writes: [], bodies: [], stateLookups: 0, comments: [] };
  const initialBody =
    overrides.initialBody ??
    '## Acceptance Criteria\n\n- [x] all\n\n<!-- ai-task-manager:fields:start -->\n```json\n{"schema":1,"values":{"size":"S"}}\n```\n<!-- ai-task-manager:fields:end -->\n';
  let body = initialBody;
  return {
    calls,
    deps: {
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
        return { status: 'ok' };
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

// 1. wrong-state when not in review (develop)
{
  const { deps, calls } = makeDeps({ state: 'develop' });
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'wrong-state');
  assert.match(r.message, /develop/);
  assert.equal(calls.writes.length, 0);
}

// 1b. wrong-state when in plan (Review approval cannot approve Plan)
{
  const { deps, calls } = makeDeps({ state: 'plan' });
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'wrong-state');
  assert.match(r.message, /plan/);
  assert.equal(calls.writes.length, 0);
}

// 2. first call inserts marker
{
  const { deps, calls, getBody } = makeDeps();
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'approved');
  assert.equal(r.ts, FIXED_TS);
  assert.equal(calls.writes.length, 1);
  assert.match(getBody(), /<!-- aitm-review-approved ts="2026-05-10T00:00:00Z" -->/);
}

// 3. second call is idempotent
{
  const { deps, calls } = makeDeps();
  await runApprove({ issueNumber: 58, cfg, deps });
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'already-approved');
  assert.equal(calls.writes.length, 1, 'second call must not rewrite the body');
}

// 4. marker placed before fields-block; legacy fixture normalized to new encoding
{
  const { deps, getBody } = makeDeps();
  await runApprove({ issueNumber: 58, cfg, deps });
  const body = getBody();
  const markerIdx = body.indexOf('<!-- aitm-review-approved');
  const fieldsIdx = body.indexOf('<!-- aitm-fields:');
  assert.ok(
    markerIdx >= 0 && fieldsIdx > markerIdx,
    `marker must appear before field-DB; markerIdx=${markerIdx}, fieldsIdx=${fieldsIdx}`
  );
  assert.ok(
    !body.includes('<!-- ai-task-manager:fields:start -->'),
    'legacy fields-start marker must not survive an approve write'
  );
}

// 5. marker appended at end when no fields-block
{
  const { deps, getBody } = makeDeps({ initialBody: '## AC\n- [x] x\n' });
  await runApprove({ issueNumber: 58, cfg, deps });
  assert.match(getBody(), /<!-- aitm-review-approved ts="2026-05-10T00:00:00Z" -->\s*$/);
}

// 6. pure helpers
{
  assert.equal(buildMarker(FIXED_TS), `<!-- aitm-review-approved ts="${FIXED_TS}" -->`);
  assert.equal(hasApprovalMarker(''), false);
  assert.equal(hasApprovalMarker(buildMarker(FIXED_TS)), true);
  assert.equal(hasApprovalMarker('<!--aitm-review-approved:foo-->'), true);
  // insertApprovalMarker is idempotent on already-marked body.
  const already = `body\n${buildMarker(FIXED_TS)}\n`;
  assert.equal(insertApprovalMarker(already, '2099-01-01T00:00:00Z'), already);
}

// 7. new-encoded body stays new-encoded
{
  const newBody = '## AC\n- [x] x\n\n<!-- aitm-fields: {"schema":1,"values":{"size":"S"}} -->\n';
  const out = insertApprovalMarker(newBody, FIXED_TS);
  assert.ok(out.includes('<!-- aitm-fields:'), 'output must contain new-encoded field-DB');
  assert.ok(
    !out.includes('ai-task-manager:fields:start'),
    'output must NOT contain legacy fields-start marker'
  );
  const markerIdx = out.indexOf('<!-- aitm-review-approved');
  const fieldsIdx = out.indexOf('<!-- aitm-fields:');
  assert.ok(markerIdx >= 0 && fieldsIdx > markerIdx, 'approval marker must precede field-DB');
}

// 8. legacy-encoded body is normalized to new encoding
{
  const legacy =
    '## AC\n- [x] x\n\n<!-- ai-task-manager:fields:start -->\n```json\n{"schema":1,"values":{"size":"M"}}\n```\n<!-- ai-task-manager:fields:end -->\n';
  const out = insertApprovalMarker(legacy, FIXED_TS);
  assert.ok(
    !out.includes('ai-task-manager:fields:start'),
    'legacy fields-start marker must be stripped'
  );
  assert.ok(
    !out.includes('ai-task-manager:fields:end'),
    'legacy fields-end marker must be stripped'
  );
  assert.ok(
    out.includes('<!-- aitm-fields: {"schema":1,"values":{"size":"M"}} -->'),
    'output must contain canonical re-emission of parsed values'
  );
}

// 9. auto-ticks "Passed final human review" Lifecycle item on approve (#139)
{
  const body = [
    '## AC',
    '- [x] x',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [ ] Passed final human review',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
    '',
    '<!-- aitm-fields: {"schema":1,"values":{"size":"S"}} -->',
    '',
  ].join('\n');
  const { deps, getBody } = makeDeps({ initialBody: body });
  await runApprove({ issueNumber: 58, cfg, deps });
  const out = getBody();
  assert.match(out, /- \[x\] Passed final human review/);
  assert.match(out, /- \[ \] Story closed and moved to Done/);
  assert.match(out, /- \[ \] Timing data flushed to issue/);
}

// 10. auto-tick is a no-op when there is no Lifecycle section (back-compat)
{
  const { deps, getBody } = makeDeps({ initialBody: '## AC\n- [x] x\n' });
  await runApprove({ issueNumber: 58, cfg, deps });
  assert.match(getBody(), /<!-- aitm-review-approved(?: ts="|:)/);
  assert.doesNotMatch(getBody(), /Passed final human review/);
}

// --- #156 Full-Auto audit marker ---

// 11. detectFullAuto: env=TT_FULL_AUTO=1 → fires with env=1 (human reviewer set
// to isolate the legacy override signal — #177)
{
  const r = detectFullAuto({
    env: { TT_FULL_AUTO: '1', TASK_TRACKER_HUMAN_REVIEWER: 'alice' },
    tty: true,
  });
  assert.equal(r.fired, true);
  assert.match(r.signals, /reviewer-unset=0/);
  assert.match(r.signals, /env=1/);
  assert.match(r.signals, /tty=1/);
  assert.match(r.signals, /ci=0/);
}

// 12. detectFullAuto: CI=1 → fires with ci=1
{
  const r = detectFullAuto({
    env: { CI: '1', TASK_TRACKER_HUMAN_REVIEWER: 'alice' },
    tty: true,
  });
  assert.equal(r.fired, true);
  assert.match(r.signals, /reviewer-unset=0,env=0,tty=1,ci=1/);
}

// 13. detectFullAuto: stdin.isTTY === false → fires with tty=0
{
  const r = detectFullAuto({ env: { TASK_TRACKER_HUMAN_REVIEWER: 'alice' }, tty: false });
  assert.equal(r.fired, true);
  assert.match(r.signals, /reviewer-unset=0,env=0,tty=0,ci=0/);
}

// 14. detectFullAuto: no signals AND human reviewer set → does not fire
{
  const r = detectFullAuto({ env: { TASK_TRACKER_HUMAN_REVIEWER: 'alice' }, tty: true });
  assert.equal(r.fired, false);
  assert.equal(r.signals, '');
}

// 14a. #177 — detectFullAuto: human reviewer unset (Claude-Code shape) → fires
// via reviewer-unset signal even when legacy signals are inert.
{
  const r = detectFullAuto({ env: {}, tty: true });
  assert.equal(r.fired, true);
  assert.match(r.signals, /reviewer-unset=1/);
}

// 14b. #177 — detectFullAuto: human reviewer set to empty string is treated
// as unset (full-auto fires).
{
  const r = detectFullAuto({ env: { TASK_TRACKER_HUMAN_REVIEWER: '   ' }, tty: true });
  assert.equal(r.fired, true);
  assert.match(r.signals, /reviewer-unset=1/);
}

// 15. runApprove stamps full-auto marker when detect fires
{
  const { deps, getBody } = makeDeps({
    deps: { detectFullAuto: () => ({ fired: true, signals: 'env=1,tty=0,ci=0' }) },
  });
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'approved');
  assert.equal(r.fullAuto, true);
  assert.match(getBody(), /<!-- aitm-review-approved ts="2026-05-10T00:00:00Z" -->/);
  assert.match(
    getBody(),
    /<!-- aitm-full-auto-approved: 2026-05-10T00:00:00Z:env=1,tty=0,ci=0 -->/
  );
  // #161 / D4 — visible footnote also present.
  assert.match(getBody(), /<!-- aitm-full-auto-footnote:start -->/);
  assert.match(getBody(), /Full-Auto mode enabled: human review skipped/);
}

// 16. runApprove omits full-auto marker AND footnote when detect returns not-fired
{
  const { deps, getBody } = makeDeps({
    deps: { detectFullAuto: () => ({ fired: false, signals: '' }) },
  });
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.fullAuto, false);
  assert.match(getBody(), /<!-- aitm-review-approved(?: ts="|:)/);
  assert.doesNotMatch(getBody(), /aitm-full-auto-approved/);
  // #161 / D4 — no footnote in human-review mode.
  assert.doesNotMatch(getBody(), /aitm-full-auto-footnote/);
}

// #302 — When the Lifecycle box is ALREADY ticked (Full-Auto operator pre-ticked
// per the manual rule), approve must run silently. No `lifecycle-tick-noop`
// warning on stderr — that warning is reserved for genuinely-missing labels.
{
  const preTickedBody = [
    '## Acceptance Criteria',
    '- [x] do thing',
    '',
    '### Definition of Done',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Passed final human review',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
    '',
  ].join('\n');
  const { deps } = makeDeps({
    initialBody: preTickedBody,
    deps: { detectFullAuto: () => ({ fired: false, signals: '' }) },
  });
  const origWrite = process.stderr.write.bind(process.stderr);
  let captured = '';
  process.stderr.write = (chunk) => {
    captured += String(chunk);
    return true;
  };
  try {
    const r = await runApprove({ issueNumber: 58, cfg, deps });
    assert.equal(r.status, 'approved');
  } finally {
    process.stderr.write = origWrite;
  }
  assert.doesNotMatch(
    captured,
    /lifecycle-tick-noop/,
    'pre-ticked lifecycle box must not trigger the warning'
  );
}

// 17. (#161 / D4) Legacy lifecycle heading: warn to stderr, verb still succeeds
{
  const legacyBody = [
    '## Acceptance Criteria',
    '- [x] do thing',
    '',
    '### Definition of Done',
    '',
    '#### Closeout',
    '- [ ] Passed final human review',
    '',
  ].join('\n');
  const { deps } = makeDeps({
    initialBody: legacyBody,
    deps: { detectFullAuto: () => ({ fired: false, signals: '' }) },
  });
  const origWrite = process.stderr.write.bind(process.stderr);
  let captured = '';
  process.stderr.write = (chunk) => {
    captured += String(chunk);
    return true;
  };
  try {
    const r = await runApprove({ issueNumber: 58, cfg, deps });
    assert.equal(r.status, 'approved');
  } finally {
    process.stderr.write = origWrite;
  }
  assert.match(captured, /lifecycle-tick-noop/);
}

// --- #177 — unified Full-Auto trigger (footnote ↔ audit-comment parity) ---

// 17. Claude Code shape: TASK_TRACKER_HUMAN_REVIEWER unset, stdin is a TTY
// (legacy signals all inert). The footnote MUST be inserted and the
// aitm-full-auto-approved body marker stamped.
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
    assert.match(getBody(), /<!-- aitm-full-auto-approved: /);
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
    assert.doesNotMatch(getBody(), /<!-- aitm-full-auto-approved:/);
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
  const { projectScratchDir } = await import('../lib/scratch-dir.mjs');
  const path = await import('node:path');
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'preflight-test-'));
  const scopeFile = path.join(dir, 'scope.md');
  const acFile = path.join(dir, 'ac.md');
  const planFile = path.join(dir, 'plan.md');
  writeFileSync(scopeFile, 'Scope text.\n');
  writeFileSync(acFile, '- [ ] one\n');
  writeFileSync(
    planFile,
    '- **Size:** S\n- **Estimate:** 1h\n- **Priority:** P2\n- **Sequence:** —\n'
  );
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
  const lifecycleIdx = body.indexOf('#### Lifecycle');
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
// proof for that tick is the audit comment + `aitm-full-auto-approved` body
// marker, not an inline `aitm-verified-at` HTML comment (which would also
// break lifecycle-dod.mjs's exact-label match).
{
  const body = [
    '## Acceptance Criteria',
    '- [x] x',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [ ] Passed final human review',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
    '',
  ].join('\n');
  let capturedOpts = null;
  let liveBody = body;
  const r = await runApprove({
    issueNumber: 58,
    cfg,
    deps: {
      fetchIssueBody: async () => liveBody,
      mutateIssueBody: async (opts) => {
        capturedOpts = opts;
        const next = opts.mutate(liveBody);
        liveBody = next;
        return { status: 'ok' };
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
  const body = [
    '## Acceptance Criteria',
    '- [x] x',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [ ] Passed final human review',
    '',
  ].join('\n');
  let capturedOpts = null;
  let liveBody = body;
  const r = await runApprove({
    issueNumber: 58,
    cfg,
    deps: {
      fetchIssueBody: async () => liveBody,
      mutateIssueBody: async (opts) => {
        capturedOpts = opts;
        const next = opts.mutate(liveBody);
        liveBody = next;
        return { status: 'ok' };
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
