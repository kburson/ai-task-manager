// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { inspectRuntimeWriterLeases } from '../../../../task-tracker/lib/runtime-migration-lock.mjs';
import {
  runActorFlushJournal,
  readActorFlushJournal,
} from '../../../../task-tracker/lib/actor-flush-journal.mjs';
import { buildRow } from '../../../../task-tracker/gh-timing-comment.mjs';
import { timingActorKey } from '../../../../task-tracker/lib/timing-actor.mjs';
import { classifyRuntimeRecord } from '../../../../task-tracker/lib/runtime-record-catalog.mjs';
const identity = { provider: 'codex', sid: 'fixture-journal-a' };
function candidate() {
  const end = Date.now();
  const ts = new Date(end).toISOString();
  const row = buildRow({
    ts,
    event: 'pause:other',
    actorKey: timingActorKey(identity),
    activeSec: null,
    idleSec: null,
    wordMarker: 12,
    fullWordMarker: 20,
    engagement: {
      startMs: end - 1000,
      endMs: end,
      activeEstimateSec: null,
      wordStart: 10,
      wordEnd: 12,
      fullWordStart: 18,
      fullWordEnd: 20,
    },
  });
  return {
    issue: '#1857',
    row,
    cursor: {
      before: { line: 2, words: 10, wordsFull: 18 },
      after: { line: 3, words: 12, wordsFull: 20 },
    },
    previous: {
      entryStartTs: new Date(end - 1000).toISOString(),
      lastWordMarker: 10,
      lastFullWordMarker: 18,
    },
    checkpoint: {
      active: '#1857',
      entryStartTs: ts,
      wordsAtEntryStart: 12,
      fullWordsAtEntryStart: 20,
      lastWordMarker: 12,
      lastFullWordMarker: 20,
    },
  };
}
test('pending flush preserves exact evidence across every publication and cursor crash boundary', async () => {
  const root = await createActivatedRuntimeRootFixture('flush-journal-');
  try {
    for (const boundary of ['prepared', 'published', 'committed']) {
      const file = path.join(root, '.ai-task-manager', 'runtime', 'store', 'sessions', identity.sid, 'timing', timingActorKey(identity).slice(3) + '.json.flush.json');
      const original = candidate();
      const published = new Set();
      let cursor = original.cursor.before;
      const publish = async (record) => {
        assert.equal(inspectRuntimeWriterLeases({ projectRoot: root, mainRoot: root }).length, 1, 'pending publication must retain its whole-operation writer lease');
        published.add(record.row);
        return { ok: true };
      };
      const commit = async (record) => {
        cursor = record.cursor.after;
      };
      await assert.rejects(
        runActorFlushJournal({
          file,
          identity,
          candidate: original,
          publish,
          commit,
          fault: (stage) => {
            if (stage === boundary) throw new Error('crash');
          },
        }),
        /crash/
      );
      assert.deepEqual(readActorFlushJournal(file, identity).payload, original);
      const relative =
        'sessions/' +
        identity.sid +
        '/timing/' +
        timingActorKey(identity).slice(3) +
        '.json.flush.json';
      const classified = classifyRuntimeRecord({ relative, kind: 'volatile-runtime' });
      assert.ok(classified);
      const preserved = readFileSync(file);
      assert.equal(classified.validate(preserved), true);
      const tampered = JSON.parse(preserved);
      tampered.payload.issue = '#2000';
      assert.equal(classified.validate(Buffer.from(JSON.stringify(tampered))), false);
      await runActorFlushJournal({ file, identity, publish, commit });
      assert.equal(published.size, 1);
      assert.deepEqual(cursor, original.cursor.after);
      assert.equal(existsSync(file), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('publication failure leaves the cursor unchanged and conflicting or corrupt recovery refuses', async () => {
  const root = await createActivatedRuntimeRootFixture('flush-journal-refusal-');
  const file = path.join(root, '.ai-task-manager', 'runtime', 'store', 'sessions', identity.sid, 'timing', timingActorKey(identity).slice(3) + '.json.flush.json');
  try {
    const original = candidate();
    let commits = 0;
    await assert.rejects(
      runActorFlushJournal({
        file,
        identity,
        candidate: original,
        publish: async () => {
          throw new Error('ambiguous remote result');
        },
        commit: async () => {
          commits++;
        },
      }),
      /ambiguous/
    );
    assert.equal(commits, 0);
    const bytes = readFileSync(file, 'utf8');
    await assert.rejects(
      runActorFlushJournal({
        file,
        identity,
        candidate: { ...original, issue: '#2000' },
        publish: async () => ({ ok: true }),
        commit: async () => {},
      }),
      { code: 'ACTOR_FLUSH_CONFLICT' }
    );
    assert.equal(readFileSync(file, 'utf8'), bytes);
    assert.throws(
      () => readActorFlushJournal(file, { provider: 'codex', sid: 'fixture-journal-b' }),
      { code: 'ACTOR_FLUSH_INVALID' }
    );
    writeFileSync(file, '{broken');
    await assert.rejects(
      runActorFlushJournal({
        file,
        identity,
        candidate: original,
        publish: async () => ({ ok: true }),
        commit: async () => {},
      }),
      { code: 'ACTOR_FLUSH_INVALID' }
    );
    assert.equal(readFileSync(file, 'utf8'), '{broken');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
