// @story #666
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../../lib/work-lease/bind-orchestration.mjs', import.meta.url),
  'utf8'
);

test('fresh session adoption is owned by the governed acquire coordinator', () => {
  assert.match(source, /session\?\.lease \? 'resume' : 'acquire'/);
  assert.match(source, /coordinateWorkLeaseAcquire/);
});

test('cross-issue bind refuses pending atomic switch instead of entering a legacy switch path', () => {
  assert.match(source, /atomic work-lease switch is required/);
  assert.doesNotMatch(source, /verbSwitch|verbResumeLegacy/);
});
