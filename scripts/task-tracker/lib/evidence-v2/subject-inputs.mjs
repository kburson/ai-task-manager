// @story #1497
import {
  currentRevisionEvidenceBinding,
  currentRevisionDefinitions,
  matchesCurrentRevisionEvidence,
} from '../criteria-revision/policy.mjs';
import { validateRevisionEvidenceBinding } from '../criteria-revision/evidence-binding.mjs';
import { canonical, exact, fail, textValue, digestValue, policyValue } from './value.mjs';
import { parseProofMarker } from '../proof-marker.mjs';
import { parseVcRefIndexes, resolveVcListStrict } from '../vc-ref.mjs';
import { parseVerificationCommands } from '../verification-commands.mjs';
const secretName = /(?:secret|token|password|passwd|credential|authorization|cookie|private.?key)/i;
function section(body, name) {
  const heading = new RegExp(`^## ${name}[ \t]*$`, 'm').exec(body);
  if (!heading) return '';
  const rest = body.slice(heading.index + heading[0].length);
  const end = /^## /m.exec(rest)?.index ?? rest.length;
  return rest.slice(0, end);
}

export function projectRequirements({ body, target, policy }) {
  const revisionBinding = currentRevisionEvidenceBinding({ body });
  const definitions = currentRevisionDefinitions({ body });
  const vcItems = definitions ? null : parseVerificationCommands(body);
  const verificationCommands = definitions
    ? definitions
        .filter((d) => d.section === 'vc')
        .map((d) => ({ id: d.identity, command: d.text }))
    : vcItems.map((item) => {
        if (!Number.isInteger(item.id)) fail('requirements-command');
        return { id: `vc:${item.id}`, command: item.command };
      });
  const acceptanceCriteria = definitions
    ? definitions
        .filter((d) => d.section === 'ac')
        .map((d) => {
          if (d.declaration.kind !== 'vc-list') fail('requirements-mapping');
          return {
            id: d.identity,
            text: d.text,
            verificationIds: d.declaration.vcIds.map((id) => {
              const vc = definitions.find((item) => item.section === 'vc' && item.rootId === id);
              if (!vc) fail('requirements-mapping');
              return vc.identity;
            }),
          };
        })
    : section(body, 'Acceptance Criteria')
        .split('\n')
        .filter((line) => /^\s*- \[[ x]\]/i.test(line))
        .map((line, index) => {
          const props = parseProofMarker(line);
          resolveVcListStrict(props?.['vc-list'], vcItems);
          const verificationIds = parseVcRefIndexes(props['vc-list']).map((id) => `vc:${id}`);
          const text = line
            .replace(/^\s*- \[[ x]\]\s*/i, '')
            .replace(/<!--[^]*?-->/g, '')
            .trim();
          return { id: `ac:${index + 1}`, text, verificationIds };
        });
  if (!acceptanceCriteria.length || !verificationCommands.length) fail('requirements-incomplete');
  return {
    schema: 'aitm.requirements/v2',
    ...(revisionBinding ? { revisionBinding } : {}),
    acceptanceCriteria,
    verificationCommands,
    target,
    policy,
  };
}
export function validateInputs({ requirements, recipe, environment }) {
  exact(
    requirements,
    [
      'schema',
      'acceptanceCriteria',
      'verificationCommands',
      'target',
      'policy',
      ...(requirements.revisionBinding === undefined ? [] : ['revisionBinding']),
    ],
    'requirements-keys'
  );
  if (
    requirements.schema !== 'aitm.requirements/v2' ||
    !requirements.acceptanceCriteria?.length ||
    !requirements.verificationCommands?.length
  )
    fail('requirements-incomplete');
  if (requirements.revisionBinding !== undefined)
    validateRevisionEvidenceBinding(requirements.revisionBinding);
  if (!matchesCurrentRevisionEvidence(requirements.revisionBinding, { structural: true }))
    fail('requirements-revision-mismatch');
  policyValue(requirements.policy);
  if (!requirements.target || !Object.keys(requirements.target).length) fail('requirements-target');
  const ids = new Set();
  for (const cmd of requirements.verificationCommands) {
    if (cmd.argv) {
      exact(cmd, ['id', 'argv'], 'requirements-command');
      if (
        !Array.isArray(cmd.argv) ||
        !cmd.argv.length ||
        cmd.argv.some((v) => typeof v !== 'string')
      )
        fail('requirements-command');
    } else {
      exact(cmd, ['id', 'command'], 'requirements-command');
      textValue(cmd.command);
    }
    textValue(cmd.id);
    if (ids.has(cmd.id)) fail('requirements-duplicate');
    ids.add(cmd.id);
  }
  const acIds = new Set();
  for (const ac of requirements.acceptanceCriteria) {
    exact(ac, ['id', 'text', 'verificationIds'], 'requirements-ac');
    textValue(ac.id);
    textValue(ac.text);
    if (
      acIds.has(ac.id) ||
      !Array.isArray(ac.verificationIds) ||
      !ac.verificationIds.length ||
      ac.verificationIds.some((id) => !ids.has(id))
    )
      fail('requirements-mapping');
    acIds.add(ac.id);
  }
  const normalizedRecipe = { sensitivity: 'history-sensitive', review: null, ...recipe };
  exact(
    normalizedRecipe,
    [
      'schema',
      'commands',
      'toolDigest',
      'runnerDigest',
      'lanes',
      'policy',
      'sensitivity',
      'review',
    ],
    'recipe-keys'
  );
  if (
    recipe.schema !== 'aitm.recipe/v2' ||
    !Array.isArray(recipe.commands) ||
    !recipe.commands.length
  )
    fail('recipe-incomplete');
  digestValue(recipe.toolDigest);
  digestValue(recipe.runnerDigest);
  policyValue(recipe.policy);
  if (!Array.isArray(recipe.lanes) || !recipe.lanes.length) fail('recipe-lanes');
  for (const cmd of recipe.commands) {
    exact(cmd, ['executable', 'args', 'lane'], 'recipe-command');
    textValue(cmd.executable);
    if (
      !Array.isArray(cmd.args) ||
      cmd.args.some((a) => typeof a !== 'string') ||
      !recipe.lanes.includes(cmd.lane)
    )
      fail('recipe-command');
  }
  if (normalizedRecipe.sensitivity === 'content-only') {
    exact(normalizedRecipe.review, ['id', 'actor'], 'recipe-review');
    textValue(normalizedRecipe.review.id);
    textValue(normalizedRecipe.review.actor);
  } else if (normalizedRecipe.sensitivity !== 'history-sensitive') fail('git-sensitivity');
  exact(
    environment,
    [
      'schema',
      'dependenciesDigest',
      'lockfileDigest',
      'node',
      'toolchain',
      'platform',
      'configDigests',
      'variables',
      'consumedFiles',
      'externalInputs',
      'complete',
    ],
    'environment-keys'
  );
  if (environment.schema !== 'aitm.environment/v2' || environment.complete !== true)
    fail('inputs-incomplete');
  digestValue(environment.dependenciesDigest);
  digestValue(environment.lockfileDigest);
  textValue(environment.node);
  textValue(environment.toolchain);
  exact(environment.platform, ['os', 'arch'], 'platform-keys');
  textValue(environment.platform.os);
  textValue(environment.platform.arch);
  for (const value of Object.values(environment.configDigests)) digestValue(value);
  for (const [name, value] of Object.entries(environment.variables)) {
    if (secretName.test(name)) fail('secret-input');
    if (typeof value !== 'string') fail('environment-variable');
  }
  if (!Array.isArray(environment.consumedFiles) || !Array.isArray(environment.externalInputs))
    fail('environment-inputs');
  for (const entry of environment.externalInputs) {
    exact(entry, ['provider', 'identity', 'digest'], 'external-input');
    textValue(entry.provider);
    textValue(entry.identity);
    digestValue(entry.digest);
  }
  canonical(environment);
  return normalizedRecipe;
}
