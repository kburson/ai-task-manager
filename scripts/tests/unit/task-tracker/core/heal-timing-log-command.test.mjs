// @story #1093
// @story #1134
import assert from 'node:assert/strict';
import { runHeal, parseArgs, main } from '../../../../task-tracker/heal-timing-log.mjs';

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
  row('2026-08-01 10:01:10 -05:00', 'review:passed', 'duplicate pass'),
  row('2026-08-01 10:01:30 -05:00', 'review:approved'),
  row('2026-08-01 10:01:31 -05:00', 'issue:wrap'),
  row('2026-08-01 10:01:32 -05:00', 'issue:closed'),
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

{
  const deps = fakeComment();
  const result = await runHeal({ issueNumber: 1093, repo: 'o/r', deps });
  assert.equal(result.status, 'dry-run');
  assert.equal(result.zeroStopResumeBefore, 1);
  assert.equal(result.zeroStopResumeAfter, 0);
  assert.equal(result.redundantReviewPassBefore, 1);
  assert.equal(result.redundantReviewPassAfter, 0);
  assert.equal(result.postTerminalBefore, 2);
  assert.equal(result.postTerminalAfter, 0);
  assert.equal(deps.updates.length, 0);
}

{
  const result = await runHeal({
    issueNumber: 1093,
    repo: 'o/r',
    deps: { findTimingComment: async () => null },
  });
  assert.equal(result.status, 'no-comment');
  assert.equal(result.postTerminalBefore, 0);
  assert.equal(result.postTerminalAfter, 0);
}

{
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
}

{
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
        postTerminalBefore: 2,
        postTerminalAfter: 0,
        commentId: 'C_1093',
      };
    },
    out,
    exit: (code) => assert.equal(code, 0),
  });
  assert.match(seen.lockPath, /1093/);
  assert.equal(seen.run.apply, true);
  assert.match(out.text(), /stopResume=1 → 0/);
  assert.match(out.text(), /reviewPass=1 → 0/);
  assert.match(out.text(), /postTerminal=2 → 0/);
}

{
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
        postTerminalBefore: Number(issueNumber) === 1089 ? 4 : 0,
        postTerminalAfter: 0,
        commentId: `C_${issueNumber}`,
      };
    },
    out,
    exit: (code) => assert.equal(code, 0),
  });
  assert.deepEqual(seen, [1089, 1093]);
  assert.match(
    out.text(),
    /#1089\tdry-run\tretired=0 → 0 stopResume=5 → 0 reviewPass=3 → 0 postTerminal=4 → 0/
  );
  assert.match(out.text(), /stopResumeRows=5/);
  assert.match(out.text(), /reviewPassRows=3/);
  assert.match(out.text(), /postTerminalRows=4/);
}

{
  assert.equal(parseArgs(['--sweep', '--delay-ms', '600']).delayMs, 600);
  assert.equal(parseArgs(['--sweep', '--delay-ms=250']).delayMs, 250);

  const sleeps = [];
  const seen = [];
  await main(['--sweep', '--scope', '1089,1093', '--delay-ms', '250'], {
    loadConfig: async () => ({ repo: 'o/r', projectId: 'P' }),
    getProjectDir: () => '/project',
    withLock: async (_lockPath, callback) => callback(),
    sleep: async (ms) => sleeps.push(ms),
    runHeal: async ({ issueNumber }) => {
      seen.push(Number(issueNumber));
      return {
        status: 'already-canonical',
        retiredBefore: 0,
        retiredAfter: 0,
        zeroStopResumeBefore: 0,
        zeroStopResumeAfter: 0,
        redundantReviewPassBefore: 0,
        redundantReviewPassAfter: 0,
        postTerminalBefore: 0,
        postTerminalAfter: 0,
        commentId: `C_${issueNumber}`,
      };
    },
    out: sink(),
    exit: (code) => assert.equal(code, 0),
  });
  assert.deepEqual(seen, [1089, 1093]);
  assert.deepEqual(sleeps, [250]);
}

for (const scope of [
  '1093,bad',
  'bad',
  '',
  '0',
  '-1',
  '1.5',
  '1e3',
  '+1',
  ' 1',
  '1,,2',
  '#',
  '9007199254740992',
]) {
  const err = sink();
  let exitCode = null;
  let ran = false;
  await main(['--sweep', '--scope', scope], {
    loadConfig: async () => ({ repo: 'o/r', projectId: 'P' }),
    runHeal: async () => {
      ran = true;
    },
    err,
    out: sink(),
    exit: (code) => {
      exitCode = code;
    },
  });
  assert.equal(exitCode, 2, `scope ${JSON.stringify(scope)} must fail closed`);
  assert.equal(ran, false, `scope ${JSON.stringify(scope)} must not run a partial sweep`);
  assert.match(err.text(), /invalid --scope/);
}

{
  const out = sink();
  let exitCode = null;
  await main(['--sweep', '--scope', '1093'], {
    loadConfig: async () => ({ repo: 'o/r', projectId: 'P' }),
    getProjectDir: () => '/project',
    withLock: async (_lockPath, callback) => callback(),
    runHeal: async () => {
      throw new Error('simulated GitHub read failure');
    },
    out,
    exit: (code) => {
      exitCode = code;
    },
  });
  assert.equal(exitCode, 1);
  assert.match(out.text(), /failed=1/);
  assert.match(out.text(), /simulated GitHub read failure/);
}

console.log('heal-timing-log-command.test.mjs: ok');
