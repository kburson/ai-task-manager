#!/usr/bin/env node
// @story #718
// `dod-stamp` already documents that it's a Test/Review-stage helper, not a
// state-walking verb (skill/shared/rules/state-walk.md). `ac-stamp`/`test`
// are the same category — evidence-minting/sandbox-verification helpers, not
// board-progression moves — but lacked the same carve-out sentence, forcing
// agents to independently re-derive that calling them directly is safe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stateWalkPath = path.resolve(__dirname, '../../../../skill/shared/rules/state-walk.md');
const stateWalk = readFileSync(stateWalkPath, 'utf8');

test('state-walk.md documents ac-stamp/test as Develop/Test-stage helpers, not state-walking verbs', () => {
  assert.match(
    stateWalk,
    /`\/task ac-stamp <label>` and `\/task test` are Develop\/Test-stage helpers, not state-walking verbs\./
  );
});

test('state-walk.md documents that ac-stamp/test do not advance the board on their own', () => {
  assert.match(
    stateWalk,
    /Neither advances the kanban board on its own the way `promote`\/`demote`\/`close` do\./
  );
});

console.log('state-walk-ac-stamp-test-carveout.test.mjs: ok');
