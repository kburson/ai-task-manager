#!/usr/bin/env node
// @story #1090
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

import {
  createRunnerEnvironment,
  createRunnerFixture,
  destroyRunnerFixture,
  resetRunnerFixture,
} from '../../fixtures/run-tests/runner-fixture.mjs';
import {
  createChoreModeEnvironment,
  createChoreModeFixture,
  destroyChoreModeFixture,
  resetChoreModeFixture,
} from '../../fixtures/chore-mode/chore-mode-fixture.mjs';

test('two runner fixtures coexist with immutable setup and isolated mutable observations', () => {
  const first = createRunnerFixture({ files: ['a.test.mjs'], lanes: ['unit'] });
  const second = createRunnerFixture({ files: ['b.test.mjs'], lanes: ['slow'] });
  try {
    assert.notEqual(first.root, second.root);
    assert.ok(Object.isFrozen(first.immutable));
    assert.ok(Object.isFrozen(first.immutable.files));
    assert.throws(() => first.immutable.files.push('nope.test.mjs'), TypeError);
    first.mutable.observations.push('first-only');
    assert.deepEqual(second.mutable.observations, []);
    resetRunnerFixture(first);
    assert.deepEqual(first.mutable.observations, []);
    assert.deepEqual(second.immutable.files, ['b.test.mjs']);
  } finally {
    destroyRunnerFixture(first);
    destroyRunnerFixture(second);
  }
});

test('runner subprocess environments are fresh and never mutate process.env', () => {
  const before = process.env.AITM_FEATURE_FIXTURE_TEST;
  const one = createRunnerEnvironment({ AITM_FEATURE_FIXTURE_TEST: 'one' });
  const two = createRunnerEnvironment({ AITM_FEATURE_FIXTURE_TEST: 'two' });
  assert.notEqual(one, two);
  assert.equal(one.AITM_FEATURE_FIXTURE_TEST, 'one');
  assert.equal(two.AITM_FEATURE_FIXTURE_TEST, 'two');
  assert.equal(process.env.AITM_FEATURE_FIXTURE_TEST, before);
});

test('two chore-mode fixtures isolate repositories, state, environments, and reset', () => {
  const first = createChoreModeFixture({
    state: { active: true },
    repository: { branch: 'trunk' },
  });
  const second = createChoreModeFixture({
    state: { active: false },
    repository: { branch: 'other' },
  });
  try {
    assert.notEqual(first.root, second.root);
    assert.ok(Object.isFrozen(first.immutable.repository));
    first.mutable.state.active = false;
    first.mutable.observations.push('changed');
    resetChoreModeFixture(first);
    assert.equal(first.mutable.state.active, true);
    assert.deepEqual(first.mutable.observations, []);
    assert.equal(second.mutable.state.active, false);
    assert.equal(second.immutable.repository.branch, 'other');
    assert.notEqual(createChoreModeEnvironment(first), createChoreModeEnvironment(first));
  } finally {
    destroyChoreModeFixture(first);
    destroyChoreModeFixture(second);
  }
});

test('feature fixture teardown is idempotent and removes only owned roots', () => {
  const runner = createRunnerFixture({ files: [], lanes: [] });
  const chore = createChoreModeFixture({ state: {}, repository: {} });
  const runnerRoot = runner.root;
  const choreRoot = chore.root;
  assert.equal(destroyRunnerFixture(runner), true);
  assert.equal(destroyRunnerFixture(runner), false);
  assert.equal(destroyChoreModeFixture(chore), true);
  assert.equal(destroyChoreModeFixture(chore), false);
  assert.equal(existsSync(runnerRoot), false);
  assert.equal(existsSync(choreRoot), false);
});
