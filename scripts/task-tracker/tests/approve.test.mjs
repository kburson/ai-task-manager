#!/usr/bin/env node
// Unit tests for scripts/task-tracker/verbs/approve.mjs.
//
// Covers:
//   1. Headless refusal when no --answer is passed and CI/no-TTY is true.
//   2. needs-prompt path emits the deep-dive section as the question context.
//   3. Missing Deep-Dive Analysis section -> error.
//   4. --answer yes appends the aitm-plan-approved marker and calls moveState.
//   5. AC section is byte-identical before/after approve (marker placement
//      must never mutate Acceptance Criteria).
//   6. --answer no with reason posts a comment and does NOT call moveState.
//   7. --answer no with empty reason -> error, no comment posted.
//   8. Unrecognised --answer -> error.
//   9. extractDeepDive helper edge cases.
//  10. writePlanApprovedMarker idempotent on already-marked body.
//  11. Revision loop — repeated rejections post distinct comments.
//  12. Marker regex is strict: prose mentions of the marker shape inside
//      backticks/code do not satisfy the gate (so we don't accidentally
//      auto-approve from docs).

import { strict as assert } from 'node:assert';
import {
  runApprove,
  extractDeepDive,
  writePlanApprovedMarker,
  APPROVAL_MARKER_RE,
} from '../verbs/approve.mjs';

const cfg = { repo: 'o/r' };

const BODY_WITH_DEEPDIVE = [
  '## Acceptance Criteria',
  '',
  '- [ ] do the thing',
  '',
  '## Deep-Dive Analysis (2026-05-09)',
  '',
  'Files: foo.mjs, bar.mjs',
  'Risks: none material',
  '',
  '## Dependency Map',
  'none',
  '',
  '<!-- aitm-deep-dive-complete: 2026-05-09T00:00:00Z -->',
  '',
].join('\n');

function makeDeps(overrides = {}) {
  const calls = { writes: [], comments: [], moveStateCalls: 0, fetched: 0 };
  return {
    calls,
    deps: {
      fetchIssueBody: async () => {
        calls.fetched++;
        return { title: 'sub', body: BODY_WITH_DEEPDIVE };
      },
      writeIssueBody: async ({ body }) => {
        calls.writes.push(body);
      },
      postComment: async ({ body }) => {
        calls.comments.push(body);
      },
      moveState: async () => {
        calls.moveStateCalls++;
        return 0;
      },
      isHeadless: () => false,
      fetchParentEpicNumber: async () => null,
      readParentStatus: async () => 'develop',
      ...overrides,
    },
  };
}

// 1. Headless refusal
{
  const { deps } = makeDeps({ isHeadless: () => true });
  const r = await runApprove({ issueNumber: 50, cfg, deps });
  assert.equal(r.status, 'headless-refused');
  assert.match(r.message, /headless mode cannot answer/);
}

// 2. needs-prompt path returns deep-dive content
{
  const { deps, calls } = makeDeps();
  const r = await runApprove({ issueNumber: 50, cfg, deps });
  assert.equal(r.status, 'needs-prompt');
  assert.deepEqual(r.prompt.options, ['yes', 'no']);
  assert.match(r.prompt.question, /#50/);
  const summary = r.prompt.contextLines.join('\n');
  assert.match(summary, /Deep-Dive Analysis/);
  assert.match(summary, /Files: foo.mjs/);
  assert.equal(calls.fetched, 1);
}

// 3. Missing deep-dive -> error
{
  const { deps } = makeDeps({
    fetchIssueBody: async () => ({ title: 'x', body: '## Acceptance Criteria\n\n- [ ] AC\n' }),
  });
  const r = await runApprove({ issueNumber: 50, cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /no Deep-Dive Analysis section/);
}

// 4. --answer yes appends the marker and calls moveState
{
  const { deps, calls } = makeDeps();
  const r = await runApprove({ issueNumber: 50, cfg, answer: 'yes', deps });
  assert.equal(r.status, 'approved');
  assert.equal(calls.moveStateCalls, 1, 'moveState must be called on approve');
  assert.equal(calls.writes.length, 1, 'body must be written exactly once');
  assert.match(calls.writes[0], APPROVAL_MARKER_RE);
}

// 5. AC section is byte-identical before/after approve.
{
  const { deps, calls } = makeDeps();
  await runApprove({ issueNumber: 50, cfg, answer: 'yes', deps });
  const written = calls.writes[0];

  function extractAC(src) {
    const lines = String(src).split('\n');
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+Acceptance Criteria\b/i.test(lines[i])) {
        start = i;
        break;
      }
    }
    if (start === -1) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^##\s+/.test(lines[i])) {
        end = i;
        break;
      }
    }
    return lines.slice(start, end).join('\n');
  }

  const before = extractAC(BODY_WITH_DEEPDIVE);
  const after = extractAC(written);
  assert.equal(after, before, 'AC section must be byte-identical before and after approve');
  assert.doesNotMatch(after, /Plan approved by human/, 'no legacy checkbox text in AC');
}

