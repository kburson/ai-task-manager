// @story #1855
import {
  assert,
  nativeCheckboxFixture,
  observeRevision,
  test,
} from './native-continuation-fixtures.mjs';
import { before, after } from 'node:test';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';

const originalFixtureSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const originalFixtureApp = process.env.AI_TASK_MANAGER_APP_NAME;
before(() => {
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-native-continuation-21-native';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(currentSessionId(), 'fixture-native-continuation-21-native');
  assert.match(currentSessionId(), /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/);
});
after(() => {
  if (originalFixtureSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = originalFixtureSid;
  if (originalFixtureApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = originalFixtureApp;
});

for (const kind of ['ac', 'dod'])
  for (const prefix of ['journal-readback', 'before-write', 'after-write'])
    test(`native ${kind} checkbox resumes original ${prefix} after restart without duplicate proof`, async () => {
      const { f, check } = await nativeCheckboxFixture(kind);
      try {
        if (prefix === 'journal-readback') f.backend.failAfter = 'native-proof-journal-readback';
        else f.failTransport(prefix);
        await assert.rejects(check('checked'));
        const original = structuredClone(f.backend.snapshot.nativeProofRecords);
        f.restart();
        assert.equal(
          (await observeRevision({ context: f.context, deps: f.backend })).status,
          prefix === 'after-write' ? 'applied' : 'pending-native-proof'
        );
        await check('checked');
        assert.equal(
          (await observeRevision({ context: f.context, deps: f.backend })).status,
          'applied'
        );
        assert.deepEqual(f.backend.snapshot.nativeProofRecords, original);
        assert.equal(
          f.effects.filter((x) => x === 'body-push').length,
          2,
          'one proof stamp and one checkbox effect'
        );
        f.restart();
        await check('checked');
        assert.deepEqual(f.backend.snapshot.nativeProofRecords, original);
        assert.equal(f.effects.filter((x) => x === 'body-push').length, 2);
      } finally {
        f.dispose();
      }
    });
