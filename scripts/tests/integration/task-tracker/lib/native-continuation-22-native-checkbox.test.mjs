// @story #1855
import {
  assert,
  currentSessionId,
  execFileSync,
  nativeCheckboxFixture,
  observeRevision,
  path,
  setActiveTask,
  test,
  writeFileSync,
} from './native-continuation-fixtures.mjs';

for (const pending of [false, true])
  for (const drift of [
    'dirty source',
    'new HEAD',
    'configuration',
    'paused binding',
    'foreign binding',
  ])
    test(`native checkbox ${pending ? 'retry' : 'new operation'} refuses current ${drift}`, async () => {
      const { f, check } = await nativeCheckboxFixture('ac');
      try {
        if (pending) {
          f.backend.failAfter = 'native-proof-journal-readback';
          await assert.rejects(check('checked'));
          f.restart();
          assert.equal(
            (await observeRevision({ context: f.context, deps: f.backend })).status,
            'pending-native-proof'
          );
        }
        const original = structuredClone(f.backend.snapshot),
          pushes = f.effects.filter((x) => x === 'body-push').length;
        if (drift === 'dirty source')
          writeFileSync(path.join(f.projectDir, 'source.txt'), 'changed\n');
        if (drift === 'new HEAD')
          execFileSync('git', ['commit', '--allow-empty', '-qm', 'New native context'], {
            cwd: f.projectDir,
            env: f.s.env,
          });
        if (drift === 'configuration')
          writeFileSync(
            path.join(f.projectDir, 'package.json'),
            JSON.stringify({ name: 'changed', version: '2.0.0' })
          );
        if (drift === 'paused binding' || drift === 'foreign binding')
          setActiveTask(
            currentSessionId(),
            {
              issue: `#${f.context.issue}`,
              entryStartTs: new Date().toISOString(),
              paused: drift === 'paused binding',
              worktreePath: f.projectDir,
              worktreeBranch: drift === 'foreign binding' ? 'foreign-branch' : 'trunk',
            },
            f.projectDir
          );
        await assert.rejects(check('checked'));
        assert.deepEqual(f.backend.snapshot.nativeProofRecords, original.nativeProofRecords);
        assert.deepEqual(f.backend.observation, original.observation);
        assert.equal(f.effects.filter((x) => x === 'body-push').length, pushes);
      } finally {
        f.dispose();
      }
    });