// 6. --answer no with reason posts a comment and does NOT call moveState
{
  const { deps, calls } = makeDeps();
  const r = await runApprove({
    issueNumber: 50,
    cfg,
    answer: 'no',
    reason: 'plan misses the cache invalidation step',
    deps,
  });
  assert.equal(r.status, 'rejected');
  assert.equal(calls.moveStateCalls, 0, 'moveState must NOT run when rejected');
  assert.equal(calls.comments.length, 1);
  assert.match(calls.comments[0], /Approval refused/);
  assert.match(calls.comments[0], /cache invalidation/);
}

// 7. --answer no with empty reason -> error
{
  const { deps, calls } = makeDeps();
  const r = await runApprove({ issueNumber: 50, cfg, answer: 'no', reason: '   ', deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /requires --reason/);
  assert.equal(calls.comments.length, 0);
  assert.equal(calls.moveStateCalls, 0);
}

// 8. Unrecognised answer -> error
{
  const { deps } = makeDeps();
  const r = await runApprove({ issueNumber: 50, cfg, answer: 'maybe', deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /unrecognised --answer value/);
}

// 9. extractDeepDive helper — handles missing section
{
  assert.equal(extractDeepDive(''), null);
  assert.equal(extractDeepDive('## Other\n\nstuff'), null);
  const got = extractDeepDive('## Deep-Dive Analysis\n\nbody\n\n## Next\nx');
  assert.match(got, /^## Deep-Dive Analysis/);
  assert.doesNotMatch(got, /## Next/);
}

// 10. writePlanApprovedMarker idempotent on already-marked body
{
  const already = `## AC\n\nstuff\n\n<!-- aitm-plan-approved: 2026-05-11T00:00:00.000Z -->\n`;
  assert.equal(writePlanApprovedMarker(already), already);
}

// 11. Revision loop — caller can repeatedly reject with different reasons.
{
  const { deps, calls } = makeDeps();
  await runApprove({ issueNumber: 50, cfg, answer: 'no', reason: 'first round', deps });
  await runApprove({ issueNumber: 50, cfg, answer: 'no', reason: 'second round', deps });
  assert.equal(calls.comments.length, 2);
  assert.match(calls.comments[0], /first round/);
  assert.match(calls.comments[1], /second round/);
  assert.equal(calls.moveStateCalls, 0);
}

// 12. Marker placement appends at end with deterministic timestamp.
{
  const out = writePlanApprovedMarker('## AC\n\n- [ ] x\n', {
    now: () => '2026-05-11T12:00:00.000Z',
  });
  assert.match(out, /<!-- aitm-plan-approved: 2026-05-11T12:00:00\.000Z -->/);
  // Marker sits at the end of the body, after the AC content.
  const markerIdx = out.indexOf('<!-- aitm-plan-approved:');
  const acIdx = out.indexOf('## AC');
  assert.ok(markerIdx > acIdx);
  // Empty body still gets a marker.
  const empty = writePlanApprovedMarker('', { now: () => '2026-05-11T12:00:00.000Z' });
  assert.match(empty, APPROVAL_MARKER_RE);
}

// 13. Legacy strip — approve on a body with `- [ ] Plan approved by human`
//     (or its ticked variant) cleans up the checkbox and writes the marker.
{
  for (const variant of ['- [ ]', '- [x]']) {
    const out = writePlanApprovedMarker(
      `## Acceptance Criteria\n\n- [ ] do thing\n${variant} Plan approved by human\n\n## Next\n`,
      { now: () => '2026-05-11T12:00:00.000Z' }
    );
    assert.doesNotMatch(out, /Plan approved by human/, `legacy ${variant} line must be stripped`);
    assert.match(out, APPROVAL_MARKER_RE, 'marker must be appended');
  }
}

// 14. Legacy fallback — heading present, marker absent → gate passes.
{
  const LEGACY = [
    '## Acceptance Criteria',
    '- [ ] AC',
    '',
    '## Deep-Dive Analysis (2025-12-01)',
    '',
    'historical content',
    '',
  ].join('\n');
  const { deps, calls } = makeDeps({
    fetchIssueBody: async () => ({ title: 'legacy', body: LEGACY }),
  });
  const r = await runApprove({ issueNumber: 83, cfg, answer: 'yes', deps });
  assert.equal(r.status, 'approved', 'heading-only legacy body must satisfy the deep-dive gate');
  assert.equal(calls.moveStateCalls, 1);
}

// 15. Gate refusal — neither heading nor marker → deep-dive-required.
{
  const NONE = '## Acceptance Criteria\n- [ ] AC\n';
  const { deps, calls } = makeDeps({
    fetchIssueBody: async () => ({ title: 'bare', body: NONE }),
  });
  const r = await runApprove({ issueNumber: 99, cfg, answer: 'yes', deps });
  assert.equal(r.status, 'deep-dive-required');
  assert.equal(calls.moveStateCalls, 0);
}

console.log('approve.test.mjs: all passed');
