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
  const calls = { writes: [], bodies: [], stateLookups: 0 };
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
      writeIssueBody: async ({ body: b }) => {
        calls.writes.push(b);
        body = b;
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
  assert.match(getBody(), /<!-- aitm-review-approved: 2026-05-10T00:00:00Z -->/);
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
  const markerIdx = body.indexOf('<!-- aitm-review-approved:');
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
  assert.match(getBody(), /<!-- aitm-review-approved: 2026-05-10T00:00:00Z -->\s*$/);
}

// 6. pure helpers
{
  assert.equal(buildMarker(FIXED_TS), `<!-- aitm-review-approved: ${FIXED_TS} -->`);
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
  const markerIdx = out.indexOf('<!-- aitm-review-approved:');
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
  assert.match(getBody(), /<!-- aitm-review-approved:/);
  assert.doesNotMatch(getBody(), /Passed final human review/);
}

// --- #156 Full-Auto audit marker ---

// 11. detectFullAuto: env=TT_FULL_AUTO=1 → fires with env=1
{
  const r = detectFullAuto({ env: { TT_FULL_AUTO: '1' }, tty: true });
  assert.equal(r.fired, true);
  assert.match(r.signals, /env=1/);
  assert.match(r.signals, /tty=1/);
  assert.match(r.signals, /ci=0/);
}

// 12. detectFullAuto: CI=1 → fires with ci=1
{
  const r = detectFullAuto({ env: { CI: '1' }, tty: true });
  assert.equal(r.fired, true);
  assert.match(r.signals, /env=0,tty=1,ci=1/);
}

// 13. detectFullAuto: stdin.isTTY === false → fires with tty=0
{
  const r = detectFullAuto({ env: {}, tty: false });
  assert.equal(r.fired, true);
  assert.match(r.signals, /env=0,tty=0,ci=0/);
}

// 14. detectFullAuto: no signals → does not fire
{
  const r = detectFullAuto({ env: {}, tty: true });
  assert.equal(r.fired, false);
  assert.equal(r.signals, '');
}

// 15. runApprove stamps full-auto marker when detect fires
{
  const { deps, getBody } = makeDeps({
    deps: { detectFullAuto: () => ({ fired: true, signals: 'env=1,tty=0,ci=0' }) },
  });
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'approved');
  assert.equal(r.fullAuto, true);
  assert.match(getBody(), /<!-- aitm-review-approved: 2026-05-10T00:00:00Z -->/);
  assert.match(
    getBody(),
    /<!-- aitm-full-auto-approved: 2026-05-10T00:00:00Z:env=1,tty=0,ci=0 -->/
  );
}

// 16. runApprove omits full-auto marker when detect returns not-fired
{
  const { deps, getBody } = makeDeps({
    deps: { detectFullAuto: () => ({ fired: false, signals: '' }) },
  });
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.fullAuto, false);
  assert.match(getBody(), /<!-- aitm-review-approved:/);
  assert.doesNotMatch(getBody(), /aitm-full-auto-approved/);
}

console.log('approve.test.mjs: all passed');
