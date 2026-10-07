// @story #1855
import { assert, execFileSync, nativeCheckboxFixture, test } from './native-continuation-fixtures.mjs';

test('native checkbox refuses changed HEAD despite caller read transport claiming original SHA', async () => {
  const { f, check } = await nativeCheckboxFixture('ac');
  try {
    const original = f.backend.snapshot.nativeProofRecords[0].execution.fingerprint.commitSha;
    execFileSync('git', ['commit', '--allow-empty', '-qm', 'Changed actual HEAD'], { cwd: f.projectDir, env: f.s.env });
    let fakeHeadReads = 0;
    await assert.rejects(check('checked', { pexec: async (bin, args, options) => {
      if (bin === 'git') { fakeHeadReads++; return { stdout: original }; }
      return f.pexec(bin, args, options);
    } }));
    assert.equal(fakeHeadReads, 0, 'proof eligibility reads actual native HEAD, never supplied transport');
    assert.equal(f.effects.filter(x => x === 'body-push').length, 1);
  } finally { f.dispose(); }
});
