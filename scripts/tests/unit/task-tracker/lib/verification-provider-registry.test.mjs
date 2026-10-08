// @story #1218
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  resolveVerificationProvider,
  deriveRecordedDevelopFinalPlan,
} from '../../../../task-tracker/lib/verification-provider-registry.mjs';

const projectDir = process.cwd();

function accept(command) {
  return { ok: true, argv: command.trim().split(/\s+/) };
}

function projectConfig(overrides = {}) {
  return {
    id: 'project',
    develop: {
      iterationSteps: [{ classification: 'swift-format', kind: 'format', command: 'npm run lint' }],
      finalSteps: [{ classification: 'xcode-build', kind: 'build', command: 'npm run test:unit' }],
    },
    test: {
      setup: 'npm-ci',
      steps: [
        {
          classification: 'simulator-ready',
          kind: 'environment',
          command: 'npm run format:check',
        },
        { classification: 'xcode-tests', kind: 'test', command: 'npm run test:slow' },
      ],
    },
    ...overrides,
  };
}

describe('verification provider registry', () => {
  test('resolves the Node provider by default with current final and Test plans', () => {
    const provider = resolveVerificationProvider({ projectDir, config: null });

    assert.equal(provider.id, 'node');
    assert.deepEqual(
      provider.planDevelopFinal().steps.map(({ classification, kind, command, args }) => ({
        classification,
        kind,
        command,
        args,
      })),
      [
        { classification: 'lint-full', kind: 'lint', command: 'npm', args: ['run', 'lint'] },
        {
          classification: 'format-full',
          kind: 'format',
          command: 'npm',
          args: ['run', 'format:check'],
        },
      ]
    );

    const testPlan = provider.planTest({
      declaredCommands: [{ command: 'node --test scripts/tests/unit/example.test.mjs' }],
      includeCompleteLanes: true,
    });
    assert.deepEqual(testPlan.requiredClassifications, [
      'test-unit',
      'test-integration',
      'test-slow',
    ]);
    assert.deepEqual(
      testPlan.steps.map(({ classification }) => classification),
      ['test-unit', 'test-integration', 'test-slow', 'test-targeted-1']
    );
  });

  test('resolves an explicit project provider into frozen stage plans', () => {
    const provider = resolveVerificationProvider({
      projectDir,
      config: projectConfig(),
      deps: { validateCommand: accept },
    });

    assert.equal(provider.id, 'project');
    const iteration = provider.planDevelopIteration({ changedPaths: ['Sources/App.swift'] });
    const final = provider.planDevelopFinal();
    const testPlan = provider.planTest({ declaredCommands: [] });

    assert.deepEqual(iteration.requiredClassifications, ['swift-format']);
    assert.deepEqual(final.requiredClassifications, ['xcode-build']);
    assert.deepEqual(testPlan.requiredClassifications, ['simulator-ready', 'xcode-tests']);
    assert.deepEqual(
      testPlan.steps.map(({ classification, kind }) => ({ classification, kind })),
      [
        { classification: 'simulator-ready', kind: 'environment' },
        { classification: 'xcode-tests', kind: 'test' },
      ]
    );
    assert.ok(Object.isFrozen(provider));
    assert.ok(Object.isFrozen(testPlan));
    assert.ok(Object.isFrozen(testPlan.steps));
    assert.ok(testPlan.steps.every(Object.isFrozen));
  });

  test('normalizes allowlisted project Test npm-ci args', () => {
    const provider = resolveVerificationProvider({
      projectDir,
      config: projectConfig({
        test: { ...projectConfig().test, npmCiArgs: ['--legacy-peer-deps'] },
      }),
      deps: { validateCommand: accept },
    });

    const testPlan = provider.planTest({ declaredCommands: [] });
    assert.equal(testPlan.setup, 'npm-ci');
    assert.deepEqual(testPlan.setupArgs, ['--legacy-peer-deps']);
    assert.ok(Object.isFrozen(testPlan.setupArgs));
  });

  test('appends non-duplicate issue commands as deterministic targeted Test steps', () => {
    const provider = resolveVerificationProvider({
      projectDir,
      config: projectConfig(),
      deps: { validateCommand: accept },
    });
    const plan = provider.planTest({
      declaredCommands: [
        { command: 'npm run test:slow' },
        { command: 'node --test scripts/tests/unit/focused.test.mjs' },
      ],
    });

    assert.deepEqual(
      plan.steps.map(({ classification }) => classification),
      ['simulator-ready', 'xcode-tests', 'test-targeted-1']
    );
  });

  const invalid = [
    ['unknown provider', { id: 'xcode' }, /unknown provider id: xcode/],
    [
      'unknown provider key',
      { ...projectConfig(), lifecycleAuthority: true },
      /unknown provider key: lifecycleAuthority/,
    ],
    [
      'unknown stage key',
      projectConfig({ develop: { ...projectConfig().develop, cacheHit: true } }),
      /unknown develop key: cacheHit/,
    ],
    [
      'unknown step kind',
      projectConfig({
        develop: {
          ...projectConfig().develop,
          finalSteps: [
            { classification: 'xcode-build', kind: 'deploy', command: 'npm run test:unit' },
          ],
        },
      }),
      /step kind must be one of/,
    ],
    [
      'duplicate Test classification',
      projectConfig({
        test: {
          setup: 'npm-ci',
          steps: [
            { classification: 'xcode-tests', kind: 'test', command: 'npm run test:unit' },
            { classification: 'xcode-tests', kind: 'test', command: 'npm run test:slow' },
          ],
        },
      }),
      /duplicate classification: xcode-tests/,
    ],
    [
      'empty final floor',
      projectConfig({ develop: { ...projectConfig().develop, finalSteps: [] } }),
      /develop.finalSteps must contain at least one step/,
    ],
    [
      'empty Test floor',
      projectConfig({ test: { setup: 'npm-ci', steps: [] } }),
      /test.steps must contain at least one step/,
    ],
    [
      'unsupported setup',
      projectConfig({ test: { ...projectConfig().test, setup: 'xcode-install' } }),
      /test.setup must equal npm-ci/,
    ],
    [
      'unsupported npm-ci arg',
      projectConfig({ test: { ...projectConfig().test, npmCiArgs: ['--script-shell=/bin/sh'] } }),
      /test.npmCiArgs contains unsupported arg: --script-shell=\/bin\/sh/,
    ],
    [
      'duplicate npm-ci arg',
      projectConfig({
        test: {
          ...projectConfig().test,
          npmCiArgs: ['--legacy-peer-deps', '--legacy-peer-deps'],
        },
      }),
      /duplicate test.npmCiArgs entry: --legacy-peer-deps/,
    ],
  ];

  for (const [name, config, expected] of invalid) {
    test(`rejects ${name}`, () => {
      assert.throws(
        () =>
          resolveVerificationProvider({
            projectDir,
            config,
            deps: { validateCommand: accept },
          }),
        new RegExp(`verification-provider-invalid:.*${expected.source}`)
      );
    });
  }

  test('validates every project step before returning a provider', () => {
    let validations = 0;
    assert.throws(
      () =>
        resolveVerificationProvider({
          projectDir,
          config: projectConfig(),
          deps: {
            validateCommand: (command) => {
              validations += 1;
              return command === 'npm run test:slow'
                ? { ok: false, reason: 'command refused' }
                : accept(command);
            },
          },
        }),
      /verification-provider-invalid:.*xcode-tests rejected: command refused/
    );
    assert.equal(validations, 4);
  });
});

