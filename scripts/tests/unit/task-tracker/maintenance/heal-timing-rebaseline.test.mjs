// @story #2022
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runHeal, main } from '../../../../task-tracker/heal-timing-log.mjs';
import { fmtTs } from '../../../../task-tracker/gh-timing-comment.mjs';
import {
  timingActorKey,
  timingActorMarker,
  timingEngagementMarker,
} from '../../../../task-tracker/lib/timing-actor.mjs';
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import { deriveActorEngagement } from '../../../../task-tracker/lib/timing-engagement.mjs';
import { validate } from '../../../../task-tracker/lib/agent-review/validators/timing-log-sequence.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const sid = 'original-owner';
const actor = timingActorKey({ provider: 'codex', sid });
const start = Date.parse('2026-10-16T00:00:00Z');
const baseline = start + 240_507;
const end = start + 3600_000;
const header =
  '⏱ Timing Log\n\n| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Word Marker |\n|---|---|---|---|---|---|---|---|\n';
const span = (a, b, w = 20, f = 200) => ({
  startMs: a,
  endMs: b,
  activeEstimateSec: null,
  wordStart: w,
  wordEnd: 25,
  fullWordStart: f,
  fullWordEnd: 250,
});
const line = (ms, event, evidence, who = actor, w = 10, f = 100) =>
  `| ${fmtTs(ms, { offsetMin: 0 })} | ${event} | ${evidence ? 'Unknown' : ''} | ${evidence ? 'Unknown' : ''} | ${evidence ? '5' : '0'} | ${w} | observed | ${f} |${timingActorMarker(who)}${evidence ? timingEngagementMarker(evidence) : ' <!-- row-sec: a=0 i=0 -->'}`;
const original = [
  line(start, 'resumed'),
  line(end, 'pause:other', span(baseline, end), actor, 25, 250),
];
const body = header + original.join('\n') + '\n';
const rows = (s) =>
  s
    .split('\n')
    .map(parseTimingRow)
    .filter((r) => r?.actorKey);
const grade = (s) => validate({ comments: [{ body: s }] });

function fixture(t) {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'rebaseline-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const command =
    'set -e\n/runtime/node /runtime/bin/aitm.mjs start 2022 --role agent --confirm-relocation --allow-foreign-worktree\n/runtime/node /runtime/bin/aitm.mjs explain 2022 --json';
  const records = [
    {
      timestamp: new Date(start - 1000).toISOString(),
      type: 'session_meta',
      payload: { id: sid, cwd: '/original' },
    },
    {
      timestamp: new Date(baseline + 10_000).toISOString(),
      type: 'event_msg',
      payload: {
        type: 'item_completed',
        item: {
          type: 'CommandExecution',
          id: 'native-relocation',
          source: 'unified_exec_startup',
          command: ['/bin/zsh', '-lc', command],
          cwd: pathToFileURL(root).href,
          status: 'completed',
          exit_code: 0,
          duration: { secs: 20, nanos: 0 },
          aggregated_output:
            'Bound #2022 (live timing span already active; no duplicate reengagement row).\n',
        },
      },
    },
  ];
  const state = {
    body,
    records,
    writes: [],
    reads: 0,
    caller: 'current-owner',
    provider: 'codex',
    boundIssue: '#2022',
  };
  const deps = {
    getProjectDir: () => root,
    currentSessionId: () => state.caller,
    aiAppName: () => state.provider,
    getActiveTask: (caller) =>
      caller === 'current-owner' ? { issue: state.boundIssue, worktreePath: root } : null,
    now: () => end + 60_000,
    readContinuityTranscript: async () => ({
      path: '/native/rollout.jsonl',
      text: state.records.map((r) => JSON.stringify(r)).join('\n') + '\n',
    }),
    findTimingComment: async () => ({ id: 'IC_actual', body: state.body }),
    readCanonicalTimingSource: async () => {
      state.reads++;
      return {
        status: 'found',
        source: {
          repository: 'owner/repo',
          issue: 2022,
          commentNodeId: 'IC_actual',
          body: state.body,
        },
      };
    },
    updateTimingComment: async (id, repo, next) => {
      state.writes.push({ id, repo, next });
      state.body = next;
    },
  };
  return {
    state,
    deps,
    root,
    options: { issueNumber: 2022, repo: 'owner/repo', rebaselineSession: sid, deps },
  };
}
const applyArgs = (r) => ({
  apply: true,
  expectedSourceSha: r.sourceSha,
  expectedCommentId: r.commentId,
  expectedTranscriptSha: r.transcriptSha,
});

