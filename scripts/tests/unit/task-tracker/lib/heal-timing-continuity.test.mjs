// @story #1926
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { runHeal } from '../../../../task-tracker/heal-timing-log.mjs';
import { buildRow, fmtTs } from '../../../../task-tracker/gh-timing-comment.mjs';
import { buildInitialComment } from '../../../../task-tracker/gh-timing-comment.internals.mjs';
import {
  timingActorKey,
  timingActorMarker,
  timingEngagementMarker,
} from '../../../../task-tracker/lib/timing-actor.mjs';
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import { deriveActorEngagement } from '../../../../task-tracker/lib/timing-engagement.mjs';
import { validate } from '../../../../task-tracker/lib/agent-review/validators/timing-log-sequence.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const sessionId = 'continuous-original';
const actorKey = timingActorKey({ provider: 'codex', sid: sessionId });
const start = Date.parse('2026-08-01T00:00:00Z');
const end = start + 9 * 3600_000;
const now = end + 60_000;
const hash = (text) => createHash('sha256').update(text).digest('hex');
const row = (ms, evidence) =>
  `| ${fmtTs(ms, { offsetMin: 0 })} | update | Unknown | Unknown |  | 50 | actual checkpoint | 500 |${timingActorMarker(actorKey)}${timingEngagementMarker(evidence)}`;
const evidence = (begin, stop) => ({
  startMs: begin,
  endMs: stop,
  activeEstimateSec: null,
  wordStart: 50,
  wordEnd: 50,
  fullWordStart: 500,
  fullWordEnd: 500,
});
const originals = [row(start, evidence(start - 1000, start)), row(end, evidence(start, end))];
const body = buildInitialComment() + '\n' + originals.join('\n') + '\n';
const event = (ms, type, payload) =>
  JSON.stringify({ timestamp: new Date(ms).toISOString(), type, payload });
const transcript =
  [
    event(start - 2000, 'session_meta', { id: sessionId, cwd: '/actual/workspace' }),
    ...Array.from({ length: 109 }, (_, i) =>
      event(start + i * 300_000, 'response_item', {
        type: i % 2 ? 'function_call' : 'custom_tool_call',
        call_id: 'call-' + i,
        name: 'exec',
        arguments: '{}',
      })
    ),
    event(end + 1000, 'event_msg', { type: 'token_count' }),
  ].join('\n') + '\n';
const options = { issueNumber: 1926, repo: 'owner/repo', continuitySession: sessionId };
function transport(t, text = transcript) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'continuity-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const state = { body, transcript: text, writes: [], reads: 0 };
  return {
    state,
    deps: {
      getProjectDir: () => dir,
      now: () => now,
      readContinuityTranscript: async () => ({
        path: '/native/rollout-' + sessionId + '.jsonl',
        text: state.transcript,
      }),
      readCanonicalTimingSource: async () => {
        state.reads++;
        return {
          status: 'found',
          source: {
            repository: 'owner/repo',
            issue: 1926,
            commentNodeId: 'IC_actual',
            body: state.body,
          },
        };
      },
      findTimingComment: async () => ({ id: 'IC_actual', body: state.body }),
      updateTimingComment: async (id, repo, next) => {
        state.writes.push({ id, repo, body: next });
        state.body = next;
      },
    },
  };
}
const rows = (text) =>
  text
    .split('\n')
    .map(parseTimingRow)
    .filter((r) => r?.actorKey);
const grade = (text) => validate({ comments: [{ body: text }] });
const applyIdentity = (dry) => ({
  apply: true,
  expectedSourceSha: dry.sourceSha,
  expectedCommentId: dry.commentId,
  expectedTranscriptSha: dry.transcriptSha,
});

