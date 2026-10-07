// @story #1855
import { assert, fixture, runTestWithEntryInterlock, runVerbTest, test } from './native-continuation-fixtures.mjs';

for (const state of ['pending', 'stale', 'unavailable']) {
  for (const entry of ['runner', 'entry-interlock']) {
    test(`public native Test ${entry} refuses ${state} before injected effect callbacks`, async () => {
      const { backend, context } = await fixture(state, { worktree: process.cwd() });
      const effects = [];
      const input = { cfg: { repo: context.repository }, issueNumber: context.issue,
        projectDir: context.executor.worktree, deps: { revisionBackend: backend,
          fetchBody: async () => { effects.push('fetch'); throw new Error('unadmitted callback'); },
          acquireIssueLock: async (options, fn) => { effects.push('issue-lock'); return fn(); },
          runVerbTest: async () => { effects.push('execute'); return { status: 'injected' }; },
        } };
      const invoke = entry === 'runner' ? runVerbTest : runTestWithEntryInterlock;
      await assert.rejects(invoke(input), error => error.code === ({ pending: 'revision-pending',
        stale: 'revision-approval-stale', unavailable: 'revision-authority-unavailable' })[state]);
      assert.deepEqual(effects, []);
    });
  }
}
