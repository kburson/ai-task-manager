// @story #1855
import {
  assert,
  createRevisionMemory,
  defaultProbeCompletion,
  fixture,
  test,
  withRevisionConsumer,
} from './native-continuation-fixtures.mjs';

test('native stage default completion probe reads exact held body without a production transport', async () => {
  const original = await fixture('baseline', { worktree: process.cwd() });
  const snapshot = original.backend.snapshot;
  snapshot.observation.body.bytes +=
    '\n<!-- aitm-move-complete state=develop ts=2026-10-06T10:00:00.000Z move=prior-native-move -->\n';
  const backend = createRevisionMemory(snapshot),
    context = original.context;
  const result = await withRevisionConsumer(
    {
      repository: context.repository,
      issue: context.issue,
      activity: 'stage-write',
      backend,
      projectDir: context.executor.worktree,
    },
    () =>
      defaultProbeCompletion({
        cfg: { repo: context.repository },
        issueArg: String(context.issue),
        projectDir: context.executor.worktree,
        stateArg: 'test',
        resolvedFromState: 'develop',
      })
  );
  assert.equal(
    result.sentinelState,
    'develop',
    'the native probe must parse the actual held previous sentinel, not hide unavailable transport as empty body'
  );
  assert.equal(result.statusState, '');
  assert.equal(result.entryMarkerPresent, false);
  assert.equal(result.recoverablePartial, false);
  assert.deepEqual(backend.snapshot, snapshot);
});
