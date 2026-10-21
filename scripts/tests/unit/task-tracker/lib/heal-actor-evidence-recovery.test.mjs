// @story #2026
// cspell:ignore BCLA
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runHeal } from '../../../../task-tracker/heal-timing-log.mjs';
const issueBody = ['refine', 'ready-for-plan', 'plan', 'develop', 'test', 'review']
  .map((stage) => `<!-- aitm-entered-${stage} ts="2026-10-17T12:52:58.000Z" -->`)
  .join('\n');
const readRecoveryIssue = async () => ({
  number: 63,
  repository_url: 'https://api.github.com/repos/kburson/AIVC',
  body: issueBody,
});
const original = JSON.parse(
  readFileSync(new URL('../../../fixtures/2026/aivc-63-timing.json', import.meta.url), 'utf8')
).body;
const options = {
  issueNumber: 63,
  repo: 'kburson/AIVC',
  actorEvidenceRecovery: 'aivc-63-2026-10-17',
};
const commentNodeId = 'IC_kwDOVGnu1M8AAAABc5SfIA';
test('reviewed historical profile identifies one Unknown insertion without rewriting or publishing source', async () => {
  const writes = [];
  const result = await runHeal({
    ...options,
    deps: {
      readRecoveryIssue,
      findTimingComment: async () => ({ id: commentNodeId, body: original }),
      readCanonicalTimingSource: async () => ({
        status: 'found',
        source: { repository: options.repo, issue: 63, commentNodeId, body: original },
      }),
      updateTimingComment: async (...args) => writes.push(args),
      now: () => Date.parse('2026-10-19T00:00:00Z'),
    },
  });
  assert.equal(result.inserted, 1);
  assert.equal(result.status, 'dry-run');
  assert.equal(writes.length, 0);
});
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import { deriveActorEngagement } from '../../../../task-tracker/lib/timing-engagement.mjs';
import { validate } from '../../../../task-tracker/lib/agent-review/validators/timing-log-sequence.mjs';
import { main } from '../../../../task-tracker/heal-timing-log.mjs';
import { getActiveTask, setActiveTask } from '../../../../task-tracker/session-state.mjs';
const hash = (body) => createHash('sha256').update(body).digest('hex');
const now = Date.parse('2026-10-19T00:00:00Z');
function transport(t, body = original) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'actor-evidence-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const state = {
    body,
    writes: [],
    reads: 0,
    binding: { issue: '#63', entryStartTs: new Date(now - 1000).toISOString(), worktreePath: dir },
  };
  const source = () => ({
    status: 'found',
    source: { repository: options.repo, issue: 63, commentNodeId, body: state.body },
  });
  const deps = {
    readRecoveryIssue,
    getProjectDir: () => dir,
    now: () => now,
    currentSessionId: () => 'authenticated-test-operator',
    aiAppName: () => 'codex',
    getActiveTask: () => state.binding,
    readCanonicalTimingSource: async () => {
      state.reads++;
      return source();
    },
    updateTimingComment: async (id, repo, body) => {
      state.writes.push({ id, repo, body });
      state.body = body;
    },
  };
  return { state, deps, source, dir };
}
const apply = {
  ...options,
  apply: true,
  expectedSourceSha: hash(original),
  expectedCommentId: commentNodeId,
};
const markers = {
  enteredStages: ['refine', 'ready-for-plan', 'plan', 'develop', 'test', 'review'].map((stage) => ({
    stage,
  })),
};
test('apply retains every original byte and Unknown contribution, audits exact source and passes unchanged validators', async (t) => {
  const { state, deps } = transport(t);
  assert.equal(validate({ comments: [{ body: original }], markers }).pass, false);
  const result = await runHeal({ ...apply, deps });
  assert.equal(result.status, 'healed');
  const added = state.body.split('\n').filter((line) => !original.split('\n').includes(line));
  assert.equal(added.length, 1);
  assert.equal(state.body.replace(added[0] + '\n', ''), original);
  const row = parseTimingRow(added[0]);
  assert.equal(row.event, 'session-end-recovery');
  assert.equal(row.ts, '2026-10-17 07:51:35 -05:00');
  assert.equal(row.cells[3], 'Unknown');
  assert.equal(row.cells[4], 'Unknown');
  assert.equal(row.cells[5], '0');
  assert.equal(row.cells[6], '10,977');
  assert.equal(row.cells[8], '374,099');
  const parsed = state.body
    .split('\n')
    .map(parseTimingRow)
    .filter((row) => row?.actorKey);
  const accounting = deriveActorEngagement(parsed, now);
  assert.deepEqual(accounting.failures, []);
  assert.deepEqual(accounting.incompleteActors, []);
  assert.equal(accounting.complete, false);
  assert.equal(accounting.unknownRows, 1);
  assert.equal(validate({ comments: [{ body: state.body }], markers }).pass, true);
  assert.equal(readFileSync(path.join(result.evidenceDir, 'before.md'), 'utf8'), original);
  assert.equal(readFileSync(path.join(result.evidenceDir, 'candidate.md'), 'utf8'), state.body);
  const audit = JSON.parse(readFileSync(path.join(result.evidenceDir, 'manifest.json'), 'utf8'));
  assert.equal(audit.sourceSha, hash(original));
  assert.equal(audit.candidateSha, hash(state.body));
  assert.match(audit.operatorActor, /^v1:[a-f0-9]{64}$/);
  assert.equal(state.writes.length, 1);
  assert.equal((await runHeal({ ...options, deps })).status, 'already-canonical');
  assert.equal(state.writes.length, 1);
});
for (const [name, from, to] of [
  ['timestamp', '07:50:28', '07:50:29'],
  ['actor', 'key=145e955d', 'key=245e955d'],
  ['endpoint', 'start=1792241495021', 'start=1792241495022'],
  ['words', '| 47 | 11,024 |', '| 48 | 11,024 |'],
  ['Unknown value', '| Unknown | Unknown |', '| 0 | Unknown |'],
])
  test(`altered historical ${name} refuses before any write`, async (t) => {
    const { state, deps } = transport(t, original.replace(from, to));
    await assert.rejects(
      runHeal({ ...apply, expectedSourceSha: hash(state.body), deps }),
      /historical-source-mismatch/
    );
    assert.equal(state.writes.length, 0);
  });
