// @story #1855
import { assert, hashBytes, nativeCheckboxFixture, test } from './native-continuation-fixtures.mjs';
import { before, after } from 'node:test';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';

const originalFixtureSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const originalFixtureApp = process.env.AI_TASK_MANAGER_APP_NAME;
before(() => {
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-native-continuation-25-native-checkbox';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(currentSessionId(), 'fixture-native-continuation-25-native-checkbox');
  assert.match(currentSessionId(), /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/);
});
after(() => {
  if (originalFixtureSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = originalFixtureSid;
  if (originalFixtureApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = originalFixtureApp;
});

for (const pending of [false, true])
  for (const drift of [
    'source binding',
    'criterion text',
    'VC command',
    'DoD vc-list',
    'proof bytes',
    'foreign proof binding',
  ])
    test(`native checkbox ${pending ? 'retry' : 'new operation'} refuses authority ${drift}`, async () => {
      const { f, check } = await nativeCheckboxFixture('dod');
      try {
        if (pending) {
          f.backend.failAfter = 'native-proof-journal-readback';
          await assert.rejects(check('checked'));
          f.restart();
        }
        const observation = f.backend.observation;
        const before = JSON.stringify(observation);
        if (drift === 'source binding')
          observation.protectedSourceBindings[0].hash = hashBytes('foreign-source');
        if (drift === 'criterion text')
          observation.body.bytes = observation.body.bytes.replace(
            'Supported model hooks',
            'Changed supported hooks'
          );
        if (drift === 'VC command')
          observation.body.bytes = observation.body.bytes.replaceAll(
            'node --test supported-hook.test.mjs',
            'node --test independent.test.mjs'
          );
        if (drift === 'DoD vc-list')
          observation.body.bytes = observation.body.bytes.replace(
            /(Shared DoD[^\n]*?)vc-list="vc:1"/,
            '$1vc-list="vc:2"'
          );
        if (drift === 'proof bytes')
          observation.body.bytes = observation.body.bytes.replace('exit="0"', 'exit="1"');
        if (drift === 'foreign proof binding')
          observation.body.bytes = observation.body.bytes.replaceAll(
            'example/criteria',
            'foreign/criteria'
          );
        assert.notEqual(
          JSON.stringify(observation),
          before,
          'fixture must change actual authority data'
        );
        f.backend.replaceAuthority(observation);
        const pushes = f.effects.filter((x) => x === 'body-push').length,
          records = structuredClone(f.backend.snapshot.nativeProofRecords);
        await assert.rejects(check('checked'));
        assert.deepEqual(f.backend.snapshot.nativeProofRecords, records);
        assert.equal(f.effects.filter((x) => x === 'body-push').length, pushes);
      } finally {
        f.dispose();
      }
    });
