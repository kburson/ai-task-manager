#!/usr/bin/env node
// Unit tests for scripts/task-tracker/verbs/approve.mjs.
//
// Covers:
//   1. Headless refusal when no --answer is passed and CI/no-TTY is true.
//   2. needs-prompt path emits the deep-dive section as the question context.
//   3. Missing Deep-Dive Analysis section -> error.
//   4. --answer yes ticks the checkbox (replacement) and calls moveState.
//   5. --answer yes inserts the checkbox under Acceptance Criteria when absent.
//   6. --answer no with reason posts a comment and does NOT call moveState.
//   7. --answer no with empty reason -> error, no comment posted.
//   8. Unrecognised --answer -> error.

import { strict as assert } from 'node:assert';
import { runApprove, extractDeepDive, tickApprovalCheckbox, APPROVAL_CHECKBOX_LABEL } from '../verbs/approve.mjs';

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
].join('\n');

const BODY_WITH_PRE_INSERTED_CHECKBOX = [
  '## Acceptance Criteria',
  '',
  '- [ ] do the thing',
  '- [ ] Plan approved by human',
  '',
  '## Deep-Dive Analysis (2026-05-09)',
  '',
  'content',
  '',
].join('\n');

function makeDeps(overrides = {}) {
  const calls = { writes: [], comments: [], moveStateCalls: 0, fetched: 0 };
  return {
    calls,
    deps: {
      fetchIssueBody: async () => { calls.fetched++; return { title: 'sub', body: BODY_WITH_DEEPDIVE }; },
      writeIssueBody: async ({ body }) => { calls.writes.push(body); },
      postComment: async ({ body }) => { calls.comments.push(body); },
      moveState: async () => { calls.moveStateCalls++; return 0; },
      isHeadless: () => false,
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

// 4. --answer yes ticks an existing checkbox and calls moveState
{
  const { deps, calls } = makeDeps({
    fetchIssueBody: async () => ({ title: 'x', body: BODY_WITH_PRE_INSERTED_CHECKBOX }),
  });
  const r = await runApprove({ issueNumber: 50, cfg, answer: 'yes', deps });
  assert.equal(r.status, 'approved');
  assert.equal(calls.moveStateCalls, 1, 'moveState must be called on approve');
  assert.equal(calls.writes.length, 1, 'body must be written exactly once');
  assert.match(calls.writes[0], /^- \[x\] Plan approved by human$/m);
  assert.doesNotMatch(calls.writes[0], /^- \[ \] Plan approved by human$/m);
}

// 5. --answer yes inserts the checkbox under Acceptance Criteria when absent
{
  const { deps, calls } = makeDeps();
  const r = await runApprove({ issueNumber: 50, cfg, answer: 'yes', deps });
  assert.equal(r.status, 'approved');
  assert.equal(calls.writes.length, 1);
  // The new checkbox must be inside the AC section, before the next ## heading.
  const written = calls.writes[0];
  const acIdx = written.indexOf('## Acceptance Criteria');
  const nextHeadingIdx = written.indexOf('## Deep-Dive Analysis');
  const checkboxIdx = written.indexOf('- [x] Plan approved by human');
  assert.ok(acIdx >= 0 && nextHeadingIdx > acIdx);
  assert.ok(checkboxIdx > acIdx && checkboxIdx < nextHeadingIdx,
    `approval checkbox must sit inside AC section; got idx ${checkboxIdx}, AC ${acIdx}, next ${nextHeadingIdx}`);
  assert.equal(calls.moveStateCalls, 1);
}

// 6. --answer no with reason posts a comment and does NOT call moveState
{
  const { deps, calls } = makeDeps();
  const r = await runApprove({
    issueNumber: 50, cfg, answer: 'no', reason: 'plan misses the cache invalidation step', deps,
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

// 10. tickApprovalCheckbox idempotent on already-checked body
{
  const already = `## AC\n\n- [x] Plan approved by human\n`;
  assert.equal(tickApprovalCheckbox(already), already);
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

console.log(`approve.test.mjs: all passed (label=${APPROVAL_CHECKBOX_LABEL})`);
