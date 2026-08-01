// @story #1090
// Feature-file runner fixture. The git root and frozen configuration are safe
// to share inside one test file. Spawned children, observations, and environment
// objects remain per test and are reset explicitly by the caller's beforeEach.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

function frozenArray(value) {
  return Object.freeze(Array.isArray(value) ? value.slice() : []);
}

export function createRunnerEnvironment(overrides = {}) {
  return { ...process.env, ...overrides };
}

export function createRunnerFixture({ files = [], lanes = [], parallelSafety = {} } = {}) {
  // These cases never invoke git-root discovery, so a repository-shaped root is
  // sufficient and avoids paying for git init/add/commit in every test process.
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'runner-feature-'));
  writeFileSync(path.join(root, 'package.json'), '{}\n');
  writeFileSync(path.join(root, '.gitignore'), '*\n');
  return {
    kind: 'runner-feature-fixture',
    root,
    immutable: Object.freeze({
      files: frozenArray(files),
      lanes: frozenArray(lanes),
      parallelSafety: Object.freeze({ ...parallelSafety }),
    }),
    mutable: { observations: [], childProcesses: [], environment: createRunnerEnvironment() },
    destroyed: false,
  };
}

export function resetRunnerFixture(fixture) {
  if (!fixture || fixture.kind !== 'runner-feature-fixture' || fixture.destroyed) {
    throw new Error('resetRunnerFixture requires a live runner fixture');
  }
  fixture.mutable = {
    observations: [],
    childProcesses: [],
    environment: createRunnerEnvironment(),
  };
  return fixture;
}

export function destroyRunnerFixture(fixture) {
  if (!fixture || fixture.kind !== 'runner-feature-fixture' || fixture.destroyed) return false;
  rmSync(fixture.root, { recursive: true, force: true });
  fixture.destroyed = true;
  return !existsSync(fixture.root);
}
