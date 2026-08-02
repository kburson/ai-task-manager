// @story #1093
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHeal, main } from '../../../heal-timing-log.mjs';

const HEADER = [
  '## ⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
  '| --- | --- | --- | --- | --- | --- | --- |',
];
const row = (ts, event, description = event) =>
  `| ${ts} | ${event} |  |  |  | 100 | ${description} | <!-- row-sec: a=0 i=0 -->`;
const NOISY = [
  ...HEADER,
  row('2026-08-01 10:00:00 -05:00', 'review:started'),
  row('2026-08-01 10:01:00 -05:00', 'review:passed', 'first pass'),
  row('2026-08-01 10:02:00 -05:00', 'review:passed', 'duplicate pass'),
  row('2026-08-01 10:03:00 -05:00', 'stop'),
  row('2026-08-01 10:03:05 -05:00', 'resumed'),
  '',
].join('\n');

function fakeComment(body = NOISY) {
  const updates = [];
  return {
    updates,
    findTimingComment: async () => ({ id: 'C_1093', body }),
    updateTimingComment: async (id, repo, nextBody) => updates.push({ id, repo, nextBody }),
  };
}

function sink() {
  const chunks = [];
  return { write: (chunk) => chunks.push(String(chunk)), text: () => chunks.join('') };
}

test('runHeal dry-run reports each removal class without writing', async () => {
  const deps = fakeComment();
  const result = await runHeal({ issueNumber: 1093, repo: 'o/r', deps });
  assert.equal(result.status, 'dry-run');
  assert.equal(result.zeroStopResumeBefore, 1);
  assert.equal(result.zeroStopResumeAfter, 0);
  assert.equal(result.redundantReviewPassBefore, 1);
  assert.equal(result.redundantReviewPassAfter, 0);
  assert.equal(deps.updates.length, 0);
});

test('runHeal apply writes the healed body exactly once and reruns as a no-op', async () => {
  const deps = fakeComment();
  const applied = await runHeal({ issueNumber: 1093, repo: 'o/r', apply: true, deps });
  assert.equal(applied.status, 'healed');
  assert.equal(deps.updates.length, 1);
  assert.doesNotMatch(deps.updates[0].nextBody, /\| stop \|/);
  assert.doesNotMatch(deps.updates[0].nextBody, /duplicate pass/);

  const noOpDeps = fakeComment(deps.updates[0].nextBody);
  const noOp = await runHeal({ issueNumber: 1093, repo: 'o/r', apply: true, deps: noOpDeps });
  assert.equal(noOp.status, 'already-canonical');
  assert.equal(noOpDeps.updates.length, 0);
});

test('per-issue apply stays under the existing lock and reports separate counts', async () => {
  const out = sink();
  const seen = { lockPath: null, run: null };
  await main(['1093', '--apply'], {
    loadConfig: async () => ({ repo: 'o/r' }),
    getProjectDir: () => '/project',
    withLock: async (lockPath, callback) => {
      seen.lockPath = lockPath;
      return callback();
    },
    runHeal: async (options) => {
      seen.run = options;
      return {
        status: 'healed',
        retiredBefore: 0,
        retiredAfter: 0,
        zeroStopResumeBefore: 1,
        zeroStopResumeAfter: 0,
        redundantReviewPassBefore: 1,
        redundantReviewPassAfter: 0,
        commentId: 'C_1093',
      };
    },
    out,
  });
  assert.match(seen.lockPath, /1093/);
  assert.equal(seen.run.apply, true);
  assert.match(out.text(), /stopResume=1 → 0/);
  assert.match(out.text(), /reviewPass=1 → 0/);
});

test('scoped sweep reports aggregate counts without widening the reviewed scope', async () => {
  const out = sink();
  const seen = [];
  await main(['--sweep', '--scope', '1089,1093'], {
    loadConfig: async () => ({ repo: 'o/r', projectId: 'P' }),
    getProjectDir: () => '/project',
    withLock: async (_lockPath, callback) => callback(),
    runHeal: async ({ issueNumber }) => {
      seen.push(Number(issueNumber));
      return {
        status: 'dry-run',
        retiredBefore: 0,
        retiredAfter: 0,
        zeroStopResumeBefore: Number(issueNumber) === 1089 ? 5 : 0,
        zeroStopResumeAfter: 0,
        redundantReviewPassBefore: Number(issueNumber) === 1089 ? 3 : 0,
        redundantReviewPassAfter: 0,
        commentId: `C_${issueNumber}`,
      };
    },
    out,
  });
  assert.deepEqual(seen, [1089, 1093]);
  assert.match(out.text(), /#1089\tdry-run\tretired=0 → 0 stopResume=5 → 0 reviewPass=3 → 0/);
  assert.match(out.text(), /stopResumeRows=5/);
  assert.match(out.text(), /reviewPassRows=3/);
});
