// @story #1692
import { createHash } from 'node:crypto';
import { isAbsolute, posix } from 'node:path';

import { listProviders } from '../providers/index.mjs';
import { RUNTIME_REL } from '../task-tracker/paths.mjs';
import { renderClaudeCommandStub, renderProviderSkillStub } from './install-content.mjs';

export const INSTALL_MANIFEST_PATH = '.ai-task-manager/install-manifest.json';
export const INSTALL_MANIFEST_SCHEMA = 'aitm.install-manifest/v1';

const KINDS = new Set(['file', 'symlink', 'json-fragment', 'managed-block']);
const OWNERSHIP = new Set(['generated', 'managed-fragment', 'reference']);

function fail(code, detail = '') {
  throw new TypeError(`${code}${detail ? `: ${detail}` : ''}`);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

function contentDigest(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function safePath(value) {
  const raw = String(value || '');
  if (!raw || isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) fail('absolute-path', raw);
  if (raw.includes('\\')) fail('path-traversal', raw);
  const normalized = posix.normalize(raw);
  if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) {
    fail('path-traversal', raw);
  }
  return normalized;
}

function normalizeFeatures(value = {}) {
  return Object.freeze({
    memoryIndex: value.memoryIndex === true,
    codexSuperpowers: value.codexSuperpowers === true,
    codexSuperpowersGlobal: value.codexSuperpowersGlobal === true,
  });
}

export function normalizeInstallIntent(input = {}) {
  const known = new Set(listProviders());
  const providers = [...new Set((input.providers || []).map(String))].sort();
  for (const provider of providers) if (!known.has(provider)) fail('provider', provider);
  const linkMode = input.linkMode || 'stub';
  if (!['stub', 'symlink'].includes(linkMode)) fail('link-mode', linkMode);
  const features = normalizeFeatures(input.features);
  if (
    (features.codexSuperpowers || features.codexSuperpowersGlobal) &&
    !providers.includes('codex')
  ) {
    fail('feature-combination', 'Codex bootstrap requires the codex provider');
  }
  if (features.codexSuperpowersGlobal && !features.codexSuperpowers) {
    fail('feature-combination', 'global Codex bootstrap requires Codex bootstrap');
  }
  const memoryFiles = [...new Set((input.memoryFiles || []).map(safePath))].sort();
  return Object.freeze({ providers, linkMode, features, memoryFiles });
}

function artifact(value) {
  if (!value || typeof value !== 'object') fail('artifact-shape');
  const id = String(value.id || '').trim();
  const contract = String(value.contract || '').trim();
  if (!id || !contract || !KINDS.has(value.kind) || !OWNERSHIP.has(value.ownership)) {
    fail('artifact-shape', id || 'unknown');
  }
  const result = {
    id,
    path: safePath(value.path),
    kind: value.kind,
    ownership: value.ownership,
    required: value.required !== false,
    contract,
  };
  if (value.digest !== undefined) {
    if (!/^[a-f0-9]{64}$/.test(String(value.digest))) fail('artifact-shape', `${id} digest`);
    result.digest = String(value.digest);
  }
  return Object.freeze(result);
}

function validateArtifacts(values) {
  const artifacts = values.map(artifact).sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set();
  const paths = new Map();
  for (const item of artifacts) {
    if (ids.has(item.id)) fail('duplicate-id', item.id);
    ids.add(item.id);
    const prior = paths.get(item.path);
    if (prior) fail('duplicate-path-contract', item.path);
    paths.set(item.path, item.contract);
  }
  return Object.freeze(artifacts);
}

export function createInstallContract({ intent: rawIntent, adapters = [], inventory } = {}) {
  const intent = normalizeInstallIntent(rawIntent);
  if (!inventory) fail('inventory');
  const byName = new Map(adapters.map((adapter) => [adapter.name, adapter]));
  const artifacts = [];
  for (const provider of intent.providers) {
    const adapter = byName.get(provider);
    if (!adapter) fail('provider', `${provider} adapter missing`);
    const recipe = adapter.installRecipe || {};
    const skill = {
      id: `provider.${provider}.skill`,
      path: posix.join(adapter.installTarget, 'SKILL.md'),
      kind: intent.linkMode === 'symlink' ? 'symlink' : 'file',
      ownership: 'generated',
      required: true,
      contract: recipe.skillContract,
    };
    if (intent.linkMode === 'stub') skill.digest = contentDigest(renderProviderSkillStub(provider));
    artifacts.push(skill);
    if (recipe.hookTarget) {
      artifacts.push({
        id: `provider.${provider}.hooks`,
        path: recipe.hookTarget,
        kind: 'json-fragment',
        ownership: 'managed-fragment',
        required: true,
        contract: recipe.hookContract,
      });
    }
    if (recipe.commandTarget) {
      artifacts.push({
        id: `provider.${provider}.command`,
        path: recipe.commandTarget,
        kind: 'file',
        ownership: 'generated',
        required: true,
        contract: recipe.commandContract,
        digest: contentDigest(renderClaudeCommandStub()),
      });
    }
  }
  if (intent.features.codexSuperpowers && !intent.features.codexSuperpowersGlobal) {
    artifacts.push({
      id: 'provider.codex.bootstrap',
      path: 'AGENTS.md',
      kind: 'managed-block',
      ownership: 'managed-fragment',
      required: true,
      contract: 'codex-superpowers-repo',
    });
  }
  for (const item of [...inventory.templates, ...inventory.references, ...inventory.configs])
    artifacts.push(item);
  artifacts.push({
    id: 'config.task-tracker',
    path: RUNTIME_REL.config,
    kind: 'json-fragment',
    ownership: 'managed-fragment',
    required: true,
    contract: 'task-tracker-preferences',
  });
  for (const file of intent.memoryFiles) {
    artifacts.push({
      id: `memory.${file}`,
      path: file,
      kind: 'file',
      ownership: 'generated',
      required: true,
      contract: 'memory-seed',
    });
  }
  if (intent.memoryFiles.length) {
    artifacts.push({
      id: 'memory.index',
      path: '.ai-task-manager/memory/MEMORY.md',
      kind: 'file',
      ownership: 'generated',
      required: true,
      contract: 'memory-index',
    });
  }
  artifacts.push({
    id: 'project.gitignore',
    path: '.gitignore',
    kind: 'managed-block',
    ownership: 'managed-fragment',
    required: true,
    contract: 'aitm-gitignore',
  });
  const normalizedArtifacts = validateArtifacts(artifacts);
  return Object.freeze({
    intent,
    artifacts: normalizedArtifacts,
    contractDigest: digest({ intent, artifacts: normalizedArtifacts }),
  });
}

export function createInstallManifest({ packageName, packageVersion, contract } = {}) {
  if (!contract?.contractDigest) fail('contract');
  const manifest = {
    schema: INSTALL_MANIFEST_SCHEMA,
    intent: contract.intent,
    generatedBy: {
      packageName: String(packageName || ''),
      packageVersion: String(packageVersion || ''),
      contractDigest: contract.contractDigest,
    },
    artifacts: contract.artifacts,
  };
  return parseInstallManifest(manifest);
}

export function parseInstallManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('schema');
  if (value.schema !== INSTALL_MANIFEST_SCHEMA) fail('schema', String(value.schema));
  const intent = normalizeInstallIntent(value.intent);
  const generatedBy = value.generatedBy;
  if (
    !generatedBy ||
    !generatedBy.packageName ||
    !generatedBy.packageVersion ||
    !/^[a-f0-9]{64}$/.test(String(generatedBy.contractDigest || ''))
  )
    fail('artifact-shape', 'generatedBy');
  if (!Array.isArray(value.artifacts)) fail('artifact-shape', 'artifacts');
  return Object.freeze({
    schema: INSTALL_MANIFEST_SCHEMA,
    intent,
    generatedBy: Object.freeze({
      packageName: String(generatedBy.packageName),
      packageVersion: String(generatedBy.packageVersion),
      contractDigest: String(generatedBy.contractDigest),
    }),
    artifacts: validateArtifacts(value.artifacts),
  });
}

export function compareManifestContract(manifestInput, contract) {
  const manifest = parseInstallManifest(manifestInput);
  return manifest.generatedBy.contractDigest === contract?.contractDigest
    ? { compatible: true }
    : { compatible: false, reason: 'contract-digest' };
}
