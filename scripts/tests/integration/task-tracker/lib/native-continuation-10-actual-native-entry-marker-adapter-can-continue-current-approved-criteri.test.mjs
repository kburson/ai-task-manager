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

test('standalone entry marker adapter refuses without original native stage context', async () => {
  const f = await nativeFinalFixture();
  try {
    const first = await f.invoke();
    assert.equal(first.error, undefined);
    assert.equal(first.result.status, 'move-failed');
    const before = structuredClone(f.backend.snapshot);
    const calls = [];
    const effects = [...f.effects];
    await assert.rejects(
      withRevisionConsumer(
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
            _mutateBody: (input) => {
              calls.push('mutate');
              return mutateIssueBody({
                ...input,
                deps: { pexec: f.pexec, revisionBackend: f.backend },
              });
            },
            postComment: async () => {
              calls.push('comment');
            },
          })
      ),
      (error) =>
        error.name === 'RevisionPolicyError' &&
        error.code === 'revision-authority-unavailable' &&
        error.preparationReason === 'original-entry-context'
    );
    assert.deepEqual(calls, []);
    assert.deepEqual(f.backend.snapshot, before);
    assert.deepEqual(f.effects, effects);
  } finally {
    f.dispose();
  }
});
