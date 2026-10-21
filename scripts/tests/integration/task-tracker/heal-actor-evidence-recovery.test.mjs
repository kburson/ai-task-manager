// @story #2082
// cspell:ignore BCLA
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runHeal, main } from '../../../task-tracker/heal-timing-log.mjs';
import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';
import { getActiveTask, setActiveTask } from '../../../task-tracker/session-state.mjs';
import { validate } from '../../../task-tracker/lib/agent-review/validators/timing-log-sequence.mjs';
import { parseTimingRows, rollupTotals } from '../../../task-tracker/timing-rollup.mjs';
import { timingFieldProjection } from '../../../gh/log-issue-time.mjs';
const original = JSON.parse(
  readFileSync(new URL('../../fixtures/2026/aitm-2055-timing.json', import.meta.url), 'utf8')
).body;
const commentNodeId = 'IC_kwDOSU6LgM8AAAABdrBCLA';
const options = {
  issueNumber: 2055,
  repo: 'kburson/ai-task-manager',
  actorEvidenceRecovery: 'aitm-2055-2026-10-21',
};
const sha = (body) => createHash('sha256').update(body).digest('hex');
const apply = {
  ...options,
  apply: true,
  expectedSourceSha: sha(original),
  expectedCommentId: commentNodeId,
};
const stages = ['refine', 'ready-for-plan', 'plan', 'develop', 'test', 'review'];
const issueBody = stages
  .map((stage) => `<!-- aitm-entered-${stage} ts="2026-10-21T14:00:00Z" -->`)
  .join('\n');