for (const extra of [
  { repo: 'other/repo' },
  { issueNumber: 64 },
  { actorEvidenceRecovery: 'invented-profile' },
])
  test(`wrong profile tuple ${JSON.stringify(extra)} refuses`, async (t) => {
    const { state, deps } = transport(t);
    await assert.rejects(
      runHeal({ ...options, ...extra, deps }),
      /profile-identity|canonical-source/
    );
    assert.equal(state.writes.length, 0);
  });
for (const extra of [{ expectedSourceSha: '0'.repeat(64) }, { expectedCommentId: 'IC_stale' }])
  test('stale dry-run identity refuses without publication', async (t) => {
    const { state, deps } = transport(t);
    await assert.rejects(runHeal({ ...apply, ...extra, deps }), /dry-run-identity-mismatch/);
    assert.equal(state.writes.length, 0);
  });
for (const binding of [
  null,
  { issue: 64 },
  { issue: 63, entryStartTs: null },
  { issue: 63, entryStartTs: '' },
  { issue: 63, entryStartTs: 'invalid' },
  { issue: 63, entryStartTs: now },
  { issue: 63, entryStartTs: new Date(now - 1000).toISOString(), closedAt: 'closed' },
])
  test(`unbound, paused, wrong or closed operator refuses ${JSON.stringify(binding)}`, async (t) => {
    const { state, deps } = transport(t);
    state.binding = binding == null ? null : { ...state.binding, ...binding };
    await assert.rejects(runHeal({ ...apply, deps }), /current-owner-binding/);
    assert.equal(state.writes.length, 0);
  });
