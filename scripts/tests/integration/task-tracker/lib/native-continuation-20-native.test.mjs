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
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-native-continuation-20-native';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(currentSessionId(), 'fixture-native-continuation-20-native');
  assert.match(currentSessionId(), /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/);
});
after(() => {
  if (originalFixtureSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = originalFixtureSid;
  if (originalFixtureApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = originalFixtureApp;
});

for (const kind of ['ac', 'dod'])
  test(`native ${kind} checkbox preserves proof across check uncheck recheck and restart`, async () => {
    const { f, check } = await nativeCheckboxFixture(kind);
    try {
      const originalProof = structuredClone(f.backend.snapshot.nativeProofRecords[0]);
      for (const desired of ['checked', 'unchecked', 'checked']) {
        await check(desired);
        f.restart();
        const state = await observeRevision({ context: f.context, deps: f.backend });
        assert.equal(state.status, 'applied', JSON.stringify(state));
        assert.equal(
          state.nativeIndividualProofs.length,
          1,
          'checkbox operation cannot become verifier witness'
        );
      }
      assert.deepEqual(f.backend.snapshot.nativeProofRecords[0], originalProof);
      assert.equal(f.backend.snapshot.nativeProofRecords.length, 4);
      const before = structuredClone(f.backend.snapshot),
        pushes = f.effects.filter((x) => x === 'body-push').length;
      await check('checked');
      assert.deepEqual(f.backend.snapshot, before);
      assert.equal(f.effects.filter((x) => x === 'body-push').length, pushes);
    } finally {
      f.dispose();
    }
  });