// @story #1899
function cloudCoverageConfig(
  coverage = [
    { command: 'npm test', requires: ['test-cloud-complete'] },
    { command: 'npm run test:slow', requires: ['test-cloud-complete'] },
  ]
) {
  return projectConfig({
    test: {
      setup: 'npm-ci',
      steps: [
        {
          classification: 'test-cloud-complete',
          kind: 'test',
          command: 'node scripts/maintenance/verify-ci-receipts.mjs',
        },
      ],
      declaredCommandCoverage: coverage,
    },
  });
}

test('explicit cloud coverage derives suites and retains uncovered affected checks', () => {
  const provider = resolveVerificationProvider({ projectDir, config: cloudCoverageConfig() });
  const plan = provider.planTest({
    declaredCommands: [
      { command: 'npm test' },
      { command: 'npm run test:slow' },
      { command: 'node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs' },
    ],
  });
  assert.deepEqual(
    plan.steps.map(({ command, args }) => [command, ...args].join(' ')),
    [
      'node scripts/maintenance/verify-ci-receipts.mjs',
      'node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs',
    ]
  );
  assert.deepEqual(
    plan.derivedSteps.map(({ command, requires }) => ({ command, requires })),
    [
      { command: 'npm test', requires: ['test-cloud-complete'] },
      { command: 'npm run test:slow', requires: ['test-cloud-complete'] },
    ]
  );
  assert.deepEqual(plan.requiredClassifications, ['test-cloud-complete']);
  assert.ok(Object.isFrozen(plan.derivedSteps));
  assert.ok(
    plan.derivedSteps.every((step) => Object.isFrozen(step) && Object.isFrozen(step.requires))
  );
  assert.throws(() => plan.derivedSteps[0].requires.push('invented'));
});