test('authenticated relocation recovery preserves every original row and Unknown contribution', async (t) => {
  const { state, options } = fixture(t);
  assert.match(grade(body).failures.join('\n'), /actor-evidence-start-conflict/);
  const dry = await runHeal(options);
  assert.equal(dry.status, 'dry-run');
  assert.equal(dry.inserted, 2);
  assert.equal(state.writes.length, 0);
  const done = await runHeal({ ...options, ...applyArgs(dry) });
  assert.equal(done.status, 'healed');
  assert.equal(done.operatorActor, timingActorKey({ provider: 'codex', sid: 'current-owner' }));
  assert.deepEqual(grade(state.body), { pass: true, failures: [] });
  for (const r of original) assert.ok(state.body.split('\n').includes(r));
  const recovered = rows(state.body).find((r) => r.event === 'session-end-recovery');
  assert.equal(recovered.cells[3], 'Unknown');
  assert.equal(recovered.cells[4], 'Unknown');
  assert.equal(recovered.engagement, undefined);
  const result = deriveActorEngagement(rows(state.body), end + 60_000);
  assert.equal(result.complete, false);
  assert.equal(result.unknownRows, 1);
  assert.equal(result.engagedMs, end - baseline);
  assert.deepEqual(result.failures, []);
  assert.equal(readFileSync(path.join(done.evidenceDir, 'before.md'), 'utf8'), body);
  assert.equal(readFileSync(path.join(done.evidenceDir, 'candidate.md'), 'utf8'), state.body);
  assert.equal((await runHeal(options)).status, 'already-canonical');
  assert.equal(state.writes.length, 1);
});

for (const [name, change] of [
  [
    'foreign caller',
    (s) => {
      s.caller = 'replacement';
    },
  ],
  [
    'foreign provider',
    (s) => {
      s.provider = 'claude';
    },
  ],
  [
    'foreign binding',
    (s) => {
      s.boundIssue = '#1';
    },
  ],
  [
    'foreign transcript',
    (s) => {
      s.records[0].payload.id = 'replacement';
    },
  ],
  [
    'failed relocation',
    (s) => {
      s.records[1].payload.item.exit_code = 1;
    },
  ],
  [
    'unrelated command',
    (s) => {
      s.records[1].payload.item.command[2] = 'echo fabricated';
    },
  ],
  [
    'missing relocation confirmation',
    (s) => {
      s.records[1].payload.item.command[2] = s.records[1].payload.item.command[2].replace(
        ' --confirm-relocation',
        ''
      );
    },
  ],
  [
    'ambiguous proof',
    (s) => {
      s.records.push(structuredClone(s.records[1]));
    },
  ],
  [
    'baseline outside command',
    (s) => {
      s.records[1].timestamp = new Date(end).toISOString();
    },
  ],
  [
    'foreign execution cwd',
    (s) => {
      s.records[1].payload.item.cwd = 'file:///foreign';
    },
  ],
  [
    'inconsistent native duration',
    (s) => {
      s.records[1].payload.item.duration = { secs: 21, nanos: -1_000_000_000 };
    },
  ],
  [
    'malformed timing row',
    (s) => {
      s.body = s.body.replace(
        original[1],
        original[1].replace('2026-10-16 01:00:00 +00:00', 'not-a-date')
      );
    },
  ],
  [
    'unknown baseline cursor',
    (s) => {
      s.body = s.body.replace('wstart=20', 'wstart=unknown').replace('wend=25', 'wend=unknown');
    },
  ],
])
  test('rebaseline refuses ' + name, async (t) => {
    const { state, options } = fixture(t);
    change(state);
    await assert.rejects(runHeal(options), /timing-rebaseline:/);
    assert.equal(state.writes.length, 0);
  });

test('apply refuses source and transcript drift without writing', async (t) => {
  const { state, options } = fixture(t);
  const dry = await runHeal(options);
  state.body += '\n';
  await assert.rejects(runHeal({ ...options, ...applyArgs(dry) }), /identity-mismatch/);
  state.body = body;
  state.records[0].payload.cwd = '/changed';
  await assert.rejects(runHeal({ ...options, ...applyArgs(dry) }), /identity-mismatch/);
  assert.equal(state.writes.length, 0);
});

test('apply rejects a source race before publication', async (t) => {
  const { state, deps, options } = fixture(t);
  const dry = await runHeal(options);
  const read = deps.readCanonicalTimingSource;
  deps.readCanonicalTimingSource = async () => {
    if (state.reads >= 2) state.body += '\n';
    return read();
  };
  await assert.rejects(runHeal({ ...options, ...applyArgs(dry) }), /source-drift/);
  assert.equal(state.writes.length, 0);
});