function transport(t) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), '2082-recovery-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const now = Date.parse('2026-10-21T18:00:00.123Z');
  const state = {
    body: original,
    writes: 0,
    reads: 0,
    binding: {
      issue: '#2055',
      entryStartTs: new Date(now - 1000).toISOString(),
      worktreePath: dir,
    },
  };
  const source = () => ({
    status: 'found',
    source: { repository: options.repo, issue: 2055, commentNodeId, body: state.body },
  });
  const deps = {
    getProjectDir: () => dir,
    now: () => now,
    currentSessionId: () => '2082-test-operator',
    aiAppName: () => 'codex',
    getActiveTask: () => state.binding,
    readRecoveryIssue: async () => ({
      number: 2055,
      repository_url: 'https://api.github.com/repos/' + options.repo,
      body: issueBody,
    }),
    readCanonicalTimingSource: async () => {
      state.reads++;
      return source();
    },
    updateTimingComment: async (id, repo, candidate) => {
      assert.equal(id, commentNodeId);
      assert.equal(repo, options.repo);
      state.writes++;
      state.body = candidate;
    },
  };
  return { dir, state, deps, source };
}
test('native recovery archives exact before/candidate identities, authenticates persisted owner and preserves Unknown totals', async (t) => {
  const { dir, state, deps } = transport(t);
  setActiveTask('2082-test-operator', state.binding, dir);
  deps.getActiveTask = getActiveTask;
  const result = await runHeal({ ...apply, deps });
  assert.equal(result.status, 'healed');
  assert.equal(state.writes, 1);
  assert.equal(readFileSync(path.join(result.evidenceDir, 'before.md'), 'utf8'), original);
  assert.equal(readFileSync(path.join(result.evidenceDir, 'candidate.md'), 'utf8'), state.body);
  const manifest = JSON.parse(readFileSync(path.join(result.evidenceDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.sourceSha, sha(original));
  assert.equal(manifest.candidateSha, sha(state.body));
  assert.equal(statSync(path.join(result.evidenceDir, 'before.md')).mode & 0o777, 0o600);
  const markers = { enteredStages: stages.map((stage) => ({ stage })) };
  assert.equal(validate({ comments: [{ body: original }], markers }).pass, false);
  assert.deepEqual(validate({ comments: [{ body: state.body }], markers }), {
    pass: true,
    failures: [],
  });
  assert.deepEqual(
    timingFieldProjection(rollupTotals(parseTimingRows(state.body), 5, state.body)).values,
    { engagedTime: null, sessionTime: null, reviewTime: null, planTime: null }
  );
  assert.equal((await runHeal({ ...apply, deps })).status, 'already-canonical');
  assert.equal(state.writes, 1);
});
test('registered CLI accepts only the reviewed mode under the native issue lock', async (t) => {
  const { state, deps } = transport(t);
  let locks = 0;
  let output = '';
  const exits = [];
  await main(['2055', '--actor-evidence-recovery', options.actorEvidenceRecovery], {
    ...deps,
    loadConfig: async () => ({ repo: options.repo }),
    withLock: async (_path, action) => {
      locks++;
      return action();
    },
    out: { write: (text) => (output += text) },
    err: { write: (text) => (output += text) },
    exit: (code) => exits.push(code),
  });
  assert.equal(locks, 1);
  assert.equal(JSON.parse(output).status, 'dry-run');
  assert.equal(state.writes, 0);
  assert.deepEqual(exits, []);
});
for (const extra of [{ expectedSourceSha: '0'.repeat(64) }, { expectedCommentId: 'IC_wrong' }])
  test('stale preview identity refuses before write ' + JSON.stringify(extra), async (t) => {
    const { state, deps } = transport(t);
    await assert.rejects(runHeal({ ...apply, ...extra, deps }), /dry-run-identity-mismatch/);
    assert.equal(state.writes, 0);
  });
for (const binding of [
  null,
  { issue: '#2056' },
  { entryStartTs: null },
  { closedAt: 'closed' },
  { worktreePath: process.cwd() },
])
  test('wrong, paused, closed or foreign owner refuses ' + JSON.stringify(binding), async (t) => {
    const { state, deps } = transport(t);
    state.binding = binding ? { ...state.binding, ...binding } : null;
    await assert.rejects(runHeal({ ...apply, deps }), /current-owner-binding/);
    assert.equal(state.writes, 0);
  });
test('source drift after archive refuses without publication', async (t) => {
  const { state, deps, source } = transport(t);
  deps.readCanonicalTimingSource = async () => {
    if (++state.reads === 2) state.body += '\n';
    return source();
  };
  await assert.rejects(runHeal({ ...apply, deps }), /source-drift/);
  assert.equal(state.writes, 0);
});
test('owner lost after archive refuses without publication', async (t) => {
  const { state, deps } = transport(t);
  let calls = 0;
  deps.getActiveTask = () => (++calls === 1 ? state.binding : null);
  await assert.rejects(runHeal({ ...apply, deps }), /current-owner-binding/);
  assert.equal(state.writes, 0);
});
test('ambiguous successful write is accepted by exact canonical read-back once', async (t) => {
  const { state, deps } = transport(t);
  deps.updateTimingComment = async (_id, _repo, candidate) => {
    state.writes++;
    state.body = candidate;
    throw Error('lost response');
  };
  assert.equal((await runHeal({ ...apply, deps })).status, 'healed-after-ambiguous-write');
  assert.equal(state.writes, 1);
});
test('failed write stays refused after read-back and is never retried', async (t) => {
  const { state, deps } = transport(t);
  deps.updateTimingComment = async () => {
    state.writes++;
    throw Error('failed');
  };
  await assert.rejects(runHeal({ ...apply, deps }), /readback/);
  assert.equal(state.writes, 1);
});
test('foreign issue authority and missing lifecycle markers refuse without publication', async (t) => {
  for (const change of [
    { number: 2056 },
    { repository_url: 'https://api.github.com/repos/other/repo' },
    { body: '' },
  ]) {
    const { state, deps } = transport(t);
    const read = deps.readRecoveryIssue;
    deps.readRecoveryIssue = async () => ({ ...(await read()), ...change });
    await assert.rejects(runHeal({ ...apply, deps }), /canonical-issue|invalid-candidate/);
    assert.equal(state.writes, 0);
  }
});

import { timingActorKey } from '../../../task-tracker/lib/timing-actor.mjs';
test('active operator opener refuses until a genuine update-style engagement seals it, without pausing binding', async (t) => {
  const { state, deps } = transport(t);
  const key = timingActorKey({ provider: 'codex', sid: '2082-test-operator' }).slice(3);
  const startMs = Date.parse('2026-10-21T17:58:00Z');
  const endMs = Date.parse('2026-10-21T17:59:00Z');
  const opener = `| 2026-10-21 17:58:00 +00:00 | resumed |  |  | 0 | 10 | operator | 100 | <!-- aitm-actor:v1 key=${key} -->`;
  state.body = original + opener + '\n';
  await assert.rejects(
    runHeal({ ...apply, expectedSourceSha: sha(state.body), deps }),
    /invalid-candidate/
  );
  assert.equal(state.writes, 0);
  // Hand-authored stored native update evidence: one observed minute, activity Unknown.
  const update = `| 2026-10-21 17:59:00 +00:00 | update | Unknown | Unknown | 2 | 12 | checkpoint | 102 | <!-- aitm-actor:v1 key=${key} --> <!-- aitm-engagement:v1 start=${startMs} end=${endMs} active=unknown wstart=10 wend=12 fstart=100 fend=102 -->`;
  state.body += update + '\n';
  state.binding.entryStartTs = new Date(endMs).toISOString();
  const checkpointed = state.body;
  const result = await runHeal({ ...apply, expectedSourceSha: sha(checkpointed), deps });
  assert.equal(result.status, 'healed');
  assert.equal(state.writes, 1);
  assert.ok(state.body.includes(opener + '\n' + update + '\n'));
  assert.deepEqual(result.accounting.incompleteActors, []);
  assert.equal(state.binding.entryStartTs, '2026-10-21T17:59:00.000Z');
});
