// @story #1250
// Strict project declaration boundary for Develop iteration verification.

import { validateVerificationCommand } from './verification-allowlist.mjs';

const CONFIG_KEYS = new Set(['iterationSteps']);
const STEP_KEYS = new Set(['classification', 'command', 'label']);
const CLASSIFICATION_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(message) {
  throw new TypeError(`iteration-config-invalid: ${message}`);
}

function assertObject(value, message) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(message);
}

function assertExactKeys(value, allowed, kind) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`unknown ${kind} key: ${key}`);
  }
}

export function normalizeDevelopIterationSteps(
  config,
  { projectDir = process.cwd(), validateCommand = validateVerificationCommand } = {}
) {
  if (config == null) return Object.freeze({ configured: false, steps: Object.freeze([]) });

  assertObject(config, 'config must be an object');
  assertExactKeys(config, CONFIG_KEYS, 'config');
  if (!Array.isArray(config.iterationSteps)) fail('iterationSteps must be an array');

  const classifications = new Set();
  const steps = config.iterationSteps.map((input, index) => {
    assertObject(input, `step ${index + 1} must be an object`);
    assertExactKeys(input, STEP_KEYS, 'step');
    const classification = input.classification;
    if (typeof classification !== 'string' || !CLASSIFICATION_RE.test(classification)) {
      fail(`step ${index + 1} classification must be a lowercase slug`);
    }
    if (classifications.has(classification)) fail(`duplicate classification: ${classification}`);
    classifications.add(classification);

    if (typeof input.command !== 'string' || input.command.trim() === '') {
      fail(`step ${classification} command must be non-empty`);
    }
    if (input.label !== undefined && (typeof input.label !== 'string' || input.label.trim() === '')) {
      fail(`step ${classification} label must be non-empty`);
    }

    const validation = validateCommand(input.command, { projectDir });
    if (!validation?.ok || !Array.isArray(validation.argv) || validation.argv.length === 0) {
      fail(`step ${classification} rejected: ${validation?.reason || 'invalid argv'}`);
    }
    return Object.freeze({
      classification,
      command: validation.argv[0],
      args: Object.freeze(validation.argv.slice(1)),
      label: input.label?.trim() || input.command.trim(),
      allowlistSource: 'verification-allowlist',
    });
  });

  return Object.freeze({ configured: true, steps: Object.freeze(steps) });
}
