// Tests for the Agent Review Gate orchestrator (#809).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from './registry.mjs';
import {
  parseEnteredStages,
  buildReviewContext,
  runAgentReviewGate,
  buildReviewFailedBlock,
  stampReviewFailed,
  clearReviewFailed,
  hasReviewFailed,
  REVIEW_FAILED_START,
  REVIEW_FAILED_END,
} from './review-gate.mjs';

test('parseEnteredStages reads both marker grammars in body order', () => {
  const body = [
    '<!-- aitm-entered-refine ts="2026-07-01T00:00:00.000Z" -->',
    'noise',
    '<!-- aitm-entered-develop: 2026-07-02T00:00:00Z -->',
    '<!-- aitm-entered-test ts="2026-07-03T00:00:00.000Z" -->',
  ].join('\n');
  assert.deepEqual(parseEnteredStages(body), [
    { stage: 'refine', ts: '2026-07-01T00:00:00.000Z' },
    { stage: 'develop', ts: '2026-07-02T00:00:00Z' },
    { stage: 'test', ts: '2026-07-03T00:00:00.000Z' },
  ]);
});

test('parseEnteredStages tolerates a non-string and returns []', () => {
  assert.deepEqual(parseEnteredStages(undefined), []);
  assert.deepEqual(parseEnteredStages(null), []);
});

test('buildReviewContext exposes body, comments, and parsed markers', () => {
  const body = '<!-- aitm-entered-develop ts="2026-07-02T00:00:00.000Z" -->';
  const ctx = buildReviewContext({
    body,
    issueNumber: 42,
    repo: 'o/r',
    comments: [{ body: 'c1' }],
  });
  assert.equal(ctx.body, body);
  assert.equal(ctx.issueNumber, 42);
  assert.equal(ctx.repo, 'o/r');
  assert.deepEqual(ctx.comments, [{ body: 'c1' }]);
  assert.deepEqual(ctx.markers.enteredStages, [
    { stage: 'develop', ts: '2026-07-02T00:00:00.000Z' },
  ]);
});

test('buildReviewContext coerces a non-array comments to []', () => {
  const ctx = buildReviewContext({ body: 'x', comments: 'nope' });
  assert.deepEqual(ctx.comments, []);
});

test('runAgentReviewGate returns a vacuous pass with an empty registry', () => {
  const registry = createRegistry();
  const res = runAgentReviewGate({ body: 'x', issueNumber: 1, repo: 'o/r', registry });
  assert.equal(res.pass, true);
  assert.deepEqual(res.failures, []);
  assert.equal(res.normalizedBody, undefined);
  assert.equal(res.context.issueNumber, 1);
});

test('runAgentReviewGate surfaces a failing validator and its context', () => {
  const registry = createRegistry();
  registry.register({
    id: 'v-demo',
    validate: (ctx) => {
      // The validator receives the assembled context.
      assert.equal(ctx.issueNumber, 7);
      assert.ok(Array.isArray(ctx.markers.enteredStages));
      return { pass: false, failures: ['missing section X'] };
    },
  });
  const res = runAgentReviewGate({ body: 'x', issueNumber: 7, repo: 'o/r', registry });
  assert.equal(res.pass, false);
  assert.deepEqual(res.failures, ['v-demo: missing section X']);
});

test('buildReviewFailedBlock wraps failures between the marker sentinels', () => {
  const block = buildReviewFailedBlock(['v1: bad', 'v2: worse'], { ts: 'T' });
  assert.ok(block.startsWith(REVIEW_FAILED_START));
  assert.ok(block.trimEnd().endsWith(REVIEW_FAILED_END));
  assert.match(block, /ts="T"/);
  assert.match(block, /- v1: bad/);
  assert.match(block, /- v2: worse/);
});

test('buildReviewFailedBlock renders a placeholder when there are no failures', () => {
  const block = buildReviewFailedBlock([]);
  assert.match(block, /no detail reported/);
});

test('stampReviewFailed appends the marker and is idempotent', () => {
  const body = '# Title\n\nbody text';
  const once = stampReviewFailed(body, ['v1: bad'], { ts: 'T1' });
  assert.ok(hasReviewFailed(once));
  // Stamping again replaces the prior block rather than stacking a second.
  const twice = stampReviewFailed(once, ['v2: other'], { ts: 'T2' });
  const starts = twice.split(REVIEW_FAILED_START).length - 1;
  assert.equal(starts, 1);
  assert.match(twice, /- v2: other/);
  assert.doesNotMatch(twice, /- v1: bad/);
  // The original body content survives the re-stamp.
  assert.match(twice, /body text/);
});

test('clearReviewFailed removes the block and is idempotent when absent', () => {
  const body = 'keep me';
  assert.equal(clearReviewFailed(body).trim(), 'keep me');
  const stamped = stampReviewFailed(body, ['v1: bad'], { ts: 'T' });
  const cleared = clearReviewFailed(stamped);
  assert.equal(hasReviewFailed(cleared), false);
  assert.match(cleared, /keep me/);
});

test('hasReviewFailed reports presence', () => {
  assert.equal(hasReviewFailed('nothing here'), false);
  assert.equal(hasReviewFailed(stampReviewFailed('x', ['a'], {})), true);
});

test('#1004 — a prose sentence quoting both delimiters inline does not strand or corrupt a genuine review-failed block', () => {
  const genuine = stampReviewFailed('placeholder', ['v1: bad'], { ts: 'T' });
  const proseLine =
    'Docs note: the block runs from `<!-- aitm-review-failed:start -->` to `<!-- aitm-review-failed:end -->` inline in one sentence.';
  const body = `# Title\n\n${proseLine}\n\n${genuine}`;

  assert.ok(hasReviewFailed(body), 'the genuine standalone block must still be detected');

  const cleared = clearReviewFailed(body);
  assert.equal(hasReviewFailed(cleared), false, 'the genuine block must be fully cleared');
  assert.match(cleared, new RegExp(proseLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(cleared, /Title/);
});
