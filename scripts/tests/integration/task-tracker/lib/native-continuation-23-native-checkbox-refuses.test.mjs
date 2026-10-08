// @story #1855
import {
  assert,
  currentSessionId,
  nativeCheckboxFixture,
  observeRevision,
  path,
  setActiveTask,
  test,
  writeFileSync,
} from './native-continuation-fixtures.mjs';
import { before, after } from 'node:test';

const originalFixtureSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const originalFixtureApp = process.env.AI_TASK_MANAGER_APP_NAME;
before(() => {
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-native-continuation-23-native-checkbox-refuses';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(currentSessionId(), 'fixture-native-continuation-23-native-checkbox-refuses');
  assert.match(currentSessionId(), /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/);
});
after(() => {
  if (originalFixtureSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = originalFixtureSid;
  if (originalFixtureApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = originalFixtureApp;
});

for (const drift of ['source', 'paused binding'])
  test(`native checkbox refuses ${drift} changed after journal before body effect`, async () => {
    const { f, check } = await nativeCheckboxFixture('ac');
    try {
      let changed = false;
      const pexec = async (bin, args, options) => {
        if (
          !changed &&
          bin === 'gh' &&
          args[1] === 'view' &&
          f.backend.snapshot.nativeProofRecords.at(-1)?.execution.schema ===
            'aitm.native-checkbox-operation/v1'
        ) {
          changed = true;
          if (drift === 'source') writeFileSync(path.join(f.projectDir, 'source.txt'), 'changed\n');
          else
            setActiveTask(
              currentSessionId(),
              {
                issue: `#${f.context.issue}`,
                entryStartTs: new Date().toISOString(),
                worktreePath: f.projectDir,
                worktreeBranch: 'trunk',
                paused: true,
              },
              f.projectDir
            );
        }
        return f.pexec(bin, args, options);
      };
      await assert.rejects(check('checked', { pexec }));
      assert.equal(changed, true);
      assert.equal(f.effects.filter((x) => x === 'body-push').length, 1);
      assert.equal(
        (await observeRevision({ context: f.context, deps: f.backend })).status,
        'pending-native-proof'
      );
    } finally {
      f.dispose();
    }
  });
