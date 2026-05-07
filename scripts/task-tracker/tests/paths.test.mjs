#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  existingRuntimePath,
  legacyPathFor,
} from '../paths.mjs';

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
  'leading ./ is normalized before mapping',
);

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-paths-'));
const preferred = '.ai-task-manager/task-tracker.json';
const legacy = '.claude/task-tracker.json';
const preferredAbs = path.join(tmp, preferred);
const legacyAbs = path.join(tmp, legacy);

mkdirSync(path.dirname(legacyAbs), { recursive: true });
writeFileSync(legacyAbs, '{}\n');
assert.equal(
  existingRuntimePath(tmp, preferred),
  legacyAbs,
  'legacy path is returned when preferred path is absent',
);

mkdirSync(path.dirname(preferredAbs), { recursive: true });
writeFileSync(preferredAbs, '{}\n');
assert.equal(
  existingRuntimePath(tmp, preferred),
  preferredAbs,
  'preferred path wins when both preferred and legacy files exist',
);

const missingPreferred = path.join(tmp, '.ai-task-manager/missing.json');
assert.equal(
  existingRuntimePath(tmp, '.ai-task-manager/missing.json'),
  missingPreferred,
  'unmapped paths return the preferred location',
);
assert.equal(existsSync(missingPreferred), false, 'unmapped paths are not created by lookup');

rmSync(tmp, { recursive: true });
console.log('paths.test.mjs: all passed');
