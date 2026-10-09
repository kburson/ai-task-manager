// @story #1855
// Actual sandbox runtime arithmetic and passive capture; no publication authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import * as runtime from '../../../../task-tracker/runtime.mjs';
import { loadState, saveState } from '../../../../task-tracker/state.mjs';
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import { markerPathFor, saveMarker, loadMarker } from '../../../../task-tracker/word-counter.mjs';
async function fixture(run) {
  const root = createRuntimeRootFixture('native-actor-source-');
  const names = [
    'AI_TASK_MANAGER_PROJECT_DIR',
    'CLAUDE_PROJECT_DIR',
    'AI_TASK_MANAGER_SESSION_ID',
    'AI_TASK_MANAGER_APP_NAME',
    'AI_TASK_MANAGER_TRANSCRIPT_DIR',
    'TT_SKIP_NETWORK',
    'TT_SKIP_FIELD_SELF_CHECK',
  ];
  const saved = Object.fromEntries(names.map((key) => [key, process.env[key]])),
    cwd = process.cwd();
  try {
    process.chdir(root);
    delete process.env.CLAUDE_PROJECT_DIR;
    process.env.AI_TASK_MANAGER_PROJECT_DIR = root;
    process.env.AI_TASK_MANAGER_SESSION_ID = 'native-actor-source';
    process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
    process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = path.join(root, 'transcripts');
    process.env.TT_SKIP_NETWORK = '1';
    process.env.TT_SKIP_FIELD_SELF_CHECK = '1';
    mkdirSync(path.join(root, '.ai-task-manager'), { recursive: true });
    mkdirSync(process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR);
    writeFileSync(
      path.join(root, '.ai-task-manager/task-tracker.json'),
      JSON.stringify({ repo: 'fixture/repository' })
    );
    const ctx = runtime.buildContext(['status']);
    const file = path.join(root, 'transcripts/native-actor-source.jsonl');
    const bytes =
      JSON.stringify({ type: 'assistant', message: { content: 'three actual words' } }) + '\n';
    writeFileSync(file, bytes);
    saveMarker(markerPathFor('native-actor-source'), 0, 10, '#1855', 20);
    const start = new Date(Date.now() - 2000).toISOString();
    saveState(
      { active: '#1855', entryStartTs: start, lastWordMarker: 10, lastFullWordMarker: 20 },
      ctx.statePath
    );
    await run({ ctx, root, file, bytes, start });
  } finally {
    process.chdir(cwd);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

test('native actor source capture binds actual counted bytes and activity to the original journal candidate', async () =>
  fixture(async ({ ctx, root, file, bytes, start }) => {
    assert.equal(typeof runtime.readActorFlushSourceData, 'function');
    const result = await ctx.flushActiveToGH(loadState(ctx.statePath), 'update', 'source fixture');
    const data = runtime.readActorFlushSourceData(result);
    assert.equal(data.projectDir, root);
    assert.equal(data.statePath, ctx.statePath);
    assert.deepEqual(data.identity, { provider: 'claude', sid: 'native-actor-source' });
    assert.equal(data.skipNetwork, true, 'offline source data is not confirmed publication');
    assert.equal(data.ts, result.ts);
    assert.equal(data.word.path, file);
    assert.equal(data.word.count, 3);
    assert.equal(data.word.fromLine, 0);
    assert.equal(data.word.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(data.activity.path, file);
    assert.equal(data.activity.startMs, Date.parse(start));
    assert.equal(data.activity.endMs, Date.parse(result.ts));
    assert.equal(data.activity.status, 'unavailable');
    assert.equal(data.candidate.issue, '#1855');
    assert.equal(data.candidate.row, result.row);
    assert.deepEqual(data.candidate.cursor, {
      before: { line: 0, words: 10, wordsFull: 20 },
      after: { line: 1, words: 13, wordsFull: 23 },
    });
    const row = parseTimingRow(data.candidate.row);
    assert.equal(row.engagement.wordStart, 10);
    assert.equal(row.engagement.wordEnd, 13);
    assert.equal(row.engagement.activeEstimateSec, null);
    assert.equal(loadState(ctx.statePath).lastWordMarker, 13);
    const visit = (value) => {
      if (value && typeof value === 'object') {
        assert.ok(Object.isFrozen(value));
        for (const nested of Object.values(value)) visit(nested);
      } else assert.notEqual(typeof value, 'function');
    };
    visit(data);
    assert.equal(runtime.readActorFlushSourceData({ ...result }), null);
    assert.equal(
      runtime.readActorFlushSourceData(data.candidate),
      null,
      'detached candidate does not acquire original membership'
    );
    appendFileSync(file, bytes);
    result.row = 'caller changed';
    assert.equal(runtime.readActorFlushSourceData(result).word.totalLines, 1);
    assert.equal(runtime.readActorFlushSourceData(result).candidate.row, data.candidate.row);
  }));

test('native actor recovery-only and compute-only results cannot invent a newly published candidate capture', async () =>
  fixture(async ({ ctx }) => {
    assert.equal(typeof runtime.readActorFlushSourceData, 'function');
    for (const options of [{ recoverOnly: true }, { computeOnly: true }]) {
      const result = await ctx.flushActiveToGH(
        loadState(ctx.statePath),
        'update',
        'source fixture',
        undefined,
        options
      );
      assert.equal(runtime.readActorFlushSourceData(result), null);
    }
  }));

// @story #1855
test('native actor first-intent record exactly matches ordinary prepared journal bytes without publishing', async () =>
  fixture(async ({ ctx, root }) => {
    const journal = await import('../../../../task-tracker/lib/actor-flush-journal.mjs');
    const { timingActorKey } = await import('../../../../task-tracker/lib/timing-actor.mjs');
    const result = await ctx.flushActiveToGH(
      loadState(ctx.statePath),
      'update',
      'original candidate'
    );
    const source = runtime.readActorFlushSourceData(result);
    const input = { identity: source.identity, candidate: structuredClone(source.candidate) };
    const original = structuredClone(input);
    const record = journal.deriveActorFlushJournalRecord(input);
    assert.deepEqual(input, original);
    assert.deepEqual(record, {
      schema: 'aitm.actor-flush-journal/v1',
      actor: timingActorKey(input.identity),
      provider: input.identity.provider,
      sid: input.identity.sid,
      digest: createHash('sha256').update(JSON.stringify(input.candidate)).digest('hex'),
      payload: input.candidate,
    });
    const file = path.join(root, 'captured-native-journal.json');
    let effects = 0;
    await assert.rejects(
      journal.runActorFlushJournal({
        file,
        identity: input.identity,
        candidate: input.candidate,
        publish: async () => {
          effects++;
          throw new Error('unexpected publication');
        },
        commit: async () => {
          effects++;
        },
        fault: (stage) => {
          if (stage === 'prepared') throw new Error('retained original prepare');
        },
      }),
      /retained original prepare/
    );
    assert.equal(effects, 0);
    assert.equal(readFileSync(file, 'utf8'), JSON.stringify(record, null, 2) + '\n');
    assert.deepEqual(journal.readActorFlushJournal(file, input.identity), record);
    assert.throws(() => journal.deriveActorFlushJournalRecord({ ...input, approved: true }), {
      code: 'ACTOR_FLUSH_INVALID',
    });
    assert.throws(
      () =>
        journal.deriveActorFlushJournalRecord({
          ...input,
          identity: { ...input.identity, sid: 'foreign' },
        }),
      { code: 'ACTOR_FLUSH_INVALID' }
    );
    const changed = structuredClone(input);
    changed.candidate.checkpoint.lastWordMarker++;
    assert.throws(() => journal.deriveActorFlushJournalRecord(changed), {
      code: 'ACTOR_FLUSH_INVALID',
    });
    rmSync(file);
    journal.deriveActorFlushJournalRecord(input);
    assert.equal(
      existsSync(file),
      false,
      'pure record data cannot write a journal or issue a stage token'
    );
  }));

// @story #1855
test('native stage actor intent preserves original candidate and journal bytes through canonical persistence', async () =>
  fixture(async ({ ctx, root }) => {
    const stage =
      await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
    const journal = await import('../../../../task-tracker/lib/actor-flush-journal.mjs');
    const { canonicalRecordJson } =
      await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
    const result = await ctx.flushActiveToGH(
      loadState(ctx.statePath),
      'update',
      'original first intent'
    );
    const source = runtime.readActorFlushSourceData(result);
    const candidateBytes = JSON.stringify(source.candidate);
    const nativeRecord = journal.deriveActorFlushJournalRecord({
      identity: source.identity,
      candidate: JSON.parse(candidateBytes),
    });
    const journalBytes = JSON.stringify(nativeRecord, null, 2) + '\n';
    const header = { original: { actor: { identity: source.identity, candidateBytes } } };
    const previous =
      'sha256:' + createHash('sha256').update(canonicalRecordJson(header)).digest('hex');
    const step = {
      ordinal: 1,
      kind: 'actor-journal-prepare',
      previous,
      intent: { journalBytes },
      readback: null,
    };
    const file = path.join(root, 'stage-intent-data.json');
    writeFileSync(file, canonicalRecordJson({ header, steps: [step] }));
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(saved.header.original.actor.candidateBytes, candidateBytes);
    assert.equal(saved.steps[0].intent.journalBytes, journalBytes);
    const input = { ...saved.header.original.actor, ordinal: 1, previous, step: saved.steps[0] };
    const reconstructed = stage.reconstructNativeStageActorPrepareStep(input);
    assert.equal(reconstructed.journalBytes, journalBytes);
    assert.equal(
      reconstructed.readbackBytes,
      null,
      'persisted intent is still pending before an effect/readback'
    );
    assert.equal(
      reconstructed.stepHash,
      'sha256:' + createHash('sha256').update(canonicalRecordJson(step)).digest('hex')
    );
    assert.deepEqual(
      journal.validateActorFlushJournal(JSON.parse(reconstructed.journalBytes), source.identity),
      nativeRecord
    );
    const complete = structuredClone(input);
    complete.step.readback = { bytes: journalBytes };
    assert.equal(
      stage.reconstructNativeStageActorPrepareStep(complete).readbackBytes,
      journalBytes
    );
    const sortedCandidate = canonicalRecordJson(source.candidate);
    assert.notEqual(
      sortedCandidate,
      candidateBytes,
      'actual native candidate order differs from canonical key order'
    );
    const sortedRecord = JSON.parse(canonicalRecordJson(nativeRecord));
    assert.throws(() => journal.validateActorFlushJournal(sortedRecord, source.identity), {
      code: 'ACTOR_FLUSH_INVALID',
    });
    for (const change of [
      (value) => {
        value.candidateBytes = sortedCandidate;
      },
      (value) => {
        value.identity.sid = 'foreign';
      },
      (value) => {
        value.step.intent.journalBytes = canonicalRecordJson(nativeRecord);
      },
      (value) => {
        value.step.readback = { bytes: journalBytes + ' ' };
      },
      (value) => {
        value.step.readback = { bytes: journalBytes, ok: true };
      },
      (value) => {
        value.step.ordinal = 2;
      },
      (value) => {
        value.step.previous = 'sha256:' + '0'.repeat(64);
      },
      (value) => {
        value.step.kind = 'actor-timing';
      },
      (value) => {
        value.step.intent.approved = true;
      },
      (value) => {
        value.candidateBytes = '{}';
      },
    ]) {
      const bad = structuredClone(input);
      change(bad);
      assert.throws(
        () => stage.reconstructNativeStageActorPrepareStep(bad),
        /criteria-revision:native-stage-actor-prepare-step/
      );
    }
    assert.equal(
      readFileSync(file, 'utf8'),
      canonicalRecordJson(saved),
      'pure reconstruction has no storage effect'
    );
  }));

test('recorded stage actor candidate validates original native arithmetic against retained local state', async () =>
  fixture(async ({ ctx }) => {
    const stage =
      await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
    const state = structuredClone(loadState(ctx.statePath));
    const marker = loadMarker(markerPathFor('native-actor-source'));
    const result = await ctx.flushActiveToGH(
      loadState(ctx.statePath),
      'update',
      'lifecycle boundary'
    );
    const capture = runtime.readActorFlushSourceData(result);
    const input = {
      capture,
      state,
      marker: { line: marker.line, words: marker.words, wordsFull: marker.wordsFull },
      identity: capture.identity,
      offsetMin: 0 - new Date(capture.ts).getTimezoneOffset(),
    };
    assert.equal(await stage.assertRecordedStageActorCandidate(input), undefined);
    assert.equal(
      capture.skipNetwork,
      true,
      'offline arithmetic data is not a complete stage header source'
    );
    assert.equal(capture.candidate.cursor.after.words, 13);
    assert.equal(capture.candidate.cursor.after.wordsFull, 23);
    for (const [label, change] of [
      [
        'noncanonical negative zero offset',
        (x) => {
          x.offsetMin = -0;
        },
      ],
      [
        'local marker',
        (x) => {
          x.marker.words++;
        },
      ],
      [
        'local state',
        (x) => {
          x.state.lastWordMarker++;
        },
      ],
      [
        'original source count',
        (x) => {
          x.capture.word.count++;
        },
      ],
      [
        'original activity interval',
        (x) => {
          x.capture.activity.startMs++;
        },
      ],
      [
        'original actor',
        (x) => {
          x.identity.sid = 'foreign';
        },
      ],
      [
        'original row',
        (x) => {
          x.capture.candidate.row += ' ';
        },
      ],
      [
        'checkpoint',
        (x) => {
          x.capture.candidate.checkpoint.wordsAtEntryStart++;
        },
      ],
      [
        'source extra authority',
        (x) => {
          x.capture.ready = true;
        },
      ],
      [
        'caller renderer',
        (x) => {
          x.render = () => x.capture.candidate.row;
        },
      ],
    ]) {
      const bad = structuredClone(input);
      change(bad);
      await assert.rejects(
        stage.assertRecordedStageActorCandidate(bad),
        (error) => error.message.includes('native-stage-actor-candidate'),
        label
      );
    }
  }));

// The original phase case exercises the actual private emitter capture and
// durable phase intent. UTC must produce canonical +0 without weakening the
// canonical validator's refusal of caller-supplied negative zero.
test('native phase UTC metadata reaches its original durable intent', { timeout: 600000 }, (t) => {
  const isolation = createSandbox();
  try {
    const output = execFileSync(
      process.execPath,
      [
        '--test',
        fileURLToPath(
          new URL('./native-stage-phase-11-prefix-after-intent-write.test.mjs', import.meta.url)
        ),
      ],
      {
        cwd: isolation.context.sourceRoot,
        env: { ...isolation.env, AITM_NATIVE_STAGE_CONTEXT: '1', TZ: 'UTC' },
        encoding: 'utf8',
        timeout: 590000,
      }
    );
    t.diagnostic(output);
  } finally {
    isolation.dispose();
  }
});