test('source drift after immutable archive refuses without a remote write', async (t) => {
  const { state, deps, source } = transport(t);
  deps.readCanonicalTimingSource = async () => {
    if (++state.reads === 2) state.body += '\n';
    return source();
  };
  await assert.rejects(runHeal({ ...apply, deps }), /source-drift/);
  assert.equal(state.writes.length, 0);
});
test('canonical repository, issue and comment correlation are not caller assertions', async (t) => {
  for (const field of ['repository', 'issue', 'commentNodeId']) {
    const { state, deps, source } = transport(t);
    deps.readCanonicalTimingSource = async () => {
      const observed = source();
      observed.source[field] = field === 'issue' ? 64 : 'wrong';
      return observed;
    };
    await assert.rejects(runHeal({ ...apply, deps }), /canonical-source/);
    assert.equal(state.writes.length, 0);
  }
});
test('ambiguous successful write is accepted only by exact canonical read-back', async (t) => {
  const { state, deps } = transport(t);
  deps.updateTimingComment = async (_id, _repo, candidate) => {
    state.body = candidate;
    throw new Error('response lost');
  };
  assert.equal((await runHeal({ ...apply, deps })).status, 'healed-after-ambiguous-write');
});
test('failed or altered read-back remains a refusal', async (t) => {
  const { deps } = transport(t);
  deps.updateTimingComment = async () => {
    throw new Error('write failed');
  };
  await assert.rejects(runHeal({ ...apply, deps }), /readback/);
});
const appended =
  '| 2026-10-18 00:01:00 +00:00 | update | Unknown | Unknown | 1 | 15,136 | later observed span | 555,358 | <!-- aitm-actor:v1 key=145e955d61862b8a64d1117f874ca2536480777b62d9ec2b1b3b06d01ad4fa17 --> <!-- aitm-engagement:v1 start=1792281365626 end=1792281660000 active=unknown wstart=15135 wend=15136 fstart=555357 fend=555358 -->';
test('valid appended evidence is preserved without changing the reviewed historical prefix', async (t) => {
  const body = original.trimEnd() + '\n' + appended + '\n';
  const { state, deps } = transport(t, body);
  assert.equal((await runHeal({ ...apply, expectedSourceSha: hash(body), deps })).status, 'healed');
  assert.ok(state.body.includes(appended));
});
test('conflicting appended engagement cannot use the historical recovery as a waiver', async (t) => {
  const body =
    original.trimEnd() +
    '\n' +
    appended.replace('start=1792281365626', 'start=1792281365625') +
    '\n';
  const { state, deps } = transport(t, body);
  await assert.rejects(
    runHeal({ ...apply, expectedSourceSha: hash(body), deps }),
    /conflicting-evidence/
  );
  assert.equal(state.writes.length, 0);
});
test('registered CLI serializes the reviewed mode under the existing issue lock', async (t) => {
  const { deps, state } = transport(t);
  let locks = 0;
  const output = [];
  const exits = [];
  await main(['63', '--actor-evidence-recovery', options.actorEvidenceRecovery], {
    ...deps,
    loadConfig: async () => ({ repo: options.repo }),
    withLock: async (_path, action) => {
      locks++;
      return action();
    },
    out: { write: (text) => output.push(text) },
    err: { write: (text) => output.push(text) },
    exit: (code) => exits.push(code),
  });
  assert.equal(locks, 1);
  assert.equal(state.writes.length, 0);
  assert.equal(JSON.parse(output.join('')).inserted, 1);
});
test('invalid mode combinations refuse before configuration or remote access', async () => {
  for (const args of [
    ['--sweep'],
    ['--actor-opener-replays'],
    ['--continuity-session', 'sid'],
    ['--rebaseline-session', 'sid'],
    ['--expected-transcript-sha', '0'.repeat(64)],
    ['--apply'],
  ]) {
    const exits = [];
    await main(['63', '--actor-evidence-recovery', options.actorEvidenceRecovery, ...args], {
      loadConfig: () => {
        throw new Error('unexpected access');
      },
      err: { write() {} },
      exit: (code) => exits.push(code),
    });
    assert.deepEqual(exits, [2]);
  }
});

