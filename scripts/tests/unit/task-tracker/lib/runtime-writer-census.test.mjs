// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

test('writer census preserves active session and occupancy claims, exact bytes and unknown process coverage', async () => {
  const { observeRuntimeWriterCensus } =
    await import('../../../../task-tracker/lib/runtime-writer-census.mjs');
  const owner = { provider: 'fixture', sid: 'own', pid: 10, processToken: 'one' };
  const records = {
    '/root/sessions/own/active-task.json': { issue: 1857, entryStartTs: '2026-10-01T00:00:00Z' },
    '/root/sessions/other/active-task.json': { issue: 1858, entryStartTs: '2026-10-01T01:00:00Z' },
    '/root/state/task-tracker-state.json': { active: 1857, entryStartTs: '2026-10-01T00:00:00Z' },
    '/root/fleet/occupancy.json': {
      1858: { issue: 1858, sid: 'other', provider: 'fixture', worktreePath: '/root' },
    },
  };
  const values = new Map(
    Object.entries(records).map(([file, value]) => [file, Buffer.from(JSON.stringify(value))])
  );
  const files = [...values].map(([source, bytes]) => ({
    source,
    root: '/root',
    family: source.includes('/sessions/')
      ? 'sessions'
      : source.includes('/state/')
        ? 'state'
        : 'occupancy',
    digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
  }));
  const input = { roots: ['/root'], projectRoot: '/root', mainRoot: '/root', files, owner };
  const adapters = {
    readBytes: (file) => values.get(file),
    observeProcesses: () => ({
      complete: true,
      processes: [{ pid: 20, projectRoot: '/root' }],
      unknown: [],
    }),
    inspectLeases: () => [],
  };
  const result = observeRuntimeWriterCensus(input, adapters);
  assert.equal(result.complete, true);
  assert.equal(result.writers[0].cooperative, false);
  assert.ok(result.claims.some((claim) => claim.sid === 'own' && claim.provider === 'fixture'));
  assert.ok(result.claims.some((claim) => claim.sid === 'other'));
  assert.equal(
    result.claims.some((claim) => claim.reason === 'unattributed-active-state'),
    false
  );
  values.set(files[0].source, Buffer.from('{}'));
  assert.equal(observeRuntimeWriterCensus(input, adapters).complete, false);
  values.set(files[0].source, Buffer.from(JSON.stringify(records[files[0].source])));
  assert.equal(
    observeRuntimeWriterCensus(input, {
      ...adapters,
      observeProcesses: () => ({
        complete: false,
        processes: [],
        unknown: [{ reason: 'unavailable' }],
      }),
    }).complete,
    false
  );
  const uncorrelated = {
    ...input,
    files: files.filter((file) => !file.source.includes('/sessions/own/')),
  };
  assert.ok(
    observeRuntimeWriterCensus(uncorrelated, adapters).claims.some(
      (claim) => claim.reason === 'unattributed-active-state'
    )
  );
  const unrelated = {
    ...input,
    files: [
      ...files,
      {
        source: '/root/sessions/own/pending-ask.json',
        root: '/root',
        family: 'sessions',
        digest: 'sha256:' + '0'.repeat(64),
      },
    ],
  };
  assert.equal(
    observeRuntimeWriterCensus(unrelated, adapters).complete,
    true,
    'non-claim session files are validated by the catalog, not decoded as claims'
  );
  const cooperative = observeRuntimeWriterCensus(input, {
    ...adapters,
    inspectLeases: () => [{ record: { owner: { ...owner, pid: 20 }, projectRoot: '/root' } }],
  });
  assert.equal(cooperative.writers[0].cooperative, true);
  const orphan = observeRuntimeWriterCensus(input, {
    ...adapters,
    inspectLeases: () => [{ record: { owner: { ...owner, pid: 99 }, projectRoot: '/root' } }],
  });
  assert.ok(
    orphan.writers.some(
      (writer) => writer.pid === 99 && writer.reason === 'unresolved-writer-lease'
    )
  );
});
