#!/usr/bin/env node
// @story #309
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import {
  existingRuntimePath,
  getProjectDir,
  legacyPathFor,
  SHARED_DIR,
  TEMPLATES_SUBDIR,
  RUNTIME_REL,
  SHARED_DIR_SEGMENT,
  SCRATCH_REL_PREFIX,
  configPath,
  statePath,
  queuePath,
  pickupDirectivePath,
  dodPath,
  sessionsDir,
  locksDir,
  issueLockPath,
  timingLockPath,
  projectTmpDir,
  scratchDir,
  templatesDir,
  fleetPath,
  orchestratorLockPath,
} from '../../../../task-tracker/paths.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

{
  const ignore = readFileSync(path.join(repoRoot, '.gitignore'), 'utf8').split('\n');
  for (const obsolete of [
    'output/',
    '/reports/',
    'coverage/',
    '.aitm/test-timing.json',
    '.aitm/pool-bench.json',
  ]) {
    assert.equal(
      ignore.includes(obsolete),
      false,
      `obsolete root ignore rule removed: ${obsolete}`
    );
  }
  assert.equal(ignore.includes('.tmp/'), true, '.tmp remains the machine-local ignore boundary');
}

const mappings = [
  ['.ai-task-manager/task-tracker.json', '.claude/task-tracker.json'],
  ['.ai-task-manager/task-tracker-state.json', '.claude/task-tracker-state.json'],
  ['.ai-task-manager/task-tracker-queue.json', '.claude/task-tracker-queue.json'],
  ['.ai-task-manager/task-fleet.json', '.claude/task-fleet.json'],
  ['.ai-task-manager/templates/pickup-directive.md', '.claude/task-tracker/pickup-directive.md'],
  [
    '.ai-task-manager/templates/definition-of-done.md',
    '.claude/task-tracker/definition-of-done.md',
  ],
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

// --- #572: runtime-layout resolvers ------------------------------------------

// RUNTIME_REL strings are project-root-relative under SHARED_DIR.
assert.equal(RUNTIME_REL.config, `${SHARED_DIR}/task-tracker.json`);
assert.equal(RUNTIME_REL.state, `${SHARED_DIR}/task-tracker-state.json`);
assert.equal(RUNTIME_REL.queue, `${SHARED_DIR}/task-tracker-queue.json`);
assert.equal(RUNTIME_REL.fleet, `${SHARED_DIR}/task-fleet.json`);
assert.equal(RUNTIME_REL.orchestratorLock, `${SHARED_DIR}/orchestrator.lock`);
assert.equal(RUNTIME_REL.pickupDirective, `${SHARED_DIR}/${TEMPLATES_SUBDIR}/pickup-directive.md`);
assert.equal(RUNTIME_REL.dod, `${SHARED_DIR}/${TEMPLATES_SUBDIR}/definition-of-done.md`);

// Segment + scratch-prefix constants derive from SHARED_DIR.
assert.equal(SHARED_DIR_SEGMENT, `/${SHARED_DIR}/`);
assert.equal(SCRATCH_REL_PREFIX, '.scratch/');

// cwd-anchored resolvers join the project root byte-identically when no legacy
// twin exists on disk (the /tmp/proj-xyz tree has no `.claude` mirror).
// #573 — machine-local/transient runtime relocated under `.tmp/aitm/`. Config
// (task-tracker.json) and the shared scratch subtree remain tracked under
// SHARED_DIR; the markdown templates (pickup-directive.md, definition-of-done.md)
// remain tracked but moved under SHARED_DIR/templates/ (#574); everything else moves.
const TMP_AITM = ['.tmp', 'aitm'];
const PX = '/tmp/proj-xyz-572';
assert.equal(configPath(PX), path.join(PX, SHARED_DIR, 'task-tracker.json'));
assert.equal(statePath(PX), path.join(PX, ...TMP_AITM, 'state', 'task-tracker-state.json'));
assert.equal(queuePath(PX), path.join(PX, ...TMP_AITM, 'state', 'task-tracker-queue.json'));
assert.equal(
  pickupDirectivePath(PX),
  path.join(PX, SHARED_DIR, TEMPLATES_SUBDIR, 'pickup-directive.md')
);
assert.equal(dodPath(PX), path.join(PX, SHARED_DIR, TEMPLATES_SUBDIR, 'definition-of-done.md'));

// Directory resolvers: sessions/locks moved to `.tmp/aitm/`; scratch + templates stay tracked.
assert.equal(sessionsDir(PX), path.join(PX, ...TMP_AITM, 'sessions'));
assert.equal(locksDir(PX), path.join(PX, ...TMP_AITM, 'locks'));
assert.equal(projectTmpDir(PX), path.join(PX, '.scratch'));
assert.equal(scratchDir(PX), path.join(PX, '.scratch'));
assert.equal(templatesDir(PX), path.join(PX, SHARED_DIR, TEMPLATES_SUBDIR));

// Lock-file resolvers compose locksDir with the per-key filename.
assert.equal(issueLockPath(572, PX), path.join(PX, ...TMP_AITM, 'locks', 'issue-572.lock'));
assert.equal(timingLockPath('572', PX), path.join(PX, ...TMP_AITM, 'locks', 'timing-572.lock'));

// main-anchored resolvers join the supplied main worktree path. Relocated under
// `.tmp/aitm/fleet/`; the MAIN-worktree anchor is preserved (sibling worktrees
// share one registry/lock).
const MAIN = '/tmp/main-wt-572';
assert.equal(fleetPath(MAIN), path.join(MAIN, ...TMP_AITM, 'fleet', 'task-fleet.json'));
assert.equal(
  orchestratorLockPath(MAIN),
  path.join(MAIN, ...TMP_AITM, 'fleet', 'orchestrator.lock')
);

// cwd-anchored resolvers honor getProjectDir() default via env precedence.
{
  const prev = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  process.env.AI_TASK_MANAGER_PROJECT_DIR = PX;
  try {
    assert.equal(statePath(), path.join(PX, ...TMP_AITM, 'state', 'task-tracker-state.json'));
    assert.equal(locksDir(), path.join(PX, ...TMP_AITM, 'locks'));
  } finally {
    if (prev === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
    else process.env.AI_TASK_MANAGER_PROJECT_DIR = prev;
  }
}

console.log('paths.test.mjs: all passed');