// A normal timing grammar failure must not be laundered by the historical profile.
test('unknown appended event refuses through the unchanged timing validator', async (t) => {
  const body =
    original.trimEnd() + '\n' + appended.replace('| update |', '| made-up-event |') + '\n';
  const { state, deps } = transport(t, body);
  await assert.rejects(
    runHeal({ ...apply, expectedSourceSha: hash(body), deps }),
    /invalid-candidate/
  );
  assert.equal(state.writes.length, 0);
});
import { parseTimingRows, rollupTotals } from '../../../../task-tracker/timing-rollup.mjs';
import { timingFieldProjection } from '../../../../gh/log-issue-time.mjs';
test('recovered original projects all timing fields Unknown with no finite total fabrication', async (t) => {
  const { state, deps } = transport(t);
  await runHeal({ ...apply, deps });
  const projection = timingFieldProjection(
    rollupTotals(parseTimingRows(state.body), 5, state.body)
  );
  assert.deepEqual(projection.values, {
    engagedTime: null,
    sessionTime: null,
    reviewTime: null,
    planTime: null,
  });
});
test('missing or stale lifecycle authority refuses before publication', async (t) => {
  const { state, deps } = transport(t);
  deps.readRecoveryIssue = async () => ({
    number: 63,
    repository_url: 'https://api.github.com/repos/kburson/AIVC',
    body: '',
  });
  await assert.rejects(runHeal({ ...apply, deps }), /invalid-candidate/);
  assert.equal(state.writes.length, 0);
});
test('foreign issue authority refuses even with an otherwise valid canonical timing comment', async (t) => {
  const { state, deps } = transport(t);
  deps.readRecoveryIssue = async () => ({
    number: 64,
    repository_url: 'https://api.github.com/repos/kburson/AIVC',
    body: issueBody,
  });
  await assert.rejects(runHeal({ ...apply, deps }), /canonical-issue/);
  assert.equal(state.writes.length, 0);
});
test('changed ownership before write retains the archive but refuses publication', async (t) => {
  const { state, deps } = transport(t);
  let ownerReads = 0;
  deps.getActiveTask = () => (++ownerReads === 1 ? state.binding : null);
  await assert.rejects(runHeal({ ...apply, deps }), /current-owner-binding/);
  assert.equal(state.writes.length, 0);
});
for (const suffix of [appended, appended.replace('| update |', '| made-up-event |')]) {
  test('blank-separated appended rows cannot escape the canonical table validator', async (t) => {
    const body = original.trimEnd() + '\n\n' + suffix + '\n';
    const { state, deps } = transport(t, body);
    await assert.rejects(
      runHeal({ ...apply, expectedSourceSha: hash(body), deps }),
      /invalid-candidate/
    );
    assert.equal(state.writes.length, 0);
  });
}

test('native persisted owner binding with ISO entry timestamp authorizes the exact audited apply', async (t) => {
  const { state, deps, dir } = transport(t);
  setActiveTask('authenticated-test-operator', state.binding, dir);
  deps.getActiveTask = getActiveTask;
  const result = await runHeal({ ...apply, deps });
  assert.equal(result.status, 'healed');
  assert.equal(state.writes.length, 1);
  assert.equal(readFileSync(path.join(result.evidenceDir, 'before.md'), 'utf8'), original);
});

// @story #2082 — refusing invented endpoints must not prevent an honest Unknown seal.
import { planActorEvidenceRecovery } from '../../../../task-tracker/lib/heal-actor-evidence-recovery.mjs';
const orphanSource = JSON.parse(
  readFileSync(new URL('../../../fixtures/2026/aitm-2055-timing.json', import.meta.url), 'utf8')
).body;
const orphanActor = 'v1:e9361861aa5dfcb8f1597712f0524b6f6732246461222762796690e45fd35bcd';
const orphanOptions = {
  profile: 'aitm-2055-2026-10-21',
  repo: 'kburson/ai-task-manager',
  issueNumber: 2055,
  commentId: 'IC_kwDOSU6LgM8AAAABdrBCLA',
  now: Date.parse('2026-10-21T18:00:00.123Z'),
};
const orphanPlan = (body = orphanSource, extra = {}) =>
  planActorEvidenceRecovery(body, { ...orphanOptions, ...extra });