test('coverage uses allowlisted argv identity while preserving declared spelling', () => {
  const provider = resolveVerificationProvider({ projectDir, config: cloudCoverageConfig() });
  const plan = provider.planTest({
    declaredCommands: [
      { command: 'npm   test' },
      { command: 'npm run "test:slow"' },
      { command: 'npm   test' },
    ],
  });
  assert.equal(plan.steps.length, 1);
  assert.deepEqual(
    plan.derivedSteps.map(({ command }) => command),
    ['npm   test', 'npm run "test:slow"']
  );
  assert.equal(provider.planTest({ declaredCommands: [] }).derivedSteps.length, 0);
});

test('an explicit empty coverage array retains executable declarations', () => {
  const plan = resolveVerificationProvider({
    projectDir,
    config: cloudCoverageConfig([]),
  }).planTest({ declaredCommands: ['npm test'] });
  assert.deepEqual(
    plan.steps.map(({ command, args }) => [command, ...args].join(' ')),
    ['node scripts/maintenance/verify-ci-receipts.mjs', 'npm test']
  );
  assert.deepEqual(plan.derivedSteps, []);
});

test('project provider without coverage still executes declared suites', () => {
  const config = cloudCoverageConfig();
  delete config.test.declaredCommandCoverage;
  const plan = resolveVerificationProvider({ projectDir, config }).planTest({
    declaredCommands: ['npm test', 'npm run test:slow'],
  });
  assert.deepEqual(
    plan.steps.map(({ command, args }) => [command, ...args].join(' ')),
    ['node scripts/maintenance/verify-ci-receipts.mjs', 'npm test', 'npm run test:slow']
  );
  assert.deepEqual(plan.derivedSteps, []);
});

for (const [name, coverage, expected] of [
  ['non-array coverage', {}, /declaredCommandCoverage must be an array/],
  ['null entry', [null], /coverage entry.*must be an object/],
  [
    'unknown coverage key',
    [{ command: 'npm test', requires: ['test-cloud-complete'], skip: true }],
    /unknown coverage key: skip/,
  ],
  [
    'empty command',
    [{ command: ' ', requires: ['test-cloud-complete'] }],
    /coverage.*command must be non-empty/,
  ],
  [
    'rejected command',
    [{ command: 'npm test; git push', requires: ['test-cloud-complete'] }],
    /coverage.*command rejected/,
  ],
  ['missing requirements', [{ command: 'npm test' }], /requires must be a non-empty array/],
  [
    'empty requirements',
    [{ command: 'npm test', requires: [] }],
    /requires must be a non-empty array/,
  ],
  [
    'non-array requirements',
    [{ command: 'npm test', requires: 'test-cloud-complete' }],
    /requires must be a non-empty array/,
  ],
  [
    'duplicate requirement',
    [{ command: 'npm test', requires: ['test-cloud-complete', 'test-cloud-complete'] }],
    /duplicate coverage requirement/,
  ],
  [
    'unknown requirement',
    [{ command: 'npm test', requires: ['missing'] }],
    /unknown coverage requirement/,
  ],
  [
    'invalid requirement',
    [{ command: 'npm test', requires: [null] }],
    /coverage requirement must be a lowercase slug/,
  ],
  [
    'normalized duplicate command',
    [
      { command: 'npm test', requires: ['test-cloud-complete'] },
      { command: 'npm   "test"', requires: ['test-cloud-complete'] },
    ],
    /duplicate coverage command/,
  ],
  [
    'executed-command overlap',
    [
      {
        command: 'node scripts/maintenance/verify-ci-receipts.mjs',
        requires: ['test-cloud-complete'],
      },
    ],
    /coverage command already executes/,
  ],
]) {
  test('coverage refuses ' + name + ' before returning an executable provider', () => {
    assert.throws(
      () => resolveVerificationProvider({ projectDir, config: cloudCoverageConfig(coverage) }),
      expected
    );
  });
}

