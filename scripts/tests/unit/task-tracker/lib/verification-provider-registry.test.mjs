// @story #1218
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { resolveVerificationProvider } from '../../../../task-tracker/lib/verification-provider-registry.mjs';

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
