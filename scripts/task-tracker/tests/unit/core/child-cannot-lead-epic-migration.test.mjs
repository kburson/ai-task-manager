// @story #356
// #356 — asserts the child-cannot-lead-epic check has been migrated out of
// promote.mjs into the state-keyed exitGuards registry. Reads promote.mjs as
// text and confirms it no longer references `checkParentAdmission`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)) + '/..';
const promotePath = resolve(here, '..', '../verbs/promote.mjs');

test('promote.mjs does not invoke checkParentAdmission inline (#356)', async () => {
  const src = await readFile(promotePath, 'utf8');
  assert.ok(
    !src.includes('checkParentAdmission'),
    'promote.mjs still references checkParentAdmission — child-cannot-lead-epic check should live in the exitGuards registry, not inline.'
  );
});