test('continuous nine-hour session is repaired without changing original rows or actor accounting', async (t) => {
  // Missing neutral recovery must leave the actual eight-hour validator red.
  const { state, deps } = transport(t);
  assert.match(grade(body).failures.join('\n'), /suspicious wall-clock gap/);
  const dry = await runHeal({ ...options, deps });
  assert.equal(dry.status, 'dry-run');
  assert.ok(dry.inserted > 0);
  assert.equal(dry.sourceSha, hash(body));
  assert.equal(state.writes.length, 0);
  const healed = await runHeal({ ...options, ...applyIdentity(dry), deps });
  assert.equal(healed.status, 'healed');
  assert.deepEqual(grade(state.body), { pass: true, failures: [] });
  assert.ok(originals.every((line) => state.body.split('\n').includes(line)));
  assert.deepEqual(
    deriveActorEngagement(rows(state.body), now),
    deriveActorEngagement(rows(body), now)
  );
  for (const added of rows(state.body).filter((r) => !originals.includes(r.raw))) {
    assert.equal(added.event, 'update');
    assert.equal(added.cells[3], 'Unknown');
    assert.equal(added.cells[4], 'Unknown');
    assert.ok(['', '0'].includes(added.cells[5]));
    assert.equal(added.wordMarker, '50');
    assert.equal(added.fullWordMarker, '500');
    assert.equal(added.engagement, undefined);
  }
  assert.equal(readFileSync(path.join(healed.evidenceDir, 'before.md'), 'utf8'), body);
  assert.equal(readFileSync(path.join(healed.evidenceDir, 'candidate.md'), 'utf8'), state.body);
  assert.equal(
    JSON.parse(readFileSync(path.join(healed.evidenceDir, 'manifest.json'), 'utf8')).transcriptSha,
    dry.transcriptSha
  );
  const repeat = await runHeal({ ...options, deps });
  assert.equal(repeat.status, 'already-canonical');
  assert.equal(state.writes.length, 1);
});

for (const [name, change] of [
  ['wrong session', (s) => s.replace('"id":"continuous-original"', '"id":"foreign"')],
  ['duplicate metadata', (s) => s + event(end + 2000, 'session_meta', { id: sessionId }) + '\n'],
  [
    'unexplained gap',
    (s) =>
      s
        .split('\n')
        .filter(
          (l) =>
            !l.includes('call-5"') &&
            !l.includes('call-6"') &&
            !l.includes('call-7"') &&
            !l.includes('call-8"')
        )
        .join('\n'),
  ],
  [
    'real terminal',
    (s) =>
      s.replace(
        event(start + 25 * 60_000, 'response_item', {
          type: 'function_call',
          call_id: 'call-5',
          name: 'exec',
          arguments: '{}',
        }),
        event(start + 25 * 60_000, 'event_msg', { type: 'task_complete' })
      ),
  ],
  [
    'user interruption',
    (s) =>
      s.replace(
        '"type":"function_call","call_id":"call-5"',
        '"type":"message","role":"user","call_id":"call-5"'
      ),
  ],
  [
    'non-monotonic',
    (s) =>
      s.replace(
        new Date(start + 25 * 60_000).toISOString(),
        new Date(start + 19 * 60_000).toISOString()
      ),
  ],
  ['malformed timestamp', (s) => s.replace(new Date(start + 25 * 60_000).toISOString(), 'broken')],
  [
    'truncated evidence',
    (s) => s.slice(0, s.lastIndexOf(event(end + 1000, 'event_msg', { type: 'token_count' }))),
  ],
])
  test('continuity recovery refuses ' + name + ' before writing', async (t) => {
    const { state, deps } = transport(t, change(transcript));
    await assert.rejects(runHeal({ ...options, deps }), /timing-continuity/);
    assert.equal(state.writes.length, 0);
    assert.equal(state.body, body);
  });

test('apply requires dry-run source, comment and transcript identities', async (t) => {
  for (const extra of [
    {},
    { expectedSourceSha: hash(body), expectedCommentId: 'IC_actual' },
    {
      expectedSourceSha: '0'.repeat(64),
      expectedCommentId: 'IC_actual',
      expectedTranscriptSha: '0'.repeat(64),
    },
  ]) {
    const { state, deps } = transport(t);
    await assert.rejects(runHeal({ ...options, apply: true, ...extra, deps }), /timing-continuity/);
    assert.equal(state.writes.length, 0);
  }
});

test('canonical source or completed transcript drift refuses before mutation', async (t) => {
  for (const kind of ['source', 'transcript']) {
    const { state, deps } = transport(t);
    const dry = await runHeal({ ...options, deps });
    if (kind === 'source') state.body = body.replace('actual checkpoint', 'changed checkpoint');
    else state.transcript = transcript.replace('"name":"exec"', '"name":"changed"');
    await assert.rejects(runHeal({ ...options, ...applyIdentity(dry), deps }), /timing-continuity/);
    assert.equal(state.writes.length, 0);
  }
});

