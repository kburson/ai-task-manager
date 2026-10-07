// @story #1855
import { assert, postTimingEvent, test } from './native-continuation-fixtures.mjs';

test('native stage timing refuses accessor input before selecting any caller value', async () => {
  const { withMemoryStageEffectQuarantine } = await import('../../../../task-tracker/lib/criteria-revision/transport-quarantine.mjs');
  let reads = 0;
  const input = {};
  Object.defineProperty(input, 'row', { get() { reads++; return 'caller-row'; } });
  await assert.rejects(withMemoryStageEffectQuarantine(() => postTimingEvent(input)),
    error => error.code === 'revision-authority-unavailable');
  assert.equal(reads, 0, 'native membership precedes caller accessors');
});
