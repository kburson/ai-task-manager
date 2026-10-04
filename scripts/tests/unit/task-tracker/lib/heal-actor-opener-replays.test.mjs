// @story #1876
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { buildRow } from '../../../../task-tracker/gh-timing-comment.mjs';
import { buildInitialComment } from '../../../../task-tracker/gh-timing-comment.internals.mjs';
import { timingActorKey } from '../../../../task-tracker/lib/timing-actor.mjs';
import { replaceTimingRowCell } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { runHeal, main } from '../../../../task-tracker/heal-timing-log.mjs';

const key = timingActorKey({ provider: 'codex', sid: 'retained-original' });
const other = timingActorKey({ provider: 'claude', sid: 'independent-original' });
const now = Math.floor(Date.now() / 1000) * 1000;
const row = (event, ts, actorKey = key, extra = {}) =>
  buildRow({
    event,
    ts,
    actorKey,
    deltaWords: 0,
    activeSec: 0,
    idleSec: 0,
    wordMarker: 50,
    fullWordMarker: 500,
    description: event,
    ...extra,
  });
const original = row('start', now - 5000, key, { deltaWords: 12 });
const duplicate = replaceTimingRowCell(original, 5, ' 0 ');
const tail = [
  row('start', now - 4000, other),
  row('pause:blocked', now - 3000),
  row('pause:blocked', now - 1000, other),
];
const clean = buildInitialComment() + '\n' + [original, ...tail].join('\n') + '\n';
const noisy = buildInitialComment() + '\n' + [original, duplicate, ...tail].join('\n') + '\n';
const hash = (body) => createHash('sha256').update(body).digest('hex');
function transport(body = noisy, t) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'actor-replay-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const state = { body, writes: [], reads: 0 };
  return {
    state,
    deps: {
      getProjectDir: () => dir,
      findTimingComment: async () => ({ id: 'IC_original', body: state.body }),
      readCanonicalTimingSource: async (t) => {
        state.reads++;
        return {
          status: 'found',
          source: {
            repository: 'owner/repo',
            issue: 1876,
            commentNodeId: 'IC_original',
            body: state.body,
          },
        };
      },
      updateTimingComment: async (id, repo, body) => {
        state.writes.push({ id, repo, body });
        state.body = body;
      },
      now: () => now,
    },
  };
}
const options = { issueNumber: 1876, repo: 'owner/repo', actorOpenerReplays: true };
const apply = {
  ...options,
  apply: true,
  expectedSourceSha: hash(noisy),
  expectedCommentId: 'IC_original',
};

test('actor replay dry-run identifies the original source and preserves all remote evidence', async (t) => {
  const { state, deps } = transport(noisy, t);
  const result = await runHeal({ ...options, deps });
  assert.equal(result.status, 'dry-run');
  assert.equal(result.removed, 1);
  assert.equal(result.sourceSha, hash(noisy));
  assert.equal(result.candidateSha, hash(clean));
  assert.equal(result.commentId, 'IC_original');
  assert.equal(state.body, noisy);
  assert.equal(state.writes.length, 0);
});

test('apply archives exact before evidence and retains original intervals and cursors', async (t) => {
  const { state, deps } = transport(noisy, t);
  const result = await runHeal({ ...apply, deps });
  try {
    assert.equal(result.status, 'healed');
    assert.equal(state.body, clean);
    assert.deepEqual(state.writes, [{ id: 'IC_original', repo: 'owner/repo', body: clean }]);
    assert.ok(state.reads >= 3, 'includes pre-write observation and exact read-back');
    assert.equal(readFileSync(path.join(result.evidenceDir, 'before.md'), 'utf8'), noisy);
    assert.equal(readFileSync(path.join(result.evidenceDir, 'candidate.md'), 'utf8'), clean);
    const manifest = JSON.parse(
      readFileSync(path.join(result.evidenceDir, 'manifest.json'), 'utf8')
    );
    assert.equal(manifest.sourceSha, hash(noisy));
    assert.equal(manifest.candidateSha, hash(clean));
    assert.equal(manifest.repository, 'owner/repo');
    assert.equal(manifest.issue, 1876);
    assert.equal(manifest.commentId, 'IC_original');
    assert.equal(manifest.removals[0].retainedLine, manifest.removals[0].removedLine - 1);
    assert.equal(manifest.accounting.engagedMs, 5000);
    assert.equal(manifest.accounting.intervals.length, 2);
    assert.deepEqual(manifest.accounting.incompleteActors, []);
    assert.equal(manifest.accounting.unknownRows, 0);
  } finally {
    if (result.evidenceDir) rmSync(result.evidenceDir, { recursive: true, force: true });
  }
});

for (const [label, changed] of [
  ['word cursor', replaceTimingRowCell(duplicate, 6, ' 51 ')],
  ['full word cursor', replaceTimingRowCell(duplicate, 8, ' 501 ')],
  ['description', replaceTimingRowCell(duplicate, 7, ' changed description ')],
  ['duration', replaceTimingRowCell(duplicate, 3, ' 1s ')],
  ['row marker', duplicate.replace('a=0', 'a=1')],
  ['contributing delta', replaceTimingRowCell(duplicate, 5, ' 1 ')],
]) {
  test('conflicting opener refuses without remote writes: ' + label, async (t) => {
    const body = buildInitialComment() + '\n' + [original, changed, ...tail].join('\n') + '\n';
    const { state, deps } = transport(body, t);
    await assert.rejects(runHeal({ ...options, deps }), /actor-replay/);
    assert.equal(state.body, body);
    assert.equal(state.writes.length, 0);
  });
}

