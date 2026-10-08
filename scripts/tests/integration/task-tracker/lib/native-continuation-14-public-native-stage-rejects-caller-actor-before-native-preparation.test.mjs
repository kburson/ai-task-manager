// @story #1855
import { assert, moveState, nativeFinalFixture, test } from './native-continuation-fixtures.mjs';

test('public native stage rejects caller actor before native preparation', async () => {
  const f = await nativeFinalFixture();
  try {
    const before = structuredClone(f.backend.snapshot);
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
        actor: 'caller-selected-actor',
      }),
      (error) => error.code === 'revision-authority-unavailable'
    );
    assert.deepEqual(f.backend.snapshot, before);
  } finally {
    f.dispose();
  }
});
