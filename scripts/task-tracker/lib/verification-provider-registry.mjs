// @story #1218
// Deterministic built-in verification-provider registry and contract boundary.

import { validateVerificationCommand } from './verification-allowlist.mjs';
import { createNodeVerificationProvider } from './verification-providers/node.mjs';
import { createProjectVerificationProvider } from './verification-providers/project.mjs';

const PROVIDER_KEYS = new Set(['id', 'develop', 'test']);
const DEVELOP_KEYS = new Set(['iterationSteps', 'finalSteps']);
const TEST_KEYS = new Set(['setup', 'steps']);
const STEP_KEYS = new Set(['classification', 'kind', 'command', 'label']);
const STEP_KINDS = new Set(['format', 'lint', 'build', 'test', 'environment']);
const CLASSIFICATION_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(message) {
  throw new TypeError(`verification-provider-invalid: ${message}`);
}

function assertObject(value, message) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(message);
}

function assertExactKeys(value, allowed, kind) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`unknown ${kind} key: ${key}`);
  }
}

function freezeStep(step) {
  return Object.freeze({ ...step, args: Object.freeze([...step.args]) });
}

function freezePlan(plan) {
  const steps = Object.freeze((plan.steps || []).map(freezeStep));
  const derivedSteps = Object.freeze(
    (plan.derivedSteps || []).map((step) =>
      Object.freeze({ ...step, requires: Object.freeze([...(step.requires || [])]) })
    )
  );
  return Object.freeze({
    providerId: plan.providerId,
    stage: plan.stage,
    setup: plan.setup ?? null,
    steps,
    derivedSteps,
    requiredClassifications: Object.freeze([...(plan.requiredClassifications || [])]),
    ...(plan.selection ? { selection: Object.freeze({ ...plan.selection }) } : {}),
  });
}

function normalizeConfiguredSteps(
  inputs,
  { stage, projectDir, validateCommand, requireNonEmpty = false }
) {
  if (!Array.isArray(inputs)) fail(`${stage} must be an array`);
  if (requireNonEmpty && inputs.length === 0) fail(`${stage} must contain at least one step`);
  const classifications = new Set();
  return Object.freeze(
    inputs.map((input, index) => {
      assertObject(input, `${stage} step ${index + 1} must be an object`);
      assertExactKeys(input, STEP_KEYS, 'step');
      const classification = input.classification;
      if (typeof classification !== 'string' || !CLASSIFICATION_RE.test(classification)) {
        fail(`${stage} step ${index + 1} classification must be a lowercase slug`);
      }
      if (classifications.has(classification)) fail(`duplicate classification: ${classification}`);
      classifications.add(classification);
      if (!STEP_KINDS.has(input.kind)) {
        fail(`step kind must be one of ${[...STEP_KINDS].join(', ')}`);
      }
      if (typeof input.command !== 'string' || input.command.trim() === '') {
        fail(`${classification} command must be non-empty`);
      }
      if (
        input.label !== undefined &&
        (typeof input.label !== 'string' || input.label.trim() === '')
      ) {
        fail(`${classification} label must be non-empty`);
      }
      const validation = validateCommand(input.command, { projectDir });
      if (!validation?.ok || !Array.isArray(validation.argv) || validation.argv.length === 0) {
        fail(`${classification} rejected: ${validation?.reason || 'invalid argv'}`);
      }
      return freezeStep({
        classification,
        kind: input.kind,
        command: validation.argv[0],
        args: validation.argv.slice(1),
        label: input.label?.trim() || input.command.trim(),
        allowlistSource: 'verification-allowlist',
      });
    })
  );
}

function targetedSteps({ declaredCommands = [], existingSteps = [], projectDir, validateCommand }) {
  const existing = new Set(existingSteps.map(({ command, args }) => [command, ...args].join(' ')));
  let ordinal = 0;
  return declaredCommands.flatMap((item) => {
    const command = String(typeof item === 'string' ? item : item?.command || '').trim();
    if (!command || existing.has(command)) return [];
    const validation = validateCommand(command, { projectDir });
    if (!validation?.ok || !Array.isArray(validation.argv) || validation.argv.length === 0) {
      fail(`targeted Test command rejected: ${validation?.reason || 'invalid argv'}`);
    }
    ordinal += 1;
    return [
      freezeStep({
        classification: `test-targeted-${ordinal}`,
        kind: 'test',
        command: validation.argv[0],
        args: validation.argv.slice(1),
        label: command,
        allowlistSource: 'verification-allowlist',
      }),
    ];
  });
}

function wrapProvider(raw) {
  return Object.freeze({
    id: raw.id,
    planDevelopIteration: (input = {}) => freezePlan(raw.planDevelopIteration(input)),
    planDevelopFinal: (input = {}) => freezePlan(raw.planDevelopFinal(input)),
    planTest: (input = {}) => freezePlan(raw.planTest(input)),
  });
}

export function resolveVerificationProvider({
  config,
  projectDir = process.cwd(),
  legacyDevelopVerification = null,
  deps = {},
} = {}) {
  const validateCommand = deps.validateCommand || validateVerificationCommand;
  const appendTargeted = (input) => targetedSteps({ ...input, projectDir, validateCommand });

  if (config == null) {
    return wrapProvider(
      createNodeVerificationProvider({
        projectDir,
        legacyDevelopVerification,
        appendTargeted,
        deps,
      })
    );
  }

  assertObject(config, 'provider config must be an object');
  assertExactKeys(config, PROVIDER_KEYS, 'provider');
  if (config.id !== 'project') fail(`unknown provider id: ${String(config.id)}`);
  assertObject(config.develop, 'develop must be an object');
  assertExactKeys(config.develop, DEVELOP_KEYS, 'develop');
  assertObject(config.test, 'test must be an object');
  assertExactKeys(config.test, TEST_KEYS, 'test');
  if (config.test.setup !== 'npm-ci') fail('test.setup must equal npm-ci');

  const normalized = Object.freeze({
    iterationSteps: normalizeConfiguredSteps(config.develop.iterationSteps, {
      stage: 'develop.iterationSteps',
      projectDir,
      validateCommand,
    }),
    finalSteps: normalizeConfiguredSteps(config.develop.finalSteps, {
      stage: 'develop.finalSteps',
      projectDir,
      validateCommand,
      requireNonEmpty: true,
    }),
    testSteps: normalizeConfiguredSteps(config.test.steps, {
      stage: 'test.steps',
      projectDir,
      validateCommand,
      requireNonEmpty: true,
    }),
    setup: config.test.setup,
  });

  return wrapProvider(createProjectVerificationProvider({ config: normalized, appendTargeted }));
}
