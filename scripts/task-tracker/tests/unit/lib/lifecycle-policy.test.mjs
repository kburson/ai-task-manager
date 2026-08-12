// @story #1008
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  stateIds,
  stateIndex,
  stateConfigKey,
  forwardTarget,
  backwardTargets,
  validateExecutableTransition,
  validateTransition,
} from '../../../lib/lifecycle-policy/index.mjs';
import { EXECUTABLE_MATRIX } from '../../fixtures/state-engine-policy-baseline.mjs';

const EXPECTED_STATES = [
  'backlog',
  'refine',
  'ready-for-plan',
  'plan',
  'develop',
  'test',
  'review',
  'done',
];

const EXPECTED_CONFIG_KEYS = [
  'kanbanOptionBacklog',
  'kanbanOptionRefine',
  'kanbanOptionReadyForPlan',
  'kanbanOptionPlan',
  'kanbanOptionDevelop',
  'kanbanOptionTest',
  'kanbanOptionReview',
  'kanbanOptionDone',
];

test('state queries expose ordered identity and configuration metadata without a raw manifest', () => {
  const ids = stateIds();
  assert.deepEqual(ids, EXPECTED_STATES);
  assert.equal(Object.isFrozen(ids), true);

  for (const [index, state] of ids.entries()) {
    assert.equal(stateIndex(state), index);
    assert.equal(stateConfigKey(state), EXPECTED_CONFIG_KEYS[index]);
  }
  assert.equal(stateIndex('unknown'), -1);
  assert.equal(stateConfigKey('unknown'), undefined);
});

test('executable target queries expose only forward and runtime-walkable reverse edges', () => {
  assert.deepEqual(Object.fromEntries(stateIds().map((state) => [state, forwardTarget(state)])), {
    backlog: 'refine',
    refine: 'ready-for-plan',
    'ready-for-plan': 'plan',
    plan: 'develop',
    develop: 'test',
    test: 'review',
    review: 'done',
    done: undefined,
  });

  assert.deepEqual(backwardTargets('refine'), ['backlog']);
  assert.deepEqual(backwardTargets('ready-for-plan'), ['backlog']);
  assert.deepEqual(backwardTargets('plan'), ['backlog', 'ready-for-plan']);
  assert.deepEqual(backwardTargets('test'), ['develop']);
  assert.deepEqual(backwardTargets('review'), ['develop', 'test']);
  assert.deepEqual(backwardTargets('done'), []);
  assert.deepEqual(backwardTargets('unknown'), []);
  assert.equal(Object.isFrozen(backwardTargets('review')), true);
});

test('structured validation distinguishes allowed, noop, unknown, and refused outcomes', () => {
  assert.deepEqual(validateExecutableTransition('develop', 'test'), {
    ok: true,
    kind: 'allowed',
  });
  assert.deepEqual(validateExecutableTransition('test', 'test'), {
    ok: true,
    kind: 'noop',
    noop: true,
  });
  assert.deepEqual(validateExecutableTransition('missing', 'test'), {
    ok: false,
    kind: 'unknown-state',
    unknownState: 'missing',
    position: 'from',
    reason: 'unknown state: missing',
  });
  assert.deepEqual(validateExecutableTransition('test', 'missing'), {
    ok: false,
    kind: 'unknown-state',
    unknownState: 'missing',
    position: 'to',
    reason: 'unknown state: missing',
  });
  assert.deepEqual(validateExecutableTransition('test', 'backlog'), {
    ok: false,
    kind: 'refused',
    allowedTargets: ['review', 'develop'],
    reason: 'illegal transition: test → backlog. Allowed: review, develop.',
  });

  for (const result of [
    validateExecutableTransition('develop', 'test'),
    validateExecutableTransition('test', 'test'),
    validateExecutableTransition('missing', 'test'),
    validateExecutableTransition('test', 'backlog'),
  ]) {
    assert.equal(Object.isFrozen(result), true);
  }
  assert.equal(
    Object.isFrozen(validateExecutableTransition('test', 'backlog').allowedTargets),
    true
  );
});

test('canonical executable validation and the compatibility facade preserve the C1 8x8 matrix', () => {
  for (const [key, expected] of Object.entries(EXECUTABLE_MATRIX)) {
    const [from, to] = key.split('->');
    const canonical = validateExecutableTransition(from, to);
    assert.deepEqual(
      { allowed: canonical.ok, noop: canonical.noop === true },
      expected,
      `canonical ${key}`
    );

    const operational = validateTransition(from, to);
    assert.deepEqual(
      { allowed: operational.ok, noop: operational.noop === true },
      expected,
      `operational ${key}`
    );
  }
});

test('history-only analysis edges never become executable', () => {
  assert.equal(validateExecutableTransition('develop', 'plan').kind, 'refused');
  assert.equal(validateExecutableTransition('review', 'plan').kind, 'refused');
  assert.equal(validateExecutableTransition('done', 'plan').kind, 'refused');
  assert.equal(validateExecutableTransition('done', 'test').kind, 'refused');
});

test('lifecycle policy has a one-way, side-effect-free import boundary', async () => {
  const packageFiles = [
    '../../../lib/lifecycle-policy/states.mjs',
    '../../../lib/lifecycle-policy/executable-transitions.mjs',
    '../../../lib/lifecycle-policy/index.mjs',
  ];

  for (const relativePath of packageFiles) {
    const absolutePath = fileURLToPath(new URL(relativePath, import.meta.url));
    const source = await readFile(absolutePath, 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    assert.ok(
      imports.every((specifier) => specifier.startsWith('./')),
      `${relativePath} imports only sibling lifecycle-policy modules: ${imports.join(', ')}`
    );
    assert.doesNotMatch(source, /timing|phase-events|move-state|verbs\//);
  }
});

test('operational registries derive topology and config metadata from lifecycle policy', async () => {
  const movePolicySource = await readFile(
    fileURLToPath(new URL('../../../lib/move-state/policy.mjs', import.meta.url)),
    'utf8'
  );
  const stateObjectsSource = await readFile(
    fileURLToPath(new URL('../../../states/index.mjs', import.meta.url)),
    'utf8'
  );

  assert.match(movePolicySource, /lifecycle-policy\/index\.mjs/);
  assert.match(stateObjectsSource, /lifecycle-policy\/index\.mjs/);
});
