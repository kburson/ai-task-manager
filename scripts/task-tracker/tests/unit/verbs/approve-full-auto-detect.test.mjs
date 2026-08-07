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
import {
  runApprove,
  buildMarker,
  hasApprovalMarker,
  insertApprovalMarker,
  detectFullAuto,
  parseArgs,
} from '../../../verbs/approve.mjs';

// #881 — approve requires evidence that the Agent Review Gate (the Review state's
// action) passed. Every fixture body below is suffixed with it; tests that care
// about the refusal path live in approve-agent-review-complete.test.mjs.
const AGENT_REVIEW_PASSED =
  '\n- [ ] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-05-10T00:00:00Z" sha="sandbox" validators="body-sections" result="pass" -->\n';

const cfg = { repo: 'o/r' };
const FIXED_TS = '2026-05-10T00:00:00Z';

function makeDeps(overrides = {}) {
  const calls = { writes: [], bodies: [], stateLookups: 0, comments: [] };
  const initialBody =
    overrides.initialBody ??
    '## Acceptance Criteria\n\n- [x] all\n\n<!-- ai-task-manager:fields:start -->\n```json\n{"schema":1,"values":{"size":"S"}}\n```\n<!-- ai-task-manager:fields:end -->\n';
  let body = initialBody + AGENT_REVIEW_PASSED;
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
        // #655 — surface the verified live body for approve's read-back assertion.
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
      reconcileReviewApprovedTiming: async () => ({ status: 'posted', ts: FIXED_TS }),
      ...overrides.deps,
    },
    getBody: () => body,
  };
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
  // #480 AC6 — full-auto is now folded into the single aitm-review-approved
  // marker; the separate aitm-full-auto-approved marker is no longer written.
  assert.match(
    getBody(),
    /<!-- aitm-review-approved ts="2026-05-10T00:00:00Z" full-auto="yes" signals="env=1,tty=0,ci=0" -->/
  );
  assert.doesNotMatch(getBody(), /aitm-full-auto-approved/);
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

// #979 AC2 — parseArgs recognizes --human alongside the issue number, in
// either order, and defaults to false when absent.
{
  assert.deepEqual(parseArgs(['58', '--human']), { issueNumber: 58, human: true });
  assert.deepEqual(parseArgs(['--human', '#58']), { issueNumber: 58, human: true });
  assert.deepEqual(parseArgs(['58']), { issueNumber: 58, human: false });
}

// #979 AC1 — pre-ticked "Passed final human review" box overrides a firing
// detectFullAuto: no full-auto prop, no footnote, even with every Full-Auto
// env/tty/ci signal present.
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
  const { deps, getBody } = makeDeps({
    initialBody: preTickedBody,
    deps: { detectFullAuto: () => ({ fired: true, signals: 'reviewer-unset=1,env=1,tty=1,ci=1' }) },
  });
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'approved');
  assert.equal(r.fullAuto, false);
  assert.doesNotMatch(getBody(), /full-auto="yes"/);
  assert.doesNotMatch(getBody(), /aitm-full-auto-footnote/);
}

// #979 AC2 — `--human` (runApprove's `human: true`) forces the same
// non-full-auto outcome even when the lifecycle box is NOT pre-ticked and
// every Full-Auto env signal is present.
{
  const { deps, getBody } = makeDeps({
    deps: { detectFullAuto: () => ({ fired: true, signals: 'reviewer-unset=1,env=1,tty=1,ci=1' }) },
  });
  const r = await runApprove({ issueNumber: 58, cfg, deps, human: true });
  assert.equal(r.status, 'approved');
  assert.equal(r.fullAuto, false);
  assert.doesNotMatch(getBody(), /full-auto="yes"/);
  assert.doesNotMatch(getBody(), /aitm-full-auto-footnote/);
}

// #979 regression — genuinely-full-auto path (no pretick, no --human) still
// fires exactly as before when detect() returns fired=true.
{
  const { deps, getBody } = makeDeps({
    deps: { detectFullAuto: () => ({ fired: true, signals: 'reviewer-unset=1,env=1,tty=1,ci=1' }) },
  });
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'approved');
  assert.equal(r.fullAuto, true);
  assert.match(getBody(), /full-auto="yes"/);
  assert.match(getBody(), /<!-- aitm-full-auto-footnote:start -->/);
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
