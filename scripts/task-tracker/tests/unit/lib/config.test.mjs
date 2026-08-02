#!/usr/bin/env node
// @story #309
import { strict as assert } from 'node:assert';
import { writeFileSync, mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { loadConfig, setConfigValue, DEFAULTS } from '../../../config.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-config-'));
const projectPath = path.join(tmp, 'project.json');
const legacyProjectPath = path.join(tmp, 'legacy-project.json');
const userPath = path.join(tmp, 'user.json');
const legacyUserPath = path.join(tmp, 'legacy-user.json');

// Test 1: defaults when no files exist
let cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.wpm, 180, 'default wpm');
assert.equal(cfg.repo, '', 'default repo is empty (set by init)');
assert.equal(cfg._sources.wpm, 'default');

// Test 2: user-global overrides default
writeFileSync(userPath, JSON.stringify({ wpm: 200 }));
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.wpm, 200);
assert.equal(cfg._sources.wpm, 'user');

// Test 3: project-local overrides user-global
writeFileSync(projectPath, JSON.stringify({ wpm: 150 }));
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.wpm, 150);
assert.equal(cfg._sources.wpm, 'project');

// Test 4: setConfigValue writes project-local
setConfigValue('wpm', '175', { projectPath, userPath });
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.wpm, 175);

// Test 5: type coercion
setConfigValue('autoEndOnSwitch', 'false', { projectPath, userPath });
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.autoEndOnSwitch, false);

// Test 6: unknown key rejected
assert.throws(() => setConfigValue('bogus', 'x', { projectPath, userPath }), /unknown config key/i);

// Test 7: bad type rejected
assert.throws(() => setConfigValue('wpm', 'abc', { projectPath, userPath }), /numeric/i);

// Test 8: preferred project path wins over legacy fallback
writeFileSync(legacyProjectPath, JSON.stringify({ repo: 'legacy/repo' }));
writeFileSync(projectPath, JSON.stringify({ repo: 'new/repo' }));
cfg = loadConfig({ projectPath, legacyProjectPath, userPath, legacyUserPath });
assert.equal(cfg.repo, 'new/repo');

// Test 9: legacy project is read when preferred path is absent
const fallbackProjectPath = path.join(tmp, 'missing-project.json');
cfg = loadConfig({ projectPath: fallbackProjectPath, legacyProjectPath, userPath, legacyUserPath });
assert.equal(cfg.repo, 'legacy/repo');

// Test 10: writes go to preferred project path, not legacy
const writeProjectPath = path.join(tmp, '.ai-task-manager', 'task-tracker.json');
const writeLegacyPath = path.join(tmp, '.claude', 'task-tracker.json');
mkdirSync(path.dirname(writeLegacyPath), { recursive: true });
writeFileSync(writeLegacyPath, JSON.stringify({ wpm: 111 }));
setConfigValue('wpm', '222', { projectPath: writeProjectPath, legacyProjectPath: writeLegacyPath });
assert.ok(existsSync(writeProjectPath), 'preferred config path should be written');
cfg = loadConfig({
  projectPath: writeProjectPath,
  legacyProjectPath: writeLegacyPath,
  userPath,
  legacyUserPath,
});
assert.equal(cfg.wpm, 222);

// Test 11: sizeFieldId survives loadConfig
writeFileSync(projectPath, JSON.stringify({ sizeFieldId: 'SIZE_FIELD_TOP' }));
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.sizeFieldId, 'SIZE_FIELD_TOP');

// Test 12: fieldIds.size falls back into sizeFieldId
writeFileSync(projectPath, JSON.stringify({ fieldIds: { size: 'SIZE_FIELD_FROM_MAP' } }));
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.sizeFieldId, 'SIZE_FIELD_FROM_MAP');