test('2055 recovery records actual observation time and preserves all original bytes and Unknown', () => {
  const result = orphanPlan();
  const added = result.candidate.split('\n').filter((x) => !orphanSource.split('\n').includes(x));
  assert.equal(added.length, 1);
  assert.equal(result.candidate.replace(added[0] + '\n', ''), orphanSource);
  const row = parseTimingRow(added[0]);
  assert.equal(row.ts, '2026-10-21 18:00:00 +00:00');
  assert.equal(row.actorKey, orphanActor);
  assert.equal(row.event, 'session-end-recovery');
  assert.deepEqual(row.cells.slice(3, 7), ['Unknown', 'Unknown', '0', '159']);
  assert.equal(row.cells[8], '19,562');
  assert.equal(row.engagement, undefined);
  const before = deriveActorEngagement(
    orphanSource
      .split('\n')
      .map(parseTimingRow)
      .filter((x) => x?.actorKey),
    orphanOptions.now
  );
  assert.equal(result.accounting.engagedMs, before.engagedMs);
  assert.deepEqual(result.accounting.incompleteActors, []);
  assert.equal(result.accounting.unknownRows, 2); // retained unattributed history plus orphan recovery
  assert.equal(result.accounting.complete, false);
});
for (const extra of [
  { repo: 'other/repo' },
  { issueNumber: 2056 },
  { commentId: 'IC_wrong' },
  { profile: 'other' },
])
  test(`2055 wrong immutable identity refuses ${JSON.stringify(extra)}`, () => {
    assert.throws(() => orphanPlan(orphanSource, extra), /profile-identity/);
  });
for (const [from, to] of [
  ['09:40:43', '09:40:44'],
  ['key=e9361861', 'key=f9361861'],
  ['| 159 | agent |', '| 160 | agent |'],
])
  test(`2055 modified historical prefix refuses ${from}`, () => {
    assert.throws(() => orphanPlan(orphanSource.replace(from, to)), /historical-source-mismatch/);
  });
for (const value of [
  NaN,
  Infinity,
  -1,
  '2026-10-21T18:00:00Z',
  orphanOptions.now + 0.5,
  Date.parse('2026-10-21T15:00:00Z'),
])
  test(`2055 invalid or retroactive recording clock refuses ${value}`, () => {
    assert.throws(() => orphanPlan(orphanSource, { now: value }), /recording-time/);
  });
test('2055 exact canonical recovery is idempotent even after a later native append', () => {
  const first = orphanPlan();
  const append =
    '| 2026-10-21 18:01:00 +00:00 | update |  |  | 0 | 4,147 | later native checkpoint | 129,965 |';
  const body = first.candidate + append + '\n';
  const second = orphanPlan(body, { now: Date.parse('2026-10-21T19:00:00Z') });
  assert.equal(second.candidate, body);
  assert.equal(second.inserted, 0);
  const row = first.candidate.split('\n').find((x) => x.includes('session-end-recovery'));
  assert.throws(() => orphanPlan(first.candidate + row + '\n'), /duplicate-recovery/);
  assert.throws(
    () => orphanPlan(first.candidate.replace('| 0 | 159 |', '| 1 | 159 |')),
    /conflicting-recovery/
  );
});
test('2055 conflicting later target evidence cannot be hidden by a recovery', () => {
  const row =
    '| 2026-10-21 17:00:00 +00:00 | pause | Unknown | Unknown | 0 | 159 | new target evidence | 19,562 | <!-- aitm-actor:v1 key=e9361861aa5dfcb8f1597712f0524b6f6732246461222762796690e45fd35bcd -->';
  assert.throws(() => orphanPlan(orphanSource + row + '\n'), /conflicting-evidence/);
});
