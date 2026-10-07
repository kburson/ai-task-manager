// @story #1855
import { assert, createSandbox, currentSessionId, fixture, path, setActiveTask, test, verbCheck, verbEnsureChecked, verbEnsureUnchecked } from './native-continuation-fixtures.mjs';

for (const state of ['pending', 'stale', 'unavailable']) for (const [entry, invoke] of [
  ['checked', verbEnsureChecked], ['unchecked', verbEnsureUnchecked], ['alias', verbCheck],
]) test(`public native checkbox ${entry} refuses ${state} before transport`, async () => {
  const s = createSandbox();
  try {
    const projectDir = s.context.sourceRoot;
    const { backend, context } = await fixture(state, { worktree: projectDir });
    setActiveTask(currentSessionId(), { issue: `#${context.issue}` }, projectDir);
    const calls = [];
    await assert.rejects(invoke({ cfg: { repo: context.repository }, projectDir,
      statePath: path.join(projectDir, '.ai-task-manager/task-tracker-state.json'), rest: ['Supported model hooks'],
      deps: { revisionBackend: backend }, pexec: async () => { calls.push('transport'); throw new Error('unadmitted transport'); },
    }), error => error.code === ({ pending: 'revision-pending', stale: 'revision-approval-stale', unavailable: 'revision-authority-unavailable' })[state]);
    assert.deepEqual(calls, []);
  } finally { s.dispose(); }
});
