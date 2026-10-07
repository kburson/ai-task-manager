// @story #1855
import { assert, createSandbox, currentSessionId, existsSync, fixture, path, postTimingEvent, readdirSync, runActorFlushJournal, saveMarker, saveState, test, withRevisionConsumer } from './native-continuation-fixtures.mjs';

for (const leaf of ['actor journal', 'phase timing', 'outer state', 'word cursor']) {
  test(`native memory stage denies ${leaf} before earliest host write or supplied transport`, async () => {
    const s = createSandbox();
    try {
      const projectDir = s.context.sourceRoot;
      const { backend, context } = await fixture('baseline', { worktree: projectDir });
      const root = path.join(projectDir, '.tmp/aitm/denied-stage-leaf');
      const calls = [];
      const identity = { provider: 'claude', sid: currentSessionId() };
      const run = () => {
        if (leaf === 'actor journal') return runActorFlushJournal({ file: path.join(root, 'actor.flush.json'), identity,
          publish: async () => { calls.push('publish'); return { ok: true }; }, commit: async () => { calls.push('commit'); } });
        if (leaf === 'phase timing') return postTimingEvent({ issueNumber: context.issue, repo: context.repository,
          row: '| native stage fixture row |', projDir: projectDir, deps: {
            findTimingComment: async () => { calls.push('find'); return null; },
            createTimingComment: async () => { calls.push('create'); return { id: 'fixture' }; },
          } });
        if (leaf === 'outer state') return saveState({ active: `#${context.issue}`, entryStartTs: new Date().toISOString() }, path.join(root, 'state.json'));
        return saveMarker(path.join(root, 'cursor.json'), 0, 0, `#${context.issue}`, 0, { identity });
      };
      const before = readdirSync(projectDir, { recursive: true }).sort();
      await assert.rejects(withRevisionConsumer({ repository: context.repository, issue: context.issue,
        activity: 'stage-write', backend, projectDir }, run), error => error.code === 'revision-authority-unavailable');
      assert.deepEqual(calls, []);
      assert.equal(existsSync(root), false);
      assert.deepEqual(readdirSync(projectDir, { recursive: true }).sort(), before);
    } finally { s.dispose(); }
  });
}
