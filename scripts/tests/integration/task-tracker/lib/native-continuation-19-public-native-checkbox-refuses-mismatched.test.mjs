// @story #1855
// cspell:words unadmitted
import {
  assert,
  currentSessionId,
  nativeFinalFixture,
  path,
  setActiveTask,
  test,
  verbEnsureChecked,
} from './native-continuation-fixtures.mjs';
import { before, after } from 'node:test';

const originalFixtureSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const originalFixtureApp = process.env.AI_TASK_MANAGER_APP_NAME;
before(() => {
  process.env.AI_TASK_MANAGER_SESSION_ID =
    'fixture-native-continuation-19-public-native-checkbox-refuses-mismatched';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(
    currentSessionId(),
    'fixture-native-continuation-19-public-native-checkbox-refuses-mismatched'
  );
  assert.match(currentSessionId(), /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/);
});
after(() => {
  if (originalFixtureSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = originalFixtureSid;
  if (originalFixtureApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = originalFixtureApp;
});

for (const scope of ['project', 'repository', 'active-issue'])
  test(`public native checkbox refuses mismatched ${scope} before transport`, async () => {
    const f = await nativeFinalFixture();
    try {
      const ctx = {
        cfg: { repo: f.context.repository },
        projectDir: f.projectDir,
        statePath: path.join(f.projectDir, '.ai-task-manager/task-tracker-state.json'),
        rest: ['Supported model hooks'],
        deps: { revisionBackend: f.backend },
      };
      if (scope === 'project') ctx.projectDir = path.dirname(f.projectDir);
      if (scope === 'repository') ctx.cfg.repo = 'foreign/criteria';
      if (scope === 'active-issue')
        setActiveTask(currentSessionId(), { issue: '#999' }, f.projectDir);
      const calls = [];
      ctx.pexec = async () => {
        calls.push('transport');
        throw new Error('unadmitted transport');
      };
      await assert.rejects(verbEnsureChecked(ctx), (error) =>
        ['revision-conflict', 'revision-authority-unavailable'].includes(error.code)
      );
      assert.deepEqual(calls, []);
    } finally {
      f.dispose();
    }
  });
