// @story #1855
import { assert, currentSessionId, execFileSync, nativeFinalFixture, observeRevision, path, setActiveTask, test, writeFileSync } from './native-continuation-fixtures.mjs';

for (const drift of ['configuration', 'paused binding', 'new HEAD', 'dirty worktree'])
  test(`pending native final receipt refuses ${drift} before original effect`, async () => {
    const f = await nativeFinalFixture();
    try {
      f.backend.failAfter = 'native-proof-journal-readback';
      assert.match((await f.invoke()).error?.message ?? '', /interrupted/);
      f.restart();
      const original = structuredClone(f.backend.snapshot);
      const effects = [...f.effects];
      if (drift === 'configuration') writeFileSync(path.join(f.projectDir, '.ai-task-manager/task-tracker.json'),
        JSON.stringify({ repo: f.context.repository, developVerification: { iterationSteps: [] } }));
      if (drift === 'paused binding') setActiveTask(currentSessionId(), { issue: `#${f.context.issue}`,
        entryStartTs: new Date().toISOString(), paused: true, worktreePath: f.projectDir, worktreeBranch: 'trunk' }, f.projectDir);
      if (drift === 'new HEAD') execFileSync('git', ['commit', '--allow-empty', '-qm', 'Changed native execution HEAD'], { cwd: f.projectDir, env: f.s.env });
      if (drift === 'dirty worktree') writeFileSync(path.join(f.projectDir, 'source.txt'), 'changed\n');
      const refused = await f.invoke({ entryInterlock: true });
      assert.match(refused.error?.message ?? '', /native-final-/);
      assert.deepEqual(f.effects, effects);
      assert.deepEqual(f.backend.snapshot.nativeProofRecords, original.nativeProofRecords);
      assert.deepEqual(f.backend.snapshot.observation, original.observation);
      assert.equal((await observeRevision({ context: f.context, deps: f.backend })).status, 'pending-native-proof');
    } finally { f.dispose(); }
  });
