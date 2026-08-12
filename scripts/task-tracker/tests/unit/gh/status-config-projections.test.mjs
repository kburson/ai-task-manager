// @story #1027
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATUS_CONFIG_KEYS } from '../../../../gh/lib/project-tether.mjs';
import { OPTION_KEYS } from '../../../../gh/init-repair.mjs';
import { stateConfigKey, stateIds } from '../../../lib/lifecycle-policy/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

test('GitHub status projections derive every state and config key from lifecycle policy', () => {
  const expectedStatusConfigKeys = Object.fromEntries(
    stateIds().map((state) => [state, stateConfigKey(state)])
  );
  const expectedOptionKeys = Object.fromEntries(
    stateIds().map((state) => [
      stateConfigKey(state),
      state === 'ready-for-plan' ? 'ready for planning' : state.replaceAll('-', ' '),
    ])
  );

  assert.deepEqual(STATUS_CONFIG_KEYS, expectedStatusConfigKeys);
  assert.deepEqual(OPTION_KEYS, expectedOptionKeys);
});

test('GitHub utilities do not retain literal complete state/config tables', () => {
  const tetherSource = readFileSync(path.join(ROOT, 'scripts/gh/lib/project-tether.mjs'), 'utf8');
  const repairSource = readFileSync(path.join(ROOT, 'scripts/gh/init-repair.mjs'), 'utf8');

  assert.doesNotMatch(tetherSource, /export const STATUS_CONFIG_KEYS\s*=\s*\{/);
  assert.doesNotMatch(repairSource, /const OPTION_KEYS\s*=\s*\{/);
});
