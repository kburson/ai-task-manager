// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { runTimingFieldUpdate } from '../../../../task-tracker/lib/timing-field-result.mjs';
const keys = ['engagedTime', 'sessionTime', 'reviewTime', 'planTime'];
const result = () => ({
  schema: 'aitm.timing-field-result/v1',
  status: 'incomplete',
  issue: 1857,
  repository: 'owner/repo',
  sourceCommentId: 'IC_timing',
  reasons: ['legacy-attribution-unknown'],
  knownEngagedSec: 120,
  values: Object.fromEntries(keys.map((key) => [key, null])),
  secondsByKey: Object.fromEntries(keys.map((key) => [key, null])),
  unknownFields: keys,
});
const stdout = (value) =>
  'Operator summary' + String.fromCharCode(10) + 'AITM_TIMING_RESULT ' + JSON.stringify(value);
test('runtime field update returns explicit incomplete result without treating it as network failure or zero', async () => {
  const expected = result();
  const actual = await runTimingFieldUpdate({
    issue: '#1857',
    repository: 'owner/repo',
    execute: async (command, args) => {
      assert.equal(command, process.execPath);
      assert.equal(args[1], '#1857');
      return { stdout: stdout(expected) };
    },
    log: () => {},
  });
  assert.deepEqual(actual, expected);
});
test('runtime projection validates identity, source, unknown fields and duplicate result records', async () => {
  for (const mutate of [
    (value) => {
      value.issue = 1858;
    },
    (value) => {
      value.repository = 'other/repo';
    },
    (value) => {
      value.sourceCommentId = '';
    },
    (value) => {
      value.unknownFields = [];
    },
    (value) => {
      value.values.engagedTime = 0;
    },
    (value) => {
      value.knownEngagedSec = -1;
    },
    (value) => {
      value.reasons = [];
    },
    (value) => {
      value.status = 'accepted';
    },
  ]) {
    const value = result();
    mutate(value);
    await assert.rejects(
      () =>
        runTimingFieldUpdate({
          issue: 1857,
          repository: 'owner/repo',
          execute: async () => ({ stdout: stdout(value) }),
          log: () => {},
        }),
      /timing-field-result/
    );
  }
  await assert.rejects(
    () =>
      runTimingFieldUpdate({
        issue: 1857,
        repository: 'owner/repo',
        execute: async () => ({
          stdout: stdout(result()) + String.fromCharCode(10) + stdout(result()),
        }),
        log: () => {},
      }),
    /timing-field-result/
  );
});
test('completed command without a structured projection stays unavailable instead of granting authority', async () => {
  assert.deepEqual(
    await runTimingFieldUpdate({
      issue: 1857,
      repository: 'owner/repo',
      execute: async () => ({ stdout: '' }),
      log: () => {},
    }),
    { status: 'unavailable', reason: 'projection-unreported' }
  );
});
test('actual child process or publication failure remains a loud failure', async () => {
  await assert.rejects(
    () =>
      runTimingFieldUpdate({
        issue: 1857,
        repository: 'owner/repo',
        execute: async () => {
          throw new Error('provider refused publication');
        },
        log: () => {},
      }),
    /provider refused publication/
  );
});