test('apply requires the dry-run source hash and canonical comment identity', async (t) => {
  for (const extra of [
    {},
    { expectedSourceSha: hash(noisy) },
    { expectedSourceSha: hash(clean), expectedCommentId: 'IC_original' },
    { expectedSourceSha: hash(noisy), expectedCommentId: 'IC_changed' },
  ]) {
    const { state, deps } = transport(noisy, t);
    await assert.rejects(runHeal({ ...options, apply: true, ...extra, deps }), /actor-replay/);
    assert.equal(state.writes.length, 0);
  }
});

test('source drift refuses before mutation and unobserved publication cannot report healed', async (t) => {
  const drift = transport(noisy, t);
  const read = drift.deps.readCanonicalTimingSource;
  drift.deps.readCanonicalTimingSource = async (t) => {
    if (drift.state.reads === 1) drift.state.body += 'changed remote evidence\n';
    return read();
  };
  await assert.rejects(runHeal({ ...apply, deps: drift.deps }), /actor-replay:source-drift/);
  assert.equal(drift.state.writes.length, 0);
  const missing = transport(noisy, t);
  missing.deps.updateTimingComment = async (t) => {};
  await assert.rejects(runHeal({ ...apply, deps: missing.deps }), /actor-replay:readback/);
});

test('actor replay CLI accepts dry-run mode and forbids a sweep before configuration reads', async (t) => {
  let loaded = false;
  let code;
  const chunks = [];
  await main(['--sweep', '--actor-opener-replays'], {
    loadConfig: async (t) => {
      loaded = true;
      return { repo: 'owner/repo' };
    },
    out: { write: (text) => chunks.push(text) },
    err: { write: (text) => chunks.push(text) },
    exit: (value) => {
      code = value;
    },
  });
  assert.equal(code, 2);
  assert.equal(loaded, false);
  assert.match(chunks.join(''), /actor.*per.issue/);
});

test('recovery keeps later resumed intervals and all unremoved bytes', async (t) => {
  const resumed = row('resumed', now - 2000);
  const resumeCopy = replaceTimingRowCell(resumed, 5, ' — ');
  const end = row('pause:blocked', now);
  const preserved = clean + resumed + '\n' + end + '\n';
  const body = noisy + resumed + '\n' + resumeCopy + '\n' + end + '\n';
  const { state, deps } = transport(body, t);
  const result = await runHeal({
    ...options,
    apply: true,
    expectedSourceSha: hash(body),
    expectedCommentId: 'IC_original',
    deps,
  });
  assert.equal(result.removed, 2);
  assert.equal(state.body, preserved);
  assert.equal(result.accounting.engagedMs, 7000);
  const again = await runHeal({ ...options, deps });
  assert.equal(again.status, 'already-canonical');
  assert.equal(state.writes.length, 1);
});

test('ambiguous or mismatched canonical source refuses without a write', async (t) => {
  for (const source of [
    { status: 'error', error: new Error('incomplete census') },
    {
      status: 'found',
      source: { repository: 'other/repo', issue: 1876, commentNodeId: 'IC_original', body: noisy },
    },
    {
      status: 'found',
      source: { repository: 'owner/repo', issue: 1877, commentNodeId: 'IC_original', body: noisy },
    },
  ]) {
    const { state, deps } = transport(noisy, t);
    deps.readCanonicalTimingSource = async () => source;
    await assert.rejects(runHeal({ ...apply, deps }), /actor-replay:canonical-source/);
    assert.equal(state.writes.length, 0);
  }
});

test('a genuine opener with explicit interval evidence refuses recovery', async (t) => {
  const attributed = row('start', now - 5000, key, {
    engagement: {
      startMs: now - 6000,
      endMs: now - 5000,
      wordStart: 40,
      wordEnd: 50,
      fullWordStart: 400,
      fullWordEnd: 500,
      activeEstimateSec: null,
    },
  });
  const body = buildInitialComment() + '\n' + attributed + '\n';
  const { state, deps } = transport(body, t);
  await assert.rejects(runHeal({ ...options, deps }), /actor-replay:ambiguous-opener/);
  assert.equal(state.writes.length, 0);
});

test('the per-issue CLI executes the real recovery under its timing lock', async (t) => {
  const { state, deps } = transport(noisy, t);
  const output = [];
  const locks = [];
  await main(['1876', '--actor-opener-replays'], {
    ...deps,
    loadConfig: async () => ({ repo: 'owner/repo' }),
    withLock: async (file, fn) => {
      locks.push(file);
      return fn();
    },
    out: { write: (value) => output.push(value) },
    err: { write: (value) => assert.fail(value) },
  });
  const result = JSON.parse(output.join(''));
  assert.equal(result.status, 'dry-run');
  assert.equal(result.sourceSha, hash(noisy));
  assert.equal(state.writes.length, 0);
  assert.equal(locks.length, 1);
  assert.match(locks[0], /1876/);
});
