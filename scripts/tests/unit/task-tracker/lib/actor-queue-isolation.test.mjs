// @story #1857

import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  createActivatedUnitRuntimeRoot,
  unitTest as test,
} from '../../../helpers/unit-runtime-root.mjs';
import { enqueue, peek, drain, drainMatching } from '../../../../task-tracker/queue.mjs';
import { buildRow } from '../../../../task-tracker/gh-timing-comment.mjs';
import { timingActorKey } from '../../../../task-tracker/lib/timing-actor.mjs';

test('drain cannot erase a concurrently enqueued actor row and replay preserves original bytes', async () => {
  const root = createActivatedUnitRuntimeRoot('actor-queue-');
  const file = path.join(
    root,
    '.ai-task-manager',
    'runtime',
    'store',
    'state',
    'task-tracker-queue.json'
  );
  try {
    const row = buildRow({
      ts: new Date().toISOString(),
      event: 'pause:other',
      actorKey: timingActorKey({ provider: 'codex', sid: 'fixture-queue-a' }),
      activeSec: null,
      idleSec: null,
      wordMarker: 0,
      fullWordMarker: null,
      engagement: {
        startMs: Date.now() - 1000,
        endMs: Date.now(),
        activeEstimateSec: null,
        wordStart: null,
        wordEnd: null,
        fullWordStart: null,
        fullWordEnd: null,
      },
    });
    enqueue({ kind: 'timing', issue: '#1857', row }, file);
    await drain(async (event) => {
      assert.equal(event.row, row);
      enqueue(
        { kind: 'timing', issue: '#2000', row: row.replace('pause:other', 'pause:question') },
        file
      );
    }, file);
    assert.equal(peek(file).length, 1);
    assert.equal(peek(file)[0].issue, '#2000');
    enqueue({ kind: 'timing', issue: '#1857', row }, file);
    await drainMatching(
      async () => {
        throw new Error('offline');
      },
      file,
      (event) => event.issue === '#1857'
    );
    assert.equal(peek(file).find((event) => event.issue === '#1857').row, row);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).schema, 'aitm.timing-queue/v1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('queue corruption and unsupported schema refuse without erasing evidence', async () => {
  const root = createActivatedUnitRuntimeRoot('actor-queue-invalid-');
  const file = path.join(
    root,
    '.ai-task-manager',
    'runtime',
    'store',
    'state',
    'task-tracker-queue.json'
  );
  try {
    for (const bytes of ['{broken', JSON.stringify({ schema: 'future', items: [] })]) {
      writeFileSync(file, bytes);
      assert.throws(() => enqueue({ kind: 'timing', issue: '#1857', row: 'new' }, file), {
        code: 'RUNTIME_STATE_CORRUPT',
      });
      await assert.rejects(
        drain(async () => {}, file),
        { code: 'RUNTIME_STATE_CORRUPT' }
      );
      assert.equal(readFileSync(file, 'utf8'), bytes);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
