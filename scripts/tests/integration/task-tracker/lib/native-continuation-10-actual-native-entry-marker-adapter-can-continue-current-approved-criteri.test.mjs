// @story #1855
import {
  assert,
  createTransitionId,
  mutateIssueBody,
  nativeFinalFixture,
  stampEntryMarkers,
  test,
  withRevisionConsumer,
} from './native-continuation-fixtures.mjs';

test('actual native entry marker adapter can continue current approved criteria', async () => {
  const f = await nativeFinalFixture();
  try {
    const first = await f.invoke();
    assert.equal(first.error, undefined);
    assert.equal(first.result.status, 'move-failed');
    const before = f.backend.observation.body.bytes;
    const effects = [...f.effects];
    const result = await withRevisionConsumer(
      {
        repository: f.context.repository,
        issue: f.context.issue,
        backend: f.backend,
        activity: 'stage-write',
      },
      () =>
        stampEntryMarkers({
          issueArg: String(f.context.issue),
          stateArg: 'test',
          resolvedFromState: 'develop',
          transitionId: createTransitionId(),
          cfg: { repo: f.context.repository },
          SKIP_NETWORK: false,
          _mutateBody: (input) =>
            mutateIssueBody({ ...input, deps: { pexec: f.pexec, revisionBackend: f.backend } }),
          postComment: async () => {},
        })
    );
    assert.equal(result.priorState, 'develop');
    assert.notEqual(f.backend.observation.body.bytes, before);
    assert.equal(f.effects.length, effects.length + 1);
  } finally {
    f.dispose();
  }
});
