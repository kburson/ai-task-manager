// @story #1693
// Read-only observation and evaluation for the installed AITM bootstrap contract.

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProvider } from '../providers/index.mjs';
import { PREFERENCE_DEFAULTS } from '../task-tracker/config.mjs';
import {
  INSTALL_GITIGNORE_ENTRIES,
  matchesCodexBootstrapBlock,
  matchesManagedHookContract,
} from './install-content.mjs';
import {
  INSTALL_MANIFEST_PATH,
  compareManifestContract,
  createInstallContract,
  parseInstallManifest,
} from './install-contract.mjs';
import { collectPackageInventory } from './install-inventory.mjs';

export const DOCTOR_SCHEMA = 'aitm.doctor/v1';
export const INSTALL_STATUSES = Object.freeze([
  'ok',
  'missing',
  'untracked',
  'stale',
  'modified',
  'invalid',
  'unsafe',
]);

const digest = (value) => createHash('sha256').update(value).digest('hex');
const inside = (root, candidate) => {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

function row({ id, status, required = true, details, recovery }) {
  if (!INSTALL_STATUSES.includes(status)) throw new TypeError(`Unknown status: ${status}`);
  return Object.freeze({ id, status, required, details, ...(recovery ? { recovery } : {}) });
}

export function resolveDoctorProjectRoot(cwd, deps = {}) {
  const exec = deps.execFileSync || execFileSync;
  try {
    const root = exec('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return root
      ? { ok: true, root: resolve(root) }
      : { ok: false, details: 'Git returned no root.' };
  } catch (error) {
    return {
      ok: false,
      details: `Current directory is not a readable Git worktree: ${error.message}`,
    };
  }
}

function tracked(projectRoot, artifactPath, exec) {
  try {
    exec('git', ['ls-files', '--error-unmatch', '--', artifactPath], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

function inspectContainedPath(root, candidate, { allowFinalSymlink = false, deps = {} } = {}) {
  const stat = deps.lstatSync || lstatSync;
  const readlink = deps.readlinkSync || readlinkSync;
  const realpath = deps.realpathSync || realpathSync;
  const logicalRoot = resolve(root);
  const absolute = resolve(candidate);
  if (!inside(logicalRoot, absolute)) {
    return { exists: false, safety: 'unsafe', details: 'Path escapes the allowed root.' };
  }
  const realRoot = realpath(logicalRoot);
  const parts = relative(logicalRoot, absolute).split(/[\\/]/).filter(Boolean);
  let current = logicalRoot;
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    let info;
    try {
      info = stat(current);
    } catch (error) {
      if (error?.code === 'ELOOP') {
        return { exists: false, safety: 'unsafe', details: 'Path contains a cyclic symlink.' };
      }
      return { exists: false, safety: 'safe' };
    }
    if (!info.isSymbolicLink()) {
      if (index === parts.length - 1) return { exists: true, safety: 'safe', info };
      continue;
    }
    const final = index === parts.length - 1;
    if (final && allowFinalSymlink) return { exists: true, safety: 'safe', info };
    const target = readlink(current);
    if (isAbsolute(target)) {
      return { exists: true, safety: 'unsafe', details: 'Path contains an absolute symlink.' };
    }
    let resolved;
    try {
      resolved = realpath(resolve(dirname(current), target));
    } catch (error) {
      return {
        exists: true,
        safety: 'unsafe',
        details:
          error?.code === 'ELOOP'
            ? 'Path contains a cyclic symlink.'
            : 'Path contains a broken symlink.',
      };
    }
    if (!inside(realRoot, resolved)) {
      return { exists: true, safety: 'unsafe', details: 'Path escapes the allowed root.' };
    }
  }
  return { exists: true, safety: 'safe', info: stat(absolute) };
}

function safeSymlink(projectRoot, path, expected) {
  const target = readlinkSync(path);
  if (isAbsolute(target)) return { safety: 'unsafe', details: 'Symlink target is absolute.' };
  let resolved;
  try {
    resolved = realpathSync(resolve(dirname(path), target));
  } catch (error) {
    const cycle = error?.code === 'ELOOP';
    return {
      safety: 'unsafe',
      details: cycle ? 'Symlink target is cyclic.' : 'Symlink target is broken.',
    };
  }
  const realRoot = realpathSync(projectRoot);
  if (!inside(realRoot, resolved))
    return { safety: 'unsafe', details: 'Symlink escapes the project.' };
  if (expected) {
    try {
      if (resolved !== realpathSync(expected)) {
        return {
          safety: 'safe',
          details: 'Symlink does not reach its declared package target.',
          matches: false,
        };
      }
    } catch {
      return { safety: 'unsafe', details: 'Declared package target is unavailable.' };
    }
  }
  return {
    safety: 'safe',
    details: 'Relative symlink resolves inside the project.',
    matches: true,
  };
}

function expectedSymlinkTarget(packageRoot, artifact) {
  const match = /^provider\.([^.]+)\.skill$/.exec(artifact.id);
  if (!match) return null;
  const adapter = getProvider(match[1]);
  return adapter ? join(packageRoot, dirname(adapter.skillAdapterPath)) : null;
}

function preferencesMatch(value) {
  const current = value?.preferences;
  if (!current || typeof current !== 'object' || Array.isArray(current)) return false;
  return Object.entries(PREFERENCE_DEFAULTS).every(([key, expected]) => {
    if (!(key in current)) return false;
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      return Object.keys(expected).every((nested) => nested in (current[key] || {}));
    }
    return true;
  });
}

function contentMatches(artifact, path, manifest) {
  if (artifact.ownership === 'reference') {
    if (artifact.kind !== 'json-fragment') return true;
    JSON.parse(readFileSync(path, 'utf8'));
    return true;
  }
  if (artifact.kind === 'symlink') return undefined;
  const content = readFileSync(path);
  if (artifact.digest) return digest(content) === artifact.digest;
  if (artifact.kind === 'managed-block') {
    const text = content.toString('utf8');
    if (artifact.contract === 'codex-superpowers-repo') {
      return matchesCodexBootstrapBlock(text, { scope: 'repo' });
    }
    if (artifact.contract === 'aitm-gitignore') {
      return INSTALL_GITIGNORE_ENTRIES.every((entry) => text.split(/\r?\n/).includes(entry));
    }
  }
  if (artifact.kind === 'json-fragment') {
    const value = JSON.parse(content.toString('utf8'));
    const provider = /^provider\.([^.]+)\.hooks$/.exec(artifact.id)?.[1];
    if (provider) {
      return matchesManagedHookContract(provider, value, {
        memoryIndexHook: manifest.intent.features.memoryIndex,
      });
    }
    if (artifact.contract === 'task-tracker-preferences') return preferencesMatch(value);
  }
  // Some generated memory artifacts are selected user-approved inputs and have
  // no package-side canonical bytes. Their declared existence/tracking is the contract.
  return true;
}

export function observeInstallation({ projectRoot, packageRoot, manifest, contract, deps = {} }) {
  const exec = deps.execFileSync || execFileSync;
  const byId = {};
  for (const artifact of contract.artifacts) {
    const absolute = resolve(projectRoot, artifact.path);
    const pathResult = inspectContainedPath(projectRoot, absolute, {
      allowFinalSymlink: artifact.kind === 'symlink',
      deps,
    });
    if (pathResult.safety === 'unsafe') {
      byId[artifact.id] = Object.freeze({
        exists: pathResult.exists,
        tracked: false,
        pathSafety: 'unsafe',
        details: pathResult.details,
      });
      continue;
    }
    if (!pathResult.exists) {
      byId[artifact.id] = Object.freeze({ exists: false, tracked: false, pathSafety: 'safe' });
      continue;
    }
    const info = pathResult.info;
    const observation = {
      exists: true,
      tracked: tracked(projectRoot, artifact.path, exec),
      pathSafety: 'safe',
    };
    if (artifact.kind === 'symlink') {
      if (!info.isSymbolicLink()) {
        observation.symlinkSafety = 'invalid';
        observation.contentMatches = false;
        observation.details = 'Declared symlink is not a symlink.';
      } else {
        const link = safeSymlink(
          projectRoot,
          absolute,
          expectedSymlinkTarget(packageRoot, artifact)
        );
        observation.symlinkSafety = link.safety;
        observation.contentMatches = link.matches ?? false;
        observation.details = link.details;
      }
    } else if (info.isSymbolicLink()) {
      observation.symlinkSafety = 'unsafe';
      observation.contentMatches = false;
      observation.details = 'A non-symlink artifact was replaced by a symlink.';
    } else {
      try {
        if (!inside(realpathSync(projectRoot), realpathSync(absolute))) {
          observation.pathSafety = 'unsafe';
          observation.contentMatches = false;
          observation.details = 'Artifact resolves outside the project through a parent symlink.';
          byId[artifact.id] = Object.freeze(observation);
          continue;
        }
        observation.contentMatches = contentMatches(artifact, absolute, manifest);
      } catch (error) {
        observation.contentMatches = false;
        observation.invalid = true;
        observation.details = `Artifact cannot be interpreted: ${error.message}`;
      }
    }
    byId[artifact.id] = Object.freeze(observation);
  }
  return Object.freeze({ byId: Object.freeze(byId) });
}

const reinstall =
  'Rerun npx ai-task-manager install with the intended providers and options, review the diff, and commit the portable outputs.';

export function evaluateInstallation({
  projectRoot,
  manifestResult,
  contractResult,
  observations,
  hostObservations = [],
}) {
  const checks = [
    row({ id: 'package.runtime', status: 'ok', details: 'AITM doctor runtime is available.' }),
    row({
      id: 'git.repository',
      status: projectRoot ? 'ok' : 'missing',
      details: projectRoot
        ? `Git project root: ${projectRoot}`
        : 'No readable Git worktree was found.',
      recovery: projectRoot
        ? undefined
        : 'Run doctor from inside the installed project Git worktree.',
    }),
  ];
  if (!manifestResult?.ok) {
    checks.push(
      row({
        id: 'manifest.file',
        status: manifestResult?.status || 'missing',
        details: manifestResult?.details || 'The install manifest is missing.',
        recovery: reinstall,
      })
    );
  } else {
    checks.push(row({ id: 'manifest.file', status: 'ok', details: 'Install manifest is valid.' }));
    checks.push(
      row({
        id: 'manifest.contract',
        status: contractResult?.compatible ? 'ok' : 'stale',
        details: contractResult?.compatible
          ? 'Manifest matches the current package contract.'
          : 'Manifest was generated from an incompatible package contract.',
        recovery: contractResult?.compatible ? undefined : reinstall,
      })
    );
    checks.push(
      row({
        id: 'manifest.tracked',
        status: manifestResult.tracked ? 'ok' : 'untracked',
        details: manifestResult.tracked
          ? 'Install manifest is tracked by Git.'
          : 'The install manifest is not tracked by Git.',
        recovery: manifestResult.tracked
          ? undefined
          : `Review and commit ${INSTALL_MANIFEST_PATH}.`,
      })
    );
    for (const artifact of manifestResult.manifest.artifacts) {
      const seen = observations?.byId?.[artifact.id];
      let status = 'ok';
      let details = `${artifact.path} matches its declared contract.`;
      let recovery;
      if (seen?.pathSafety === 'unsafe' || seen?.symlinkSafety === 'unsafe') {
        status = 'unsafe';
        details = seen.details || `${artifact.path} is unsafe.`;
        recovery =
          'Reinstall in portable stub mode or correct the selected portable symlink arrangement.';
      } else if (seen?.invalid || seen?.symlinkSafety === 'invalid') {
        status = 'invalid';
        details = seen.details;
        recovery = reinstall;
      } else if (!seen?.exists) {
        status = 'missing';
        details = `${artifact.path} is missing.`;
        recovery = reinstall;
      } else if (!seen.tracked) {
        status = 'untracked';
        details = `${artifact.path} exists but is not tracked by Git.`;
        recovery = `Review and commit ${artifact.path}.`;
      } else if (seen.contentMatches === false) {
        status = 'modified';
        details = seen.details || `${artifact.path} differs from its declared AITM content.`;
        recovery = reinstall;
      }
      checks.push(row({ id: artifact.id, status, required: artifact.required, details, recovery }));
    }
  }
  for (const observation of hostObservations) {
    checks.push(row({ ...observation, required: false }));
  }
  const optional = checks.filter((item) => !item.required && item.status !== 'ok').length;
  const unhealthy = checks.filter((item) => item.required && item.status !== 'ok').length;
  return Object.freeze({
    schema: DOCTOR_SCHEMA,
    healthy: unhealthy === 0,
    projectRoot: projectRoot || null,
    summary: Object.freeze({
      ok: checks.filter((item) => item.status === 'ok').length,
      unhealthy,
      optional,
    }),
    checks: Object.freeze(checks),
  });
}

function observeCodexHost(manifest, deps = {}) {
  if (!manifest.intent.features.codexSuperpowers) return [];
  const home = (deps.homedir || homedir)();
  const observations = [];
  const skillPath = join(home, '.codex', 'skills', 'using-superpowers', 'SKILL.md');
  const skill = inspectContainedPath(home, skillPath, { deps });
  observations.push({
    id: 'host.codex.superpowers.skills',
    status: skill.safety === 'unsafe' ? 'unsafe' : skill.exists ? 'ok' : 'missing',
    details:
      skill.safety === 'unsafe'
        ? skill.details
        : skill.exists
          ? 'Mirrored Codex Superpowers skills are visible on this host.'
          : 'Mirrored Codex Superpowers skills are not visible on this host.',
  });
  if (manifest.intent.features.codexSuperpowersGlobal) {
    const agentsPath = join(home, '.codex', 'AGENTS.md');
    const agents = inspectContainedPath(home, agentsPath, { deps });
    let status = agents.safety === 'unsafe' ? 'unsafe' : agents.exists ? 'ok' : 'missing';
    let details = agents.details;
    if (status === 'ok') {
      try {
        const matches = matchesCodexBootstrapBlock(readFileSync(agentsPath, 'utf8'), {
          scope: 'global',
        });
        status = matches ? 'ok' : 'modified';
        details = matches
          ? 'The global Codex bootstrap block matches the installed contract.'
          : 'The global Codex bootstrap block differs from the installed contract.';
      } catch (error) {
        status = 'invalid';
        details = `The global Codex bootstrap cannot be interpreted: ${error.message}`;
      }
    }
    observations.push({
      id: 'host.codex.superpowers.agents',
      status,
      details: details || 'The global Codex AGENTS bootstrap is not visible on this host.',
    });
  }
  return observations;
}

export function diagnoseInstallation({ cwd = process.cwd(), packageRoot, deps = {} } = {}) {
  const rootResult = resolveDoctorProjectRoot(cwd, deps);
  if (!rootResult.ok) {
    return evaluateInstallation({
      projectRoot: null,
      manifestResult: { ok: false, status: 'missing', details: rootResult.details },
    });
  }
  const projectRoot = rootResult.root;
  const runtimeRoot = packageRoot || resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const manifestPath = join(projectRoot, INSTALL_MANIFEST_PATH);
  const manifestPathResult = inspectContainedPath(projectRoot, manifestPath, { deps });
  if (manifestPathResult.safety === 'unsafe' || manifestPathResult.info?.isSymbolicLink()) {
    return evaluateInstallation({
      projectRoot,
      manifestResult: {
        ok: false,
        status: 'unsafe',
        details:
          manifestPathResult.details || 'Install manifest must not be read through a symlink.',
      },
    });
  }
  if (!manifestPathResult.exists) {
    return evaluateInstallation({ projectRoot, manifestResult: { ok: false, status: 'missing' } });
  }
  let manifest;
  try {
    manifest = parseInstallManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  } catch (error) {
    return evaluateInstallation({
      projectRoot,
      manifestResult: {
        ok: false,
        status: 'invalid',
        details: `Install manifest is invalid: ${error.message}`,
      },
    });
  }
  const current = createInstallContract({
    intent: manifest.intent,
    adapters: manifest.intent.providers.map(getProvider),
    inventory: collectPackageInventory(runtimeRoot),
  });
  const contractResult = compareManifestContract(manifest, current);
  const observations = observeInstallation({
    projectRoot,
    packageRoot: runtimeRoot,
    manifest,
    contract: { artifacts: manifest.artifacts },
    deps,
  });
  return evaluateInstallation({
    projectRoot,
    manifestResult: {
      ok: true,
      manifest,
      tracked: tracked(projectRoot, INSTALL_MANIFEST_PATH, deps.execFileSync || execFileSync),
    },
    contractResult,
    observations,
    hostObservations: observeCodexHost(manifest, deps),
  });
}
