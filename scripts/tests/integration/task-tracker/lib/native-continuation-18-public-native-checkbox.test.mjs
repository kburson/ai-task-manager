// @story #1855
// cspell:words unadmitted
import {
  assert,
  createSandbox,
  currentSessionId,
  fixture,
  path,
  setActiveTask,
  test,
  verbCheck,
  verbEnsureChecked,
  verbEnsureUnchecked,
} from './native-continuation-fixtures.mjs';
import { before, after } from 'node:test';

const originalFixtureSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const originalFixtureApp = process.env.AI_TASK_MANAGER_APP_NAME;
before(() => {
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-native-continuation-18-public-native-checkbox';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(currentSessionId(), 'fixture-native-continuation-18-public-native-checkbox');
  assert.match(currentSessionId(), /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/);
});
after(() => {
  if (originalFixtureSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = originalFixtureSid;
  if (originalFixtureApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = originalFixtureApp;
});

for (const state of ['pending', 'stale', 'unavailable'])
  for (const [entry, invoke] of [
    ['checked', verbEnsureChecked],
    ['unchecked', verbEnsureUnchecked],
    ['alias', verbCheck],
  ])
    test(`public native checkbox ${entry} refuses ${state} before transport`, async () => {
      const s = createSandbox();
      try {
        const projectDir = s.context.sourceRoot;
        const { backend, context } = await fixture(state, { worktree: projectDir });
        setActiveTask(currentSessionId(), { issue: `#${context.issue}` }, projectDir);
        const calls = [];
        await assert.rejects(
          invoke({
            cfg: { repo: context.repository },
            projectDir,
            statePath: path.join(projectDir, '.ai-task-manager/task-tracker-state.json'),
            rest: ['Supported model hooks'],
            deps: { revisionBackend: backend },
            pexec: async () => {
              calls.push('transport');
              throw new Error('unadmitted transport');
            },
          }),
          (error) =>
            error.code ===
            {
              pending: 'revision-pending',
              stale: 'revision-approval-stale',
              unavailable: 'revision-authority-unavailable',
            }[state]
        );
        assert.deepEqual(calls, []);
      } finally {
        s.dispose();
      }
    });