test('coverage cannot derive from lint, build or environment steps', () => {
  for (const kind of ['lint', 'format', 'build', 'environment']) {
    const config = cloudCoverageConfig();
    config.test.steps[0].kind = kind;
    assert.throws(
      () => resolveVerificationProvider({ projectDir, config }),
      /coverage requirement must reference a test step/
    );
  }
});

test('coverage requires all configured Test classifications and preserves declaration order', () => {
  const config = cloudCoverageConfig([
    { command: 'npm test', requires: ['test-cloud-complete', 'test-extra'] },
  ]);
  config.test.steps.push({
    classification: 'test-extra',
    kind: 'test',
    command: 'node scripts/maintenance/verify-affected-or-cloud.mjs',
  });
  const plan = resolveVerificationProvider({ projectDir, config }).planTest({
    declaredCommands: ['npm test'],
  });
  assert.deepEqual(
    plan.steps.map(({ classification }) => classification),
    ['test-cloud-complete', 'test-extra']
  );
  assert.deepEqual(plan.derivedSteps[0].requires, ['test-cloud-complete', 'test-extra']);
});

test('targeted coverage checks cannot reuse configured classification identities', () => {
  const config = cloudCoverageConfig([
    { command: 'npm test', requires: ['test-targeted-1', 'test-targeted-2'] },
  ]);
  config.test.steps[0].classification = 'test-targeted-1';
  config.test.steps.push({
    classification: 'test-targeted-2',
    kind: 'test',
    command: 'node scripts/maintenance/verify-affected-or-cloud.mjs',
  });
  const plan = resolveVerificationProvider({ projectDir, config }).planTest({
    declaredCommands: [
      'npm test',
      'node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs',
      'npm test; git push',
    ],
  });
  assert.deepEqual(
    plan.steps.map(({ classification }) => classification),
    ['test-targeted-1', 'test-targeted-2', 'test-targeted-3', 'test-targeted-4']
  );
  assert.ok(plan.steps[3].rejected);
  assert.deepEqual(plan.derivedSteps[0].requires, ['test-targeted-1', 'test-targeted-2']);
});

// @story #1855
test('recorded final plan is closed data with complete shared provider syntax validation', () => {
  const config = projectConfig();
  config.test.steps[0].command = './scripts/recorded-obsolete-file-1855.sh';
  const input = {
    projectDir,
    configuration: { verificationProvider: config, developVerification: null },
  };
  const plan = deriveRecordedDevelopFinalPlan(input);
  assert.equal(plan.providerId, 'project');
  assert.equal(plan.stage, 'develop-final');
  assert.equal(typeof plan.planTest, 'undefined');
  assert.ok(Object.isFrozen(plan));
  assert.throws(() => resolveVerificationProvider({ projectDir, config }), /script not found/);
  assert.throws(
    () => deriveRecordedDevelopFinalPlan({ ...input, deps: { validateCommand: accept } }),
    /unknown recorded input key/
  );
  assert.throws(
    () =>
      deriveRecordedDevelopFinalPlan({
        ...input,
        configuration: { ...input.configuration, historical: true },
      }),
    /unknown recorded configuration key/
  );
  assert.throws(
    () =>
      deriveRecordedDevelopFinalPlan({ ...input, configuration: { verificationProvider: config } }),
    /required/
  );
  assert.throws(
    () => deriveRecordedDevelopFinalPlan({ ...input, projectDir: './relative' }),
    /required/
  );
  for (const command of [
    'unknown-verifier',
    './scripts/../../outside.sh',
    './scripts/unsafe.txt',
  ]) {
    const bad = structuredClone(input);
    bad.configuration.verificationProvider.test.steps[0].command = command;
    assert.throws(() => deriveRecordedDevelopFinalPlan(bad), /rejected/);
  }
  const duplicate = structuredClone(input);
  duplicate.configuration.verificationProvider.test.steps[1].classification = 'simulator-ready';
  assert.throws(() => deriveRecordedDevelopFinalPlan(duplicate), /duplicate classification/);
  const coverage = structuredClone(input);
  coverage.configuration.verificationProvider.test.declaredCommandCoverage = [
    { command: 'unknown-verifier', requires: ['xcode-tests'] },
  ];
  assert.throws(() => deriveRecordedDevelopFinalPlan(coverage), /coverage command rejected/);
  assert.deepEqual(
    deriveRecordedDevelopFinalPlan({
      projectDir,
      configuration: { verificationProvider: null, developVerification: null },
    }),
    resolveVerificationProvider({ projectDir }).planDevelopFinal()
  );
});
