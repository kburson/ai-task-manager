// @story #1089 #1263
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import { selectAffectedTests } from '../../../../task-tracker/lib/test-impact-selector.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const FIXTURE = 'scripts/tests/fixtures/test-impact';
const fixturePath = (relative) => `${FIXTURE}/${relative}`;
const DISCOVERED = [
  fixturePath('tests/direct.spec.mjs'),
  fixturePath('tests/transitive.spec.mjs'),
  fixturePath('tests/fixture-consumer.spec.mjs'),
  fixturePath('tests/dynamic.spec.mjs'),
  fixturePath('tests/untracked.spec.mjs'),
  'scripts/tests/unit/task-tracker/lib/name.test.mjs',
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

const CHEAP_MEMBERSHIP_TEST = 'scripts/tests/integration/meta/test-corpus-membership.test.mjs';
const EXPENSIVE_PACKAGE_TEST = 'scripts/tests/integration/meta/package-test-corpus.test.mjs';
const CORPUS_DISCOVERED = [
  CHEAP_MEMBERSHIP_TEST,
  EXPENSIVE_PACKAGE_TEST,
  'scripts/tests/unit/lib/live.test.mjs',
  'scripts/tests/integration/lib/live.test.mjs',
  'scripts/tests/slow/lib/live.test.mjs',
];
const CHECKED_IN_MANIFEST = JSON.parse(
  readFileSync(path.join(ROOT, 'scripts/task-tracker/test-impact-manifest.json'), 'utf8')
);

function writeFixture(projectRoot, relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, '// selection fixture\n');
}

function corpusSelectionProject(t) {
  const projectRoot = mkdtempProjectIsolated('test-impact-corpus-');
  for (const testPath of CORPUS_DISCOVERED) writeFixture(projectRoot, testPath);
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }));
  return projectRoot;
}

function selectCorpus(projectDir, changedPaths) {
  return selectAffectedTests({
    projectDir,
    changedPaths,
    manifest: CHECKED_IN_MANIFEST,
    discoveredTests: CORPUS_DISCOVERED,
  });
}

