// @story #1250
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { normalizeDevelopIterationSteps } from '../../../../task-tracker/lib/develop-verification-steps.mjs';

const projectDir = process.cwd();

function accept(command) {
  return { ok: true, argv: command.trim().split(/\s+/) };
}

describe('normalizeDevelopIterationSteps', () => {
  test('distinguishes absent configuration from an ordered declaration', () => {
    assert.deepEqual(normalizeDevelopIterationSteps(null, { projectDir }), {
      configured: false,
      steps: [],
    });

    const result = normalizeDevelopIterationSteps(
      {
        iterationSteps: [
          { classification: 'swift-lint', command: 'npm run lint:swift' },
          {
            classification: 'xcode-tests',
            command: 'npm run test:xcode',
            label: 'Xcode unit tests',
          },
        ],
      },
      { projectDir, validateCommand: accept }
    );

    assert.equal(result.configured, true);
    assert.deepEqual(result.steps, [
      {
        classification: 'swift-lint',
        command: 'npm',
        args: ['run', 'lint:swift'],
        label: 'npm run lint:swift',
        allowlistSource: 'verification-allowlist',
      },
      {
        classification: 'xcode-tests',
        command: 'npm',
        args: ['run', 'test:xcode'],
        label: 'Xcode unit tests',
        allowlistSource: 'verification-allowlist',
      },
    ]);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.steps));
    assert.ok(result.steps.every(Object.isFrozen));
  });

  const invalid = [
    ['non-object config', [], /config must be an object/],
    ['unknown config key', { iterationSteps: [], extra: true }, /unknown config key: extra/],
    ['non-array steps', { iterationSteps: {} }, /iterationSteps must be an array/],
    [
      'unknown step key',
      { iterationSteps: [{ classification: 'lint', command: 'npm test', extra: true }] },
      /unknown step key: extra/,
    ],
    [
      'malformed classification',
      { iterationSteps: [{ classification: 'Swift Lint', command: 'npm test' }] },
      /classification must be a lowercase slug/,
    ],
    [
      'duplicate classification',
      {
        iterationSteps: [
          { classification: 'swift-lint', command: 'npm test' },
          { classification: 'swift-lint', command: 'npm run lint' },
        ],
      },
      /duplicate classification: swift-lint/,
    ],
    [
      'empty command',
      { iterationSteps: [{ classification: 'swift-lint', command: '  ' }] },
      /command must be non-empty/,
    ],
    [
      'empty label',
      { iterationSteps: [{ classification: 'swift-lint', command: 'npm test', label: '' }] },
      /label must be non-empty/,
    ],
  ];

  for (const [name, config, expected] of invalid) {
    test(`rejects ${name}`, () => {
      assert.throws(
        () => normalizeDevelopIterationSteps(config, { projectDir, validateCommand: accept }),
        new RegExp(`iteration-config-invalid:.*${expected.source}`)
      );
    });
  }

  test('surfaces the allowlist refusal before returning a plan', () => {
    assert.throws(
      () =>
        normalizeDevelopIterationSteps(
          { iterationSteps: [{ classification: 'unsafe', command: 'rm -rf .' }] },
          {
            projectDir,
            validateCommand: () => ({ ok: false, reason: 'bin not in allowlist: rm' }),
          }
        ),
      /iteration-config-invalid: step unsafe rejected: bin not in allowlist: rm/
    );
  });
});
