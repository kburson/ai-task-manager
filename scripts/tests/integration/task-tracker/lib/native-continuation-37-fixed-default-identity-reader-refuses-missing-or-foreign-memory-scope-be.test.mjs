// @story #1855
import {
  assert,
  nativeFinalFixture,
  test,
  withRevisionConsumer,
} from './native-continuation-fixtures.mjs';

test('fixed default identity reader refuses missing or foreign memory scope before transport', async () => {
  const f = await nativeFinalFixture();
  try {
    const { defaultFetchCurrentUser } =
      await import('../../../../task-tracker/lib/assignee-guard.mjs');
    for (const activity of ['stage-write', 'body-write']) {
      const before = f.backend.snapshot;
      await assert.rejects(
        withRevisionConsumer(
          {
            repository: f.context.repository,
            issue: f.context.issue,
            activity,
            backend: f.backend,
            projectDir: f.projectDir,
          },
          () => defaultFetchCurrentUser()
        ),
        (error) => error.code === 'revision-authority-unavailable'
      );
      assert.deepEqual(f.backend.snapshot, before);
    }
  } finally {
    f.dispose();
  }
});