test('ambiguous successful publication is reconciled by exact readback', async (t) => {
  const { state, deps, options } = fixture(t);
  const dry = await runHeal(options);
  const update = deps.updateTimingComment;
  deps.updateTimingComment = async (...args) => {
    await update(...args);
    throw new Error('transport timeout');
  };
  assert.equal(
    (await runHeal({ ...options, ...applyArgs(dry) })).status,
    'healed-after-ambiguous-write'
  );
  assert.equal(state.writes.length, 1);
  assert.equal((await runHeal(options)).status, 'already-canonical');
});

test('ambiguous failed publication retains a refusal', async (t) => {
  const { deps, options } = fixture(t);
  const dry = await runHeal(options);
  deps.updateTimingComment = async () => {
    throw new Error('transport timeout');
  };
  await assert.rejects(runHeal({ ...options, ...applyArgs(dry) }), /readback/);
});

test('ordinary future transcript growth retains the prepared prefix identity', async (t) => {
  const { state, options } = fixture(t);
  state.records.push({
    timestamp: new Date(end + 1000).toISOString(),
    type: 'event_msg',
    payload: { type: 'token_count' },
  });
  const dry = await runHeal(options);
  state.records.push({
    timestamp: new Date(end + 2000).toISOString(),
    type: 'event_msg',
    payload: { type: 'token_count' },
  });
  assert.equal((await runHeal({ ...options, ...applyArgs(dry) })).status, 'healed');
  assert.equal(state.writes.length, 1);
});

test('CLI rejects incompatible recovery modes before reading authority', async () => {
  let code;
  let loaded = false;
  await main(['2022', '--rebaseline-session', sid, '--continuity-session', sid], {
    out: { write() {} },
    err: { write() {} },
    exit: (n) => {
      code = n;
    },
    loadConfig: () => {
      loaded = true;
    },
  });
  assert.equal(code, 2);
  assert.equal(loaded, false);
});

test('exact same-actor sealed opener/end bounds retain Unknown without a long-gap objection', () => {
  const stop = start + 9 * 3600_000;
  const s =
    header +
    line(start, 'resumed', null, actor, 20, 200) +
    '\n' +
    line(stop, 'pause:other', span(start + 123, stop + 456), actor, 25, 250) +
    '\n';
  assert.deepEqual(grade(s), { pass: true, failures: [] });
  assert.ok(s.includes('| Unknown | Unknown |'));
});

for (const [name, make] of [
  ['unsealed', (stop) => line(stop, 'pause:other')],
  [
    'mismatched baseline',
    (stop) => line(stop, 'pause:other', span(start + 1001, stop), actor, 25, 250),
  ],
  [
    'foreign actor',
    (stop) =>
      line(
        stop,
        'pause:other',
        span(start, stop),
        timingActorKey({ provider: 'codex', sid: 'other' }),
        25,
        250
      ),
  ],
])
  test('long-gap guard retains objection for ' + name, () => {
    const stop = start + 9 * 3600_000;
    const s = header + line(start, 'resumed', null, actor, 20, 200) + '\n' + make(stop) + '\n';
    assert.equal(grade(s).pass, false);
  });

test('long-gap guard retains overlapping same-actor evidence objection', () => {
  const stop = start + 9 * 3600_000;
  const earlier = line(start, 'update', span(start - 1000, start + 700), actor, 25, 250);
  const s =
    header +
    earlier +
    '\n' +
    line(start, 'resumed', null, actor, 25, 250) +
    '\n' +
    line(stop, 'pause:other', span(start + 100, stop, 25, 250), actor, 25, 250) +
    '\n';
  assert.match(grade(s).failures.join('\n'), /suspicious wall-clock gap/);
});

for (const [name, change] of [
  [
    'historical reentry after window',
    (s) => {
      s.records.push(
        {
          timestamp: new Date(end + 1000).toISOString(),
          type: 'event_msg',
          payload: { type: 'token_count' },
        },
        structuredClone(s.records[1])
      );
    },
  ],
  [
    'late conflicting metadata',
    (s) => {
      s.records.push({
        timestamp: new Date(end + 1000).toISOString(),
        type: 'session_meta',
        payload: { id: 'foreign', cwd: '/foreign' },
      });
    },
  ],
  [
    'overlapping sealed intervals',
    (s) => {
      s.body += line(end, 'update', span(baseline + 1000, end), actor, 25, 250) + '\n';
    },
  ],
])
  test('review control refuses ' + name, async (t) => {
    const { state, options } = fixture(t);
    change(state);
    await assert.rejects(runHeal(options), /timing-rebaseline:/);
    assert.equal(state.writes.length, 0);
  });