// Test 13: reviewPauseThresholdMin default + override
writeFileSync(projectPath, JSON.stringify({}));
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.reviewPauseThresholdMin, 5, 'default review threshold is 5 min');
assert.equal(DEFAULTS.reviewPauseThresholdMin, 5);
setConfigValue('reviewPauseThresholdMin', '10', { projectPath, userPath });
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.reviewPauseThresholdMin, 10);
assert.equal(cfg._sources.reviewPauseThresholdMin, 'project');

// Test 14 (#212): sessionRetentionDays default + integer coercion
writeFileSync(projectPath, JSON.stringify({}));
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.sessionRetentionDays, 2, 'default sessionRetentionDays is 2');
assert.equal(DEFAULTS.sessionRetentionDays, 2);
setConfigValue('sessionRetentionDays', '7', { projectPath, userPath });
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.sessionRetentionDays, 7);
assert.throws(
  () => setConfigValue('sessionRetentionDays', '2.5', { projectPath, userPath }),
  /integer/i,
  'non-integer must be rejected'
);
assert.throws(
  () => setConfigValue('sessionRetentionDays', 'abc', { projectPath, userPath }),
  /integer/i
);

// Test 15 (#212): pauseThresholdSeconds default + integer coercion
writeFileSync(projectPath, JSON.stringify({}));
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.pauseThresholdSeconds, 30, 'default pauseThresholdSeconds is 30');
assert.equal(DEFAULTS.pauseThresholdSeconds, 30);
setConfigValue('pauseThresholdSeconds', '60', { projectPath, userPath });
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.pauseThresholdSeconds, 60);
assert.throws(
  () => setConfigValue('pauseThresholdSeconds', '1.5', { projectPath, userPath }),
  /integer/i
);

// Test 16 (#486): discussLabel default + project override
writeFileSync(projectPath, JSON.stringify({}));
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.discussLabel, 'Discuss', 'default discussLabel is "Discuss"');
assert.equal(DEFAULTS.discussLabel, 'Discuss');
setConfigValue('discussLabel', 'Needs Discussion', { projectPath, userPath });
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.discussLabel, 'Needs Discussion', 'project override wins');
assert.equal(cfg._sources.discussLabel, 'project');

// Test 17 (#490): priorityOptionP3 survives loadConfig (defaults, schema, allow-list)
assert.equal(DEFAULTS.priorityOptionP3, '', 'priorityOptionP3 is a known default key');
writeFileSync(projectPath, JSON.stringify({ priorityOptionP3: 'P3_OPTION_ID' }));
cfg = loadConfig({ projectPath, userPath });
assert.equal(
  cfg.priorityOptionP3,
  'P3_OPTION_ID',
  'configured priorityOptionP3 must survive loadConfig (not be dropped by the allow-list)'
);

// Test 18 (#968): trunkRef survives loadConfig (was silently dropped pre-#968)
assert.equal(DEFAULTS.trunkRef, '', 'trunkRef is a known default key');
writeFileSync(projectPath, JSON.stringify({ trunkRef: 'origin/trunk' }));
cfg = loadConfig({ projectPath, userPath });
assert.equal(
  cfg.trunkRef,
  'origin/trunk',
  'configured trunkRef must survive loadConfig (not be dropped by the allow-list)'
);

// Test 19 (#1091): governed estimation rubric issue survives load and rejects negatives/fractions
assert.equal(DEFAULTS.estimationRubricIssue, 0, 'estimation rubric is unconfigured by default');
setConfigValue('estimationRubricIssue', '1091', { projectPath, userPath });
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.estimationRubricIssue, 1091);
setConfigValue('estimationRubricIssue', '0', { projectPath, userPath });
assert.equal(loadConfig({ projectPath, userPath }).estimationRubricIssue, 0);
assert.throws(
  () => setConfigValue('estimationRubricIssue', '-1', { projectPath, userPath }),
  /zero or a positive integer/i
);
assert.throws(
  () => setConfigValue('estimationRubricIssue', '1.5', { projectPath, userPath }),
  /zero or a positive integer/i
);

rmSync(tmp, { recursive: true });
console.log('config.test.mjs: all passed');
