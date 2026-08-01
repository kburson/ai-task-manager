// @story #1089
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import { selectAffectedTests } from '../../../lib/test-impact-selector.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const FIXTURE = 'scripts/task-tracker/tests/fixtures/test-impact';
const fixturePath = (relative) => `${FIXTURE}/${relative}`;
const DISCOVERED = [
  fixturePath('tests/direct.spec.mjs'),
  fixturePath('tests/transitive.spec.mjs'),
  fixturePath('tests/fixture-consumer.spec.mjs'),
  fixturePath('tests/dynamic.spec.mjs'),
  fixturePath('tests/untracked.spec.mjs'),
  'scripts/task-tracker/tests/unit/lib/name.test.mjs',
];

function select(changedPaths, manifest = { schema: 1, rules: [] }, discoveredTests = DISCOVERED) {
  return selectAffectedTests({ projectDir: ROOT, changedPaths, manifest, discoveredTests });
}

function signals(result, testPath) {
  return result.reasons
    .filter((entry) => entry.test === testPath)
    .map(({ signal }) => signal)
    .sort();
}

describe('hybrid affected-test selection', () => {
  test('selects direct and transitive static-import consumers with explanations', () => {
    const result = select([fixturePath('lib/source.mjs')]);
    assert.deepEqual(result.tests, [
      fixturePath('tests/direct.spec.mjs'),
      fixturePath('tests/transitive.spec.mjs'),
    ]);
    assert.deepEqual(signals(result, fixturePath('tests/direct.spec.mjs')), ['import-direct']);
    assert.deepEqual(signals(result, fixturePath('tests/transitive.spec.mjs')), [
      'import-transitive',
    ]);
  });

  test('always includes changed and newly discovered tests', () => {
    const changed = fixturePath('tests/direct.spec.mjs');
    const untracked = fixturePath('tests/untracked.spec.mjs');
    const result = select([changed, untracked]);
    assert.ok(result.tests.includes(changed));
    assert.ok(result.tests.includes(untracked));
    assert.ok(signals(result, changed).includes('changed-test'));
    assert.ok(signals(result, untracked).includes('changed-test'));
  });

  test('maps changed fixture helpers through the import graph', () => {
    const result = select([fixturePath('fixtures/shared-helper.mjs')]);
    const consumer = fixturePath('tests/fixture-consumer.spec.mjs');
    assert.deepEqual(result.tests, [consumer]);
    assert.deepEqual(signals(result, consumer), ['import-direct']);
  });

  test('keeps the basename mapper as a compatibility signal', () => {
    const result = select([fixturePath('lib/name.mjs')]);
    const conventional = 'scripts/task-tracker/tests/unit/lib/name.test.mjs';
    assert.ok(result.tests.includes(conventional));
    assert.ok(signals(result, conventional).includes('basename'));
  });

  test('expands manifest globs and retains duplicate selection reasons', () => {
    const changed = fixturePath('lib/dynamic-target.mjs');
    const manifest = {
      schema: 1,
      rules: [
        {
          sources: [fixturePath('lib/dynamic-*.mjs')],
          tests: [fixturePath('tests/*.spec.mjs')],
          reason: 'CLI subprocess dependency is not visible through static imports',
        },
        {
          sources: [changed],
          tests: [fixturePath('tests/dynamic.spec.mjs')],
          reason: 'dynamic import target',
        },
      ],
    };
    const result = select([changed], manifest);
    assert.equal(new Set(result.tests).size, result.tests.length);
    assert.equal(signals(result, fixturePath('tests/dynamic.spec.mjs')).length, 2);
    assert.ok(result.reasons.every(({ reason }) => reason.length > 0));
  });

  test('lane escalation selects complete declared lanes conservatively', () => {
    const discovered = [
      'scripts/task-tracker/tests/unit/lib/unit-a.test.mjs',
      'scripts/task-tracker/tests/integration/integration-a.test.mjs',
      'scripts/task-tracker/tests/slow/core/slow-a.test.mjs',
    ];
    const manifest = {
      schema: 1,
      rules: [
        {
          sources: ['package.json', 'package-lock.json'],
          lanes: ['unit', 'integration', 'slow'],
          reason: 'dependency or command-surface change',
        },
      ],
    };
    const result = select(['package-lock.json'], manifest, discovered);
    assert.deepEqual(result.tests, [...discovered].sort());
    assert.deepEqual(result.lanes, ['unit', 'integration', 'slow']);
    assert.equal(result.escalated, true);
    assert.ok(result.reasons.every(({ signal }) => signal === 'lane-escalation'));
  });

  test('checked-in manifest escalates every shared verification authority', () => {
    const discovered = [
      'scripts/task-tracker/tests/unit/lib/unit-a.test.mjs',
      'scripts/task-tracker/tests/integration/integration-a.test.mjs',
      'scripts/task-tracker/tests/slow/core/slow-a.test.mjs',
    ];
    const sharedAuthorities = [
      'package.json',
      'package-lock.json',
      'scripts/run-tests.mjs',
      'scripts/run-tests-lanes.mjs',
      'scripts/task-tracker/lib/test-lanes.mjs',
      'scripts/task-tracker/lib/scratch-dir.mjs',
      'scripts/task-tracker/test-impact-manifest.json',
    ];
    for (const changedPath of sharedAuthorities) {
      const result = selectAffectedTests({
        projectDir: ROOT,
        changedPaths: [changedPath],
        discoveredTests: discovered,
      });
      assert.deepEqual(result.lanes, ['unit', 'integration', 'slow'], changedPath);
      assert.deepEqual(result.tests, [...discovered].sort(), changedPath);
    }
  });

  test('records a no-impact explanation for every otherwise-unmatched path', () => {
    const result = select(['docs/notes.md']);
    assert.deepEqual(result.tests, []);
    assert.deepEqual(result.reasons, [
      {
        changedPath: 'docs/notes.md',
        test: null,
        signal: 'no-verification-impact',
        reason: 'path has no source, test, fixture, runner, dependency, or verification impact',
      },
    ]);
  });
});

describe('manifest fail-closed validation', () => {
  const invalid = [
    ['schema', { schema: 2, rules: [] }, /schema/],
    [
      'escaping source',
      { schema: 1, rules: [{ sources: ['../escape.mjs'], tests: ['x.test.mjs'], reason: 'x' }] },
      /escape/,
    ],
    [
      'unknown lane',
      { schema: 1, rules: [{ sources: ['package.json'], lanes: ['fast'], reason: 'x' }] },
      /lane/,
    ],
    [
      'empty reason',
      { schema: 1, rules: [{ sources: ['package.json'], lanes: ['unit'], reason: '' }] },
      /reason/,
    ],
    [
      'unmatched test glob',
      {
        schema: 1,
        rules: [
          { sources: ['package.json'], tests: ['missing/**/*.test.mjs'], reason: 'must match' },
        ],
      },
      /matched no tests/,
    ],
  ];

  for (const [name, manifest, expected] of invalid) {
    test(`rejects ${name}`, () => {
      assert.throws(() => select(['package.json'], manifest), expected);
    });
  }
});
