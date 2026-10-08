// @story #1855
import {
  assert,
  defaultProbeCompletion,
  fixture,
  test,
  withRevisionConsumer,
} from './native-continuation-fixtures.mjs';

test('native stage default completion probe refuses changed held authority across its await', async () => {
  const { backend, context } = await fixture('baseline', { worktree: process.cwd() });
  await assert.rejects(
    withRevisionConsumer(
      {
        repository: context.repository,
        issue: context.issue,
        activity: 'stage-write',
        backend,
        projectDir: context.executor.worktree,
      },
      () => {
        const reading = defaultProbeCompletion({
          cfg: { repo: context.repository },
          issueArg: String(context.issue),
          projectDir: context.executor.worktree,
          stateArg: 'test',
          resolvedFromState: 'develop',
        });
        const changed = backend.observation;
        changed.body.bytes += '\nChanged while probe awaited.\n';
        backend.replaceAuthority(changed);
        return reading;
      }
    ),
    (error) => error.code === 'revision-authority-unavailable'
  );
  assert.ok(backend.effects.every((effect) => /read|admission-deny/.test(effect)));
});
