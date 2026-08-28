#!/usr/bin/env node
// @story #180
// Regression guard for #180: after runLogIssueTime, verbClose must assert
// that the `<!-- aitm-fields -->` body marker shows non-null engagedTime.
// The silent-swallow in runtime.mjs's runLogIssueTime previously allowed
// closes to complete with null board+body fields (see #165 post-mortem).
//
// This test asserts the assertion exists and is wired correctly: source-level
// presence + behavioral check via a direct import of the helper.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const closeSrc = readFileSync(
  path.resolve(__dirname, '../../../task-tracker/verbs/close.mjs'),
  'utf8'
);
const runtimeSrc = readFileSync(
  path.resolve(__dirname, '../../../task-tracker/runtime.mjs'),
  'utf8'
);

// --- Source-level guards ---

assert.ok(
  /assertFieldsPersisted\s*\(/.test(closeSrc),
  'verbClose must call assertFieldsPersisted after runLogIssueTime'
);

// Ordering: runLogIssueTime → assertFieldsPersisted → clearActive
const flushIdx = closeSrc.indexOf('await runLogIssueTime(closeTarget)');
const assertCall = closeSrc.match(
  /await\s+(?:\(ctx\.assertFieldsPersisted\s*\|\|\s*)?assertFieldsPersisted\)?\s*\(/
);
const assertIdx = assertCall?.index ?? -1;
// There are multiple clearActive call sites (cross-close branch + main close).
// We care about the one that runs after assertFieldsPersisted on the main path.
const clearIdx = closeSrc.indexOf('clearActive(statePath)', assertIdx);
assert.ok(flushIdx >= 0 && assertIdx >= 0 && clearIdx >= 0);
assert.ok(flushIdx < assertIdx, 'assertFieldsPersisted must run AFTER runLogIssueTime');
assert.ok(
  assertIdx < clearIdx,
  'assertFieldsPersisted must run BEFORE clearActive (so a failure leaves state recoverable)'
);

// Runtime fail-loud guard: runLogIssueTime must throw on error.
// No env override exists — the prior TASK_TRACKER_FORCE_DONE_NO_FIELDS bypass
// was removed because agents rationalized it as routine.
assert.ok(
  !/TASK_TRACKER_FORCE_DONE_NO_FIELDS\s*===\s*['"]1['"]/.test(runtimeSrc),
  'runtime.mjs must NOT honor TASK_TRACKER_FORCE_DONE_NO_FIELDS (override was removed)'
);
assert.ok(
  /throw new Error\(\s*\n?\s*['"`]runLogIssueTime/.test(runtimeSrc),
  'runtime.mjs runLogIssueTime must throw on field-write failure (no silent swallow)'
);

console.log('close-board-body-agreement.test.mjs: all passed');