function manifestReasons(result, testPath) {
  return result.reasons
    .filter(({ signal, test: selected }) => signal === 'manifest' && selected === testPath)
    .map(({ reason }) => reason);
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
    const conventional = 'scripts/tests/unit/task-tracker/lib/name.test.mjs';
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
      'scripts/tests/unit/task-tracker/lib/unit-a.test.mjs',
      'scripts/tests/integration/task-tracker/integration-a.test.mjs',
      'scripts/tests/slow/task-tracker/core/slow-a.test.mjs',
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
      'scripts/tests/unit/task-tracker/lib/unit-a.test.mjs',
      'scripts/tests/integration/task-tracker/integration-a.test.mjs',
      'scripts/tests/slow/task-tracker/core/slow-a.test.mjs',
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

  test('a deleted test escalates its former lane instead of disappearing', () => {
    const discovered = [
      'scripts/tests/unit/task-tracker/lib/unit-a.test.mjs',
      'scripts/tests/integration/task-tracker/integration-a.test.mjs',
      'scripts/tests/slow/task-tracker/core/slow-a.test.mjs',
    ];
    const result = select(
      ['scripts/tests/integration/task-tracker/deleted.test.mjs'],
      { schema: 1, rules: [] },
      discovered
    );
    assert.deepEqual(result.lanes, ['integration']);
    assert.deepEqual(result.tests, [
      'scripts/tests/integration/task-tracker/integration-a.test.mjs',
    ]);
    assert.ok(result.reasons.every(({ signal }) => signal === 'deleted-test-lane'));
  });

  test('an otherwise-unmapped deleted source escalates every lane conservatively', () => {
    const discovered = [
      'scripts/tests/unit/task-tracker/lib/unit-a.test.mjs',
      'scripts/tests/integration/task-tracker/integration-a.test.mjs',
      'scripts/tests/slow/task-tracker/core/slow-a.test.mjs',
    ];
    const result = select(
      ['scripts/tests/fixtures/test-impact/lib/deleted-source.mjs'],
      { schema: 1, rules: [] },
      discovered
    );
    assert.deepEqual(result.lanes, ['unit', 'integration', 'slow']);
    assert.deepEqual(result.tests, [...discovered].sort());
    assert.ok(result.reasons.every(({ signal }) => signal === 'deleted-path-lane-escalation'));
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

describe('checked-in corpus membership selection', () => {
  test('a test content edit selects itself and the cheap membership guard', (t) => {
    const projectRoot = corpusSelectionProject(t);
    const changed = 'scripts/tests/unit/lib/live.test.mjs';

    const result = selectCorpus(projectRoot, [changed]);

    assert.deepEqual(result.tests, [changed, CHEAP_MEMBERSHIP_TEST].sort());
    assert.ok(signals(result, changed).includes('changed-test'));
    assert.deepEqual(manifestReasons(result, CHEAP_MEMBERSHIP_TEST), [
      'test corpus membership authority change',
    ]);
    assert.equal(result.escalated, false);
  });

  test('a deleted integration test adds the cheap guard and retains its former lane', (t) => {
    const projectRoot = corpusSelectionProject(t);
    const deleted = 'scripts/tests/integration/lib/deleted.test.mjs';

    const result = selectCorpus(projectRoot, [deleted]);

    assert.ok(result.tests.includes(CHEAP_MEMBERSHIP_TEST));
    assert.deepEqual(result.lanes, ['integration']);
    assert.equal(result.escalated, true);
    assert.ok(
      result.reasons.some(({ changedPath, signal }) => {
        return changedPath === deleted && signal === 'deleted-test-lane';
      })
    );
    assert.deepEqual(manifestReasons(result, CHEAP_MEMBERSHIP_TEST), [
      'test corpus membership authority change',
    ]);
  });

  for (const change of ['added', 'modified', 'deleted']) {
    test(`${change} registry JSON selects the cheap guard without lane escalation`, (t) => {
      const projectRoot = corpusSelectionProject(t);
      const record = `scripts/tests/fixtures/test-corpus-post-snapshot/unit/lib/${change}.test.mjs.json`;
      if (change !== 'deleted') writeFixture(projectRoot, record);

      const result = selectCorpus(projectRoot, [record]);

      assert.deepEqual(result.tests, [CHEAP_MEMBERSHIP_TEST]);
      assert.deepEqual(result.lanes, []);
      assert.equal(result.escalated, false);
      assert.deepEqual(manifestReasons(result, CHEAP_MEMBERSHIP_TEST), [
        'test corpus membership authority change',
      ]);
    });
  }

  test('a rename selects the cheap guard while the old path retains former-lane escalation', (t) => {
    const projectRoot = corpusSelectionProject(t);
    const oldPath = 'scripts/tests/integration/lib/renamed.test.mjs';
    const newPath = 'scripts/tests/unit/lib/live.test.mjs';

    const result = selectCorpus(projectRoot, [oldPath, newPath]);

    assert.ok(result.tests.includes(newPath));
    assert.ok(result.tests.includes(CHEAP_MEMBERSHIP_TEST));
    assert.deepEqual(result.lanes, ['integration']);
    assert.equal(result.escalated, true);
    assert.ok(
      result.reasons.some(({ changedPath, signal }) => {
        return changedPath === oldPath && signal === 'deleted-test-lane';
      })
    );
    assert.deepEqual(
      result.reasons
        .filter(({ signal, test: selected }) => {
          return signal === 'manifest' && selected === CHEAP_MEMBERSHIP_TEST;
        })
        .map(({ changedPath }) => changedPath),
      [oldPath, newPath].sort()
    );
  });

  test('the frozen pre-move authority selects both corpus guards', (t) => {
    const projectRoot = corpusSelectionProject(t);

    const result = selectCorpus(projectRoot, ['scripts/tests/fixtures/test-corpus-pre-move.json']);

    assert.deepEqual(result.tests, [CHEAP_MEMBERSHIP_TEST, EXPENSIVE_PACKAGE_TEST].sort());
    assert.deepEqual(manifestReasons(result, CHEAP_MEMBERSHIP_TEST), [
      'frozen test corpus authority change',
    ]);
    assert.deepEqual(manifestReasons(result, EXPENSIVE_PACKAGE_TEST), [
      'frozen test corpus authority change',
    ]);
    assert.equal(result.escalated, false);
  });
});
