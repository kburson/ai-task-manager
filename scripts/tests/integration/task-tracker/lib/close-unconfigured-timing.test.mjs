// @story #2007
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readDeliveredCloseTransactions } from '../../../../task-tracker/lib/close-convergence.mjs';

function close(scenario) {
  const child = spawnSync(
    process.execPath,
    [
      '--experimental-test-module-mocks',
      fileURLToPath(new URL('../../../helpers/2007-close-timing-harness.mjs', import.meta.url)),
      scenario,
    ],
    { encoding: 'utf8', timeout: 30_000 }
  );
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const output = child.stdout.split('\n').find((line) => line.startsWith('RESULT:'));
  assert.ok(output, child.stdout);
  return JSON.parse(output.slice('RESULT:'.length));
}

test('default Close without a rubric writes a canonical incomplete outcome and preserves Unknown', () => {
  const result = close('incomplete');
  assert.equal(result.error, null, result.error);
  assert.equal(result.exitCode, 1, result.stderr);
  assert.ok(result.stderr.includes('projectFunctionalDod: head is required'));
  assert.equal(result.calls.issueCloses, 0);
  assert.equal(result.calls.movesToDone.length, 0);
  assert.deepEqual(readDeliveredCloseTransactions(result.body)[0].completedSteps.slice(0, 2), [
    'timing',
    'estimation',
  ]);
  assert.equal(result.records.length, 1);
  const outcome = result.records[0].envelope.payload;
  assert.equal(outcome.forecastRecordId, null);
  assert.equal(outcome.telemetry.forecastStatus, 'legacy-none');
  assert.equal(outcome.telemetry.verificationSha, 'a'.repeat(40));
  assert.equal(outcome.actual.engagedHours, null);
  assert.ok(result.sourceReads >= 2);
  for (const name of ['engagedTime', 'sessionTime', 'reviewTime', 'planTime']) {
    assert.ok(result.body.includes('"' + name + '":null'));
  }
  assert.ok(result.timingBody.includes('Unknown | Unknown'));
});

for (const [scenario, expected] of [
  ['missing-source', new RegExp('timing-source')],
  ['stale-source', new RegExp('estimation-record:telemetry-source-lineage')],
  ['conflicting-forecast', new RegExp('forecast-lineage')],
  ['missing-test', new RegExp('close-delivery-receipt:head-mismatch')],
  ['stale-delivery', new RegExp('delivered-close-transaction-accepted-sha-mismatch')],
  ['missing-projection', new RegExp('engagedTime is still null')],
]) {
  test('unconfigured Close still refuses ' + scenario, () => {
    const result = close(scenario);
    assert.match([result.error, result.stderr].filter(Boolean).join('\n'), expected);
    assert.equal(result.calls.issueCloses, 0);
    assert.equal(result.calls.movesToDone.length, 0);
  });
}

test('complete legacy timing without a rubric does not create an outcome', () => {
  const result = close('complete');
  assert.equal(result.error, null, result.error);
  assert.equal(result.exitCode, 1, result.stderr);
  assert.ok(result.stderr.includes('projectFunctionalDod: head is required'));
  assert.equal(result.calls.issueCloses, 0);
  assert.equal(result.records.length, 0);
  assert.equal(result.sourceReads, 0);
});

for (const scenario of ['retry-stale-source', 'retry-after-estimation-stale-source']) {
  test('resuming incomplete timing revalidates the canonical source: ' + scenario, () => {
    const result = close(scenario);
    assert.ok(result.seeded.body.includes('aitm-delivered-close'));
    assert.equal(result.records.length, 1);
    assert.match(
      [result.error, result.stderr].filter(Boolean).join('\n'),
      new RegExp('estimation-record:telemetry-source-lineage')
    );
    assert.equal(result.calls.logIssueTime, 0);
    assert.equal(result.calls.issueCloses, 0);
    assert.equal(result.calls.movesToDone.length, 0);
    assert.ok(result.sourceReads > result.seedSourceReads);
  });
}
test('resuming valid incomplete timing reuses its canonical outcome without duplicating timing', () => {
  const result = close('retry-valid');
  assert.equal(result.error, null, result.error);
  assert.equal(result.records.length, 1);
  assert.equal(result.calls.logIssueTime, 0);
  assert.deepEqual(readDeliveredCloseTransactions(result.body)[0].completedSteps.slice(0, 2), [
    'timing',
    'estimation',
  ]);
  assert.ok(result.sourceReads > result.seedSourceReads);
});

test('a resumed timing checkpoint refuses missing persisted timing fields', () => {
  const result = close('retry-missing-fields');
  assert.ok(result.error.includes('close-estimation-timing-fields:missing'));
  assert.equal(result.calls.logIssueTime, 0);
  assert.equal(result.calls.issueCloses, 0);
  assert.equal(result.calls.movesToDone.length, 0);
});
test('legacy closed-issue recovery revalidates the existing incomplete outcome source', () => {
  const result = close('legacy-closed-stale-source');
  assert.match(
    [result.error, result.stderr].filter(Boolean).join('\n'),
    new RegExp('estimation-record:telemetry-source-lineage')
  );
  assert.equal(result.records.length, 1);
  assert.equal(result.calls.issueCloses, 0);
  assert.equal(result.calls.movesToDone.length, 0);
  assert.ok(result.sourceReads > result.seedSourceReads);
});