test('unexplained gaps and general backdating remain forbidden', () => {
  assert.equal(grade(body).pass, false);
  assert.throws(
    () =>
      buildRow({
        ts: start,
        event: 'update',
        actorKey,
        activeSec: 3600,
        idleSec: 0,
        wordMarker: 50,
      }),
    /retroactive timing entries are forbidden/
  );
});

test('concurrent canonical or transcript change is refused under the apply boundary', async (t) => {
  for (const kind of ['source', 'transcript']) {
    const { state, deps } = transport(t);
    const dry = await runHeal({ ...options, deps });
    if (kind === 'source') {
      const read = deps.readCanonicalTimingSource;
      let reads = 0;
      deps.readCanonicalTimingSource = async () => {
        if (++reads === 2) state.body = body + '\nconcurrent edit';
        return read();
      };
    } else {
      const read = deps.readContinuityTranscript;
      let reads = 0;
      deps.readContinuityTranscript = async () => {
        if (++reads === 2)
          state.transcript = transcript.replace('"name":"exec"', '"name":"changed"');
        return read();
      };
    }
    await assert.rejects(runHeal({ ...options, ...applyIdentity(dry), deps }), /timing-continuity/);
    assert.equal(state.writes.length, 0);
  }
});
test('append-only events beyond the completed window preserve the accepted evidence', async (t) => {
  const { state, deps } = transport(t);
  const dry = await runHeal({ ...options, deps });
  state.transcript +=
    event(end + 5000, 'response_item', {
      type: 'custom_tool_call',
      call_id: 'later',
      name: 'exec',
      input: 'later',
    }) + '\n';
  assert.equal((await runHeal({ ...options, ...applyIdentity(dry), deps })).status, 'healed');
});
test('remote readback failure cannot report a healed log', async (t) => {
  const { state, deps } = transport(t);
  const dry = await runHeal({ ...options, deps });
  deps.updateTimingComment = async () => {
    state.writes.push('lost write');
  };
  await assert.rejects(
    runHeal({ ...options, ...applyIdentity(dry), deps }),
    /timing-continuity:readback/
  );
});
test('ambiguous timing actor windows refuse rather than inventing observations', async (t) => {
  const { state, deps } = transport(t);
  state.body = body.replace(' | update |', ' | start |');
  await assert.rejects(runHeal({ ...options, deps }), /timing-continuity/);
  assert.equal(state.writes.length, 0);
});
test('late insertion of historical transcript records cannot escape the pinned prefix', async (t) => {
  const { state, deps } = transport(t);
  state.transcript +=
    event(start + 30 * 60_000, 'response_item', {
      type: 'custom_tool_call',
      call_id: 'historical-insertion',
      name: 'exec',
      input: '{}',
    }) + '\n';
  await assert.rejects(runHeal({ ...options, deps }), /timing-continuity/);
  assert.equal(state.writes.length, 0);
});

test('duplicate tool observation identity refuses an ambiguous evidence window', async (t) => {
  const { state, deps } = transport(t);
  state.transcript = transcript.replace('"call-5"', '"call-4"');
  await assert.rejects(runHeal({ ...options, deps }), /timing-continuity/);
  assert.equal(state.writes.length, 0);
});
test('conflicting repair modes refuse before reading or writing', async (t) => {
  const { state, deps } = transport(t);
  await assert.rejects(
    runHeal({ ...options, actorOpenerReplays: true, deps }),
    /timing-continuity/
  );
  assert.equal(state.reads, 0);
  assert.equal(state.writes.length, 0);
});

test('canonical source is checked after the last transcript await before publishing', async (t) => {
  const { state, deps } = transport(t);
  const dry = await runHeal({ ...options, deps });
  const read = deps.readContinuityTranscript;
  let reads = 0;
  deps.readContinuityTranscript = async () => {
    if (++reads === 2) state.body = body + '\nconcurrent edit during transcript observation';
    return read();
  };
  await assert.rejects(
    runHeal({ ...options, ...applyIdentity(dry), deps }),
    /timing-continuity:source-drift/
  );
  assert.equal(state.writes.length, 0);
  assert.match(state.body, /concurrent edit/);
});
