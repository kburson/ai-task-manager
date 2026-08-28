// @story #1381
import assert from 'node:assert/strict';
import test from 'node:test';

import { VERB_REFERENCE } from '../../../../task-tracker/verbs/help-data.mjs';

test('close help distinguishes Incorporated owner assertion from duplicate and incident-epic use', () => {
  assert.match(VERB_REFERENCE.close.usage, /incorporated/);
  const asFlag = VERB_REFERENCE.close.flags.find(({ flag }) => flag.startsWith('--as'));
  const ofFlag = VERB_REFERENCE.close.flags.find(({ flag }) => flag === '--of <N>');
  assert.match(asFlag.desc, /Incorporated/);
  assert.match(ofFlag.desc, /incident owner/);
  assert.ok(VERB_REFERENCE.close.examples.includes('/task close 1403 --as incorporated --of 1381'));
  assert.ok(VERB_REFERENCE.close.examples.includes('/task close 939 --of 1381'));
});
