#!/usr/bin/env node
// @story #833
// @story #1049
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verbSwitch } from '../../../verbs/switch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const switchPath = path.resolve(here, '..', '..', '..', 'verbs', 'switch.mjs');
const source = readFileSync(switchPath, 'utf8');

test('numeric bind adapter delegates to governed resume and contains no legacy mutation seam', () => {
  assert.match(source, /import\s*\{\s*verbResume\s*\}\s*from\s*['"]\.\/resume\.mjs['"]/);
  assert.match(source, /return\s+verbResume\(/);
  for (const forbidden of [
    'drainQueueIfAny',
    'flushActiveToGH',
    'finalizePauseForSwitch',
    'saveState',
    'saveMarker',
    'registerTask',
    'deregisterTask',
    'safePostTiming',
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${forbidden}\\b`));
  }
});

test('invalid numeric bind target refuses before authority or projection work', async () => {
  let authorityReads = 0;
  await assert.rejects(
    () =>
      verbSwitch(
        {
          getWorkLeaseStore: () => {
            authorityReads += 1;
            return {};
          },
        },
        '#0'
      ),
    /invalid issue ref/
  );
  assert.equal(authorityReads, 0);
});

test('numeric bind fails closed when governed authority is unavailable', async () => {
  await assert.rejects(() => verbSwitch({}, '#833'), /lazy work-lease authority/);
});
