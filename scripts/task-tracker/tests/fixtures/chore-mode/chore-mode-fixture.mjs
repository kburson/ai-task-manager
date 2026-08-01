// @story #1090
// Chore-mode feature fixture. The repository skeleton is immutable within a
// feature file; live state, transports, observations, and subprocess resources
// remain per test. A live fleet registry is intentionally never shared.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function freezeObject(value) {
  return Object.freeze(clone(value));
}

function statePath(root) {
  return path.join(root, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
}

function writeFixtureState(fixture) {
  mkdirSync(path.dirname(fixture.statePath), { recursive: true });
  writeFileSync(fixture.statePath, `${JSON.stringify({ choreMode: fixture.mutable.state })}\n`);
}

export function createChoreModeEnvironment(fixture, overrides = {}) {
  return {
    ...process.env,
    AI_TASK_MANAGER_PROJECT_DIR: fixture?.root,
    ...overrides,
  };
}

export function createChoreModeFixture({ state = {}, repository = {} } = {}) {
  const root = mkdtempProjectIsolated('chore-feature-');
  const fixture = {
    kind: 'chore-mode-feature-fixture',
    root,
    statePath: statePath(root),
    immutable: Object.freeze({
      initialState: freezeObject(state),
      repository: freezeObject(repository),
    }),
    mutable: {
      state: clone(state),
      observations: [],
      transports: [],
      environment: null,
    },
    destroyed: false,
  };
  fixture.mutable.environment = createChoreModeEnvironment(fixture);
  writeFixtureState(fixture);
  return fixture;
}

export function resetChoreModeFixture(fixture) {
  if (!fixture || fixture.kind !== 'chore-mode-feature-fixture' || fixture.destroyed) {
    throw new Error('resetChoreModeFixture requires a live chore-mode fixture');
  }
  fixture.mutable = {
    state: clone(fixture.immutable.initialState),
    observations: [],
    transports: [],
    environment: createChoreModeEnvironment(fixture),
  };
  writeFixtureState(fixture);
  return fixture;
}

export function destroyChoreModeFixture(fixture) {
  if (!fixture || fixture.kind !== 'chore-mode-feature-fixture' || fixture.destroyed) return false;
  rmSync(fixture.root, { recursive: true, force: true });
  fixture.destroyed = true;
  return !existsSync(fixture.root);
}
