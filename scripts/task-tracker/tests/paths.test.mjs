#!/usr/bin/env node
// @story #309
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import path from 'node:path';
import { existingRuntimePath, getProjectDir, legacyPathFor } from '../paths.mjs';

const mappings = [
  ['.ai-task-manager/task-tracker.json', '.claude/task-tracker.json'],
  ['.ai-task-manager/task-tracker-state.json', '.claude/task-tracker-state.json'],
  ['.ai-task-manager/task-tracker-queue.json', '.claude/task-tracker-queue.json'],
  ['.ai-task-manager/task-fleet.json', '.claude/task-fleet.json'],
  ['.ai-task-manager/pickup-directive.md', '.claude/task-tracker/pickup-directive.md'],
  ['.ai-task-manager/definition-of-done.md', '.claude/task-tracker/definition-of-done.md'],
];

for (const [preferred, legacy] of mappings) {
  assert.equal(legacyPathFor(preferred), legacy, `${preferred} maps to ${legacy}`);
}

assert.equal(
  legacyPathFor('./.ai-task-manager/task-tracker.json'),
  '.claude/task-tracker.json',
  'leading ./ is normalized before mapping'
);

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-paths-'));
const preferred = '.ai-task-manager/task-tracker.json';
const legacy = '.claude/task-tracker.json';
const preferredAbs = path.join(tmp, preferred);
const legacyAbs = path.join(tmp, legacy);

mkdirSync(path.dirname(legacyAbs), { recursive: true });
writeFileSync(legacyAbs, '{}\n');
assert.equal(
  existingRuntimePath(tmp, preferred),
  legacyAbs,
  'legacy path is returned when preferred path is absent'
);

mkdirSync(path.dirname(preferredAbs), { recursive: true });
writeFileSync(preferredAbs, '{}\n');
assert.equal(
  existingRuntimePath(tmp, preferred),
  preferredAbs,
  'preferred path wins when both preferred and legacy files exist'
);

const missingPreferred = path.join(tmp, '.ai-task-manager/missing.json');
assert.equal(
  existingRuntimePath(tmp, '.ai-task-manager/missing.json'),
  missingPreferred,
  'unmapped paths return the preferred location'
);
assert.equal(existsSync(missingPreferred), false, 'unmapped paths are not created by lookup');

rmSync(tmp, { recursive: true });

// getProjectDir env-var precedence
assert.equal(
  getProjectDir({ AI_TASK_MANAGER_PROJECT_DIR: '/a', CLAUDE_PROJECT_DIR: '/b' }, '/c'),
  '/a',
  'AI_TASK_MANAGER_PROJECT_DIR wins'
);
assert.equal(
  getProjectDir({ CLAUDE_PROJECT_DIR: '/b' }, '/c'),
  '/b',
  'CLAUDE_PROJECT_DIR wins when AI_TASK_MANAGER_PROJECT_DIR unset'
);
assert.equal(getProjectDir({}, '/c'), '/c', 'falls back to cwd when env unset');
assert.equal(
  getProjectDir({ AI_TASK_MANAGER_PROJECT_DIR: '', CLAUDE_PROJECT_DIR: '' }, '/c'),
  '/c',
  'empty-string env values are treated as unset'
);

console.log('paths.test.mjs: all passed');
