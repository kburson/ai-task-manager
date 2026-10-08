// @story #1855
import { assert, moveState, nativeFinalFixture, test } from './native-continuation-fixtures.mjs';

for (const key of [
  'runGuardExecution',
  '_runGuardExecution',
  '_createTransitionId',
  '_probeCompletion',
  '_emitPhasePairRows',
  '_stampEntryMarkers',
  '_runStatusWrite',
  '_writeSentinel',
  '_writeTransitionCommit',
  '_runPostCommitTail',
])
  test(`public native stage rejects ${key} before selecting authority or effect callbacks`, async () => {
    const f = await nativeFinalFixture();
    try {
      const before = structuredClone(f.backend.snapshot);
      const calls = [];
      await assert.rejects(
        moveState({
          cfg: { repo: f.context.repository },
          issueArg: String(f.context.issue),
          stateArg: 'test',
          resolvedFromState: 'develop',
          projectDir: f.projectDir,
          revisionBackend: f.backend,
          plan: { runGuardPipeline: true },
          SKIP_NETWORK: false,
          [key]: () => {
            calls.push(key);
            return key === '_createTransitionId' ? 'move:caller-created' : { exit: 4 };
          },
        }),
        (error) => error.code === 'revision-authority-unavailable'
      );
      assert.deepEqual(calls, []);
      assert.deepEqual(f.backend.snapshot, before);
    } finally {
      f.dispose();
    }
  });
