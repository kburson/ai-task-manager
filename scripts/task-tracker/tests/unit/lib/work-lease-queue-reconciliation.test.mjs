// @story #1049
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { enqueue, peek, removeExactQueueEntries } from '../../../queue.mjs';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';

test('exact queue removal is replay-safe and leaves mismatches and new entries untouched', () => {
  const dir = mkdtempProjectIsolated('tt-work-lease-queue-');
  const queuePath = path.join(dir, 'queue.json');
  try {
    enqueue({ kind: 'timing', issue: '#1048', row: 'queued source row' }, queuePath);
    enqueue({ kind: 'timing', issue: '#9999', row: 'new unrelated row' }, queuePath);
    const [source, unrelated] = peek(queuePath);
    const mismatch = { ...source, row: 'attacker changed row' };

    assert.deepEqual(removeExactQueueEntries([source], queuePath), {
      reconciled: true,
      removed: 1,
      alreadyAbsent: 0,
    });
    assert.deepEqual(peek(queuePath), [unrelated]);

    assert.deepEqual(removeExactQueueEntries([source], queuePath), {
      reconciled: true,
      removed: 0,
      alreadyAbsent: 1,
    });
    assert.deepEqual(peek(queuePath), [unrelated]);

    assert.deepEqual(removeExactQueueEntries([mismatch], queuePath), {
      reconciled: true,
      removed: 0,
      alreadyAbsent: 1,
    });
    assert.deepEqual(peek(queuePath), [unrelated]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
