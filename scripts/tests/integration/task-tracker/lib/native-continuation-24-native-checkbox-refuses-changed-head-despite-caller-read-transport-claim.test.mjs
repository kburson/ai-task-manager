// @story #1855
import {
  assert,
  execFileSync,
  nativeCheckboxFixture,
  test,
} from './native-continuation-fixtures.mjs';
import { before, after } from 'node:test';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';

const originalFixtureSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const originalFixtureApp = process.env.AI_TASK_MANAGER_APP_NAME;
before(() => {
  process.env.AI_TASK_MANAGER_SESSION_ID =
    'fixture-native-continuation-24-native-checkbox-refuses-changed-head-despite-caller-read-transport-claim';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(
    currentSessionId(),
    'fixture-native-continuation-24-native-checkbox-refuses-changed-head-despite-caller-read-transport-claim'
  );
  assert.match(currentSessionId(), /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/);
});
after(() => {
  if (originalFixtureSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = originalFixtureSid;
  if (originalFixtureApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = originalFixtureApp;
});

test('native checkbox refuses changed HEAD despite caller read transport claiming original SHA', async () => {
  const { f, check } = await nativeCheckboxFixture('ac');
  try {
    const original = f.backend.snapshot.nativeProofRecords[0].execution.fingerprint.commitSha;
    execFileSync('git', ['commit', '--allow-empty', '-qm', 'Changed actual HEAD'], {
      cwd: f.projectDir,
      env: f.s.env,
    });
    let fakeHeadReads = 0;
    await assert.rejects(
      check('checked', {
        pexec: async (bin, args, options) => {
          if (bin === 'git') {
            fakeHeadReads++;
            return { stdout: original };
          }
          return f.pexec(bin, args, options);
        },
      })
    );
    assert.equal(
      fakeHeadReads,
      0,
      'proof eligibility reads actual native HEAD, never supplied transport'
    );
    assert.equal(f.effects.filter((x) => x === 'body-push').length, 1);
  } finally {
    f.dispose();
  }
});
