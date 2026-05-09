#!/usr/bin/env node
// Tests for the pure helpers in scripts/migrate/rename-status-2026-05.mjs.
// Covers rewriteOptions + rewriteJson + idempotency (the marker-based check
// that prevents the second run from clobbering the migrated kanbanOptionReview).

import { strict as assert } from 'node:assert';
import {
  rewriteOptions,
  rewriteJson,
  NAME_RENAMES,
  KEY_RENAMES,
  DEPRECATED_KEYS,
  TARGET_NAMES,
  TARGET_KANBAN_KEYS,
} from '../../migrate/rename-status-2026-05.mjs';

// rewriteOptions: pre-migration board → renamed in place, IDs preserved
{
  const before = [
    { id: 'A', name: 'Backlog', color: 'GRAY', description: '' },
    { id: 'B', name: 'Grooming', color: 'BLUE', description: '' },
    { id: 'C', name: 'Analysis', color: 'PURPLE', description: '' },
    { id: 'D', name: 'Development', color: 'YELLOW', description: '' },
    { id: 'E', name: 'Review', color: 'ORANGE', description: '' },
    { id: 'F', name: 'R4R', color: 'PURPLE', description: '' },
    { id: 'G', name: 'Done', color: 'GREEN', description: '' },
  ];
  const { changed, options } = rewriteOptions(before);
  assert.equal(changed, true);
  assert.deepEqual(options.map(o => o.name), TARGET_NAMES);
  // IDs preserved
  assert.deepEqual(options.map(o => o.id), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
}

// rewriteOptions: idempotent — second run on already-target names is a no-op
{
  const after = TARGET_NAMES.map((name, i) => ({ id: `ID_${i}`, name, color: 'GRAY', description: '' }));
  const { changed, options } = rewriteOptions(after);
  assert.equal(changed, false, 'already-migrated board should be no-op');
  assert.deepEqual(options.map(o => o.name), TARGET_NAMES);
}

// rewriteJson: pre-migration JSON → renamed keys, deprecated dropped
{
  const before = {
    repo: 'o/r',
    projectId: 'PVT_x',
    kanbanFieldId: 'F',
    kanbanOptionBacklog: 'OP_b',
    kanbanOptionReady: 'OP_ready',
    kanbanOptionInProgress: 'OP_ip',
    kanbanOptionInReview: 'OP_ir',
    kanbanOptionGrooming: 'OP_grm',
    kanbanOptionAnalysis: 'OP_anl',
    kanbanOptionReview: 'OP_rev',
    kanbanOptionR4R: 'OP_r4r',
    kanbanOptionDone: 'OP_done',
  };
  const { changed, json } = rewriteJson(before);
  assert.equal(changed, true);
  // Renames applied
  assert.equal(json.kanbanOptionGroom, 'OP_grm');
  assert.equal(json.kanbanOptionAnalyze, 'OP_anl');
  assert.equal(json.kanbanOptionValidate, 'OP_rev', 'old kanbanOptionReview value moves to Validate');
  assert.equal(json.kanbanOptionReview, 'OP_r4r', 'old R4R value becomes new kanbanOptionReview');
  // Old keys removed (except kanbanOptionReview, which is also a target — gets
  // repopulated by the kanbanOptionR4R → kanbanOptionReview rename in the same pass)
  for (const k of Object.keys(KEY_RENAMES)) {
    if (k === 'kanbanOptionReview') continue;
    assert.equal(k in json, false, `${k} should be removed`);
  }
  // Deprecated keys removed
  for (const k of DEPRECATED_KEYS) {
    assert.equal(k in json, false, `${k} should be removed`);
  }
  // Backlog/Done untouched
  assert.equal(json.kanbanOptionBacklog, 'OP_b');
  assert.equal(json.kanbanOptionDone, 'OP_done');
}

// rewriteJson: idempotent — already-migrated config is a no-op (the bug fix)
{
  const after = {
    repo: 'o/r',
    projectId: 'PVT_x',
    kanbanFieldId: 'F',
    kanbanOptionBacklog: 'OP_b',
    kanbanOptionGroom: 'OP_grm',
    kanbanOptionAnalyze: 'OP_anl',
    kanbanOptionDevelopment: 'OP_dev',
    kanbanOptionValidate: 'OP_val',
    kanbanOptionReview: 'OP_rev',  // post-migration value (was R4R)
    kanbanOptionDone: 'OP_done',
  };
  const { changed, json } = rewriteJson(after);
  assert.equal(changed, false, 'post-migration config should be a no-op');
  // kanbanOptionReview value must be preserved (not clobbered by Validate-rename)
  assert.equal(json.kanbanOptionReview, 'OP_rev');
  assert.equal(json.kanbanOptionValidate, 'OP_val');
}

// rewriteJson: partial state — post-migration markers AND a leftover deprecated key
// triggers a rewrite to clean up the deprecated key.
{
  const partial = {
    kanbanOptionBacklog: 'OP_b',
    kanbanOptionGroom: 'OP_grm',
    kanbanOptionAnalyze: 'OP_anl',
    kanbanOptionDevelopment: 'OP_dev',
    kanbanOptionValidate: 'OP_val',
    kanbanOptionReview: 'OP_rev',
    kanbanOptionDone: 'OP_done',
    kanbanOptionInProgress: 'STALE',  // leftover deprecated key
  };
  const { changed, json } = rewriteJson(partial);
  assert.equal(changed, true);
  assert.equal('kanbanOptionInProgress' in json, false);
  assert.equal(json.kanbanOptionReview, 'OP_rev', 'should not clobber post-migration kanbanOptionReview');
}

// TARGET_KANBAN_KEYS exposed for downstream callers
assert.deepEqual(TARGET_KANBAN_KEYS, [
  'kanbanOptionBacklog',
  'kanbanOptionGroom',
  'kanbanOptionAnalyze',
  'kanbanOptionDevelopment',
  'kanbanOptionValidate',
  'kanbanOptionReview',
  'kanbanOptionDone',
]);

// NAME_RENAMES sanity
assert.equal(NAME_RENAMES.Grooming, 'Groom');
assert.equal(NAME_RENAMES.Analysis, 'Analyze');
assert.equal(NAME_RENAMES.Review, 'Validate');
assert.equal(NAME_RENAMES.R4R, 'Review');

console.log('migrate-rename-status.test.mjs: all passed');
