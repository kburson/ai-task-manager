// @story #1218
// Deterministic built-in verification-provider registry and contract boundary.

import { validateVerificationCommand } from './verification-allowlist.mjs';
import { createNodeVerificationProvider } from './verification-providers/node.mjs';
import { createProjectVerificationProvider } from './verification-providers/project.mjs';

const PROVIDER_KEYS = new Set(['id', 'develop', 'test']);
const DEVELOP_KEYS = new Set(['iterationSteps', 'finalSteps']);
const TEST_KEYS = new Set(['setup', 'steps', 'npmCiArgs', 'declaredCommandCoverage']);
const STEP_KEYS = new Set(['classification', 'kind', 'command', 'label']);
const STEP_KINDS = new Set(['format', 'lint', 'build', 'test', 'environment']);
const CLASSIFICATION_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_NPM_CI_ARGS = new Set(['--legacy-peer-deps']);

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
    setupArgs: Object.freeze([...(plan.setupArgs || [])]),
    steps,
    derivedSteps,
    requiredClassifications: Object.freeze([...(plan.requiredClassifications || [])]),
    ...(plan.selection ? { selection: Object.freeze({ ...plan.selection }) } : {}),
  });
}

function normalizeNpmCiArgs(value) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) fail('test.npmCiArgs must be an array');
  const seen = new Set();
  return Object.freeze(
    value.map((entry) => {
      if (typeof entry !== 'string' || entry.trim() !== entry || entry === '') {
        fail('test.npmCiArgs entries must be non-empty trimmed strings');
      }
      if (seen.has(entry)) fail(`duplicate test.npmCiArgs entry: ${entry}`);
      seen.add(entry);
      if (!ALLOWED_NPM_CI_ARGS.has(entry)) {
        fail(`test.npmCiArgs contains unsupported arg: ${entry}`);
      }
      return entry;
    })
  );
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

// @story #1899
function normalizeDeclaredCommandCoverage(value, { testSteps, projectDir, validateCommand }) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) fail('test.declaredCommandCoverage must be an array');
  const configured = new Map(testSteps.map((step) => [step.classification, step]));
  const executed = new Set(
    testSteps.map(({ command, args }) => JSON.stringify([command, ...args]))
  );
  const seen = new Set();
  return Object.freeze(
    value.map((entry, index) => {
      assertObject(entry, `coverage entry ${index + 1} must be an object`);
      assertExactKeys(entry, new Set(['command', 'requires']), 'coverage');
      if (typeof entry.command !== 'string' || entry.command.trim() === '') {
        fail('coverage command must be non-empty');
      }
      const validation = validateCommand(entry.command, { projectDir });
      if (!validation?.ok || !Array.isArray(validation.argv) || validation.argv.length === 0) {
        fail(`coverage command rejected: ${validation?.reason || 'invalid argv'}`);
      }
      const commandKey = JSON.stringify(validation.argv);
      if (seen.has(commandKey)) fail('duplicate coverage command');
      if (executed.has(commandKey))
        fail('coverage command already executes in configured Test steps');
      seen.add(commandKey);
      if (!Array.isArray(entry.requires) || entry.requires.length === 0) {
        fail('coverage requires must be a non-empty array');
      }
      const requirements = new Set();
      const requires = entry.requires.map((classification) => {
        if (typeof classification !== 'string' || !CLASSIFICATION_RE.test(classification)) {
          fail('coverage requirement must be a lowercase slug');
        }
        if (requirements.has(classification))
          fail(`duplicate coverage requirement: ${classification}`);
        requirements.add(classification);
        const prerequisite = configured.get(classification);
        if (!prerequisite) fail(`unknown coverage requirement: ${classification}`);
        if (prerequisite.kind !== 'test') fail('coverage requirement must reference a test step');
        return classification;
      });
      return Object.freeze({
        command: validation.argv.join(' '),
        commandKey,
        requires: Object.freeze(requires),
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
      ordinal += 1;
      return [
        freezeStep({
          classification: `test-targeted-${ordinal}`,
          kind: 'test',
          command,
          args: [],
          label: command,
          allowlistSource: 'verification-allowlist',
          rejected: validation?.reason || 'invalid argv',
        }),
      ];
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

  const iterationSteps = normalizeConfiguredSteps(config.develop.iterationSteps, {
    stage: 'develop.iterationSteps',
    projectDir,
    validateCommand,
  });
  const finalSteps = normalizeConfiguredSteps(config.develop.finalSteps, {
    stage: 'develop.finalSteps',
    projectDir,
    validateCommand,
    requireNonEmpty: true,
  });
  const testSteps = normalizeConfiguredSteps(config.test.steps, {
    stage: 'test.steps',
    projectDir,
    validateCommand,
    requireNonEmpty: true,
  });
  const declaredCommandCoverage = normalizeDeclaredCommandCoverage(
    config.test.declaredCommandCoverage,
    { testSteps, projectDir, validateCommand }
  );
  const commandIdentity = (command) => {
    const result = validateCommand(command, { projectDir });
    return result?.ok && Array.isArray(result.argv) ? JSON.stringify(result.argv) : null;
  };
  const normalized = Object.freeze({
    iterationSteps,
    finalSteps,
    testSteps,
    declaredCommandCoverage,
    setup: config.test.setup,
    npmCiArgs: normalizeNpmCiArgs(config.test.npmCiArgs),
  });

  return wrapProvider(
    createProjectVerificationProvider({ config: normalized, appendTargeted, commandIdentity })
  );
}
