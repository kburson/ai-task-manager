// @story #1674
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOG_SCHEMA, VALIDATION_SCHEMA, coreGuidanceRequirements } from './requirements.mjs';
import { PROJECT_GUIDANCE_PATH } from './source.mjs';

export function classifyFileStat(realPath, stat) {
  if (!stat.isFile()) return { decision: 'indeterminate', code: 'guidance-source-not-regular' };
  const fields = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'];
  if (
    fields.some((field) => typeof stat[field] !== 'bigint') ||
    stat.dev <= 0n ||
    stat.ino <= 0n ||
    stat.size < 0n ||
    stat.mtimeNs <= 0n ||
    stat.ctimeNs <= 0n
  ) {
    return { decision: 'hash-and-recheck-tracking', realPath };
  }
  return {
    decision: 'stat',
    realPath,
    dev: String(stat.dev),
    ino: String(stat.ino),
    size: String(stat.size),
    mtimeNs: String(stat.mtimeNs),
    ctimeNs: String(stat.ctimeNs),
  };
}

/** Observe a regular file without reading or parsing its contents. */
export function observeFileIdentity(file) {
  try {
    const realPath = realpathSync(file);
    return classifyFileStat(realPath, statSync(realPath, { bigint: true }));
  } catch (error) {
    return { decision: 'indeterminate', code: error?.code ?? 'guidance-source-stat-failed' };
  }
}

function gitPath(projectRoot, args, env) {
  const value = execFileSync('git', ['rev-parse', ...args], {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  return path.resolve(projectRoot, value);
}

/** Include the effective linked-worktree index and any possible split-index dependency. */
export function observeGitIndexIdentity(
  projectRoot,
  { gitIndexFile = process.env.GIT_INDEX_FILE } = {}
) {
  try {
    const env = gitIndexFile ? { ...process.env, GIT_INDEX_FILE: gitIndexFile } : process.env;
    const gitDir = gitPath(projectRoot, ['--git-dir'], env);
    const indexPath = gitPath(projectRoot, ['--git-path', 'index'], env);
    const index = observeFileIdentity(indexPath);
    if (index.decision !== 'stat')
      return { decision: 'hash-and-recheck-tracking', gitDir, indexPath };
    // Git may rewrite stat-cache bytes during `status` without changing any staged entry.
    // The staged-entry stream is the stable semantic identity of this effective index.
    const staged = execFileSync('git', ['ls-files', '--stage', '-z'], {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
    const sharedIndexes = readdirSync(gitDir)
      .filter((name) => /^sharedindex\.[a-f0-9]+$/.test(name))
      .sort()
      .map((name) => observeFileIdentity(path.join(gitDir, name)));
    if (sharedIndexes.some((entry) => entry.decision !== 'stat')) {
      return { decision: 'hash-and-recheck-tracking', gitDir, indexPath };
    }
    return {
      decision: 'stat',
      gitDir,
      indexPath,
      stagedEntriesDigest: sha256(staged),
      trackedPath: PROJECT_GUIDANCE_PATH,
      sharedIndexes,
    };
  } catch {
    return { decision: 'hash-and-recheck-tracking' };
  }
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function fileDigest(file) {
  return sha256(readFileSync(file));
}

function registryDigest() {
  const requirements = coreGuidanceRequirements();
  return sha256(
    JSON.stringify({
      actionIds: [...requirements.actionIds].sort(),
      guardIds: [...requirements.guardIds].sort(),
      remediationIds: [...requirements.remediationIds].sort(),
      requiredEntries: requirements.requiredEntries,
    })
  );
}

/** Identity contains every source/runtime field even when a stat fallback is required. */
export function observeCacheIdentity({
  selected,
  projectRoot,
  profile,
  candidatePath = null,
} = {}) {
  if (!selected || selected.trust === 'indeterminate' || !selected.path) {
    return { decision: 'indeterminate', code: selected?.code ?? 'guidance-source-indeterminate' };
  }
  try {
    const sourcePath = profile === 'candidate' ? candidatePath : selected.path;
    if (!sourcePath) return { decision: 'indeterminate', code: 'guidance-candidate-path-missing' };
    const source = observeFileIdentity(sourcePath);
    const packageSource = observeFileIdentity(selected.packagePath);
    const releaseManifest = observeFileIdentity(selected.releaseManifestPath);
    if (
      [source, packageSource, releaseManifest].some((entry) => entry.decision === 'indeterminate')
    ) {
      return { decision: 'indeterminate', code: 'guidance-cache-source-observation-indeterminate' };
    }
    const index = projectRoot ? observeGitIndexIdentity(projectRoot) : null;
    const runtime = {
      packageVersion: selected.packageVersion,
      parser: 'js-yaml@5.4.2',
      adapter: 'js-yaml-events-v1',
      parserAdapterDigest: fileDigest(fileURLToPath(new URL('./parse.mjs', import.meta.url))),
      validatorDigest: fileDigest(fileURLToPath(new URL('./validate.mjs', import.meta.url))),
      requirementsDigest: fileDigest(fileURLToPath(new URL('./requirements.mjs', import.meta.url))),
      catalogSchema: CATALOG_SCHEMA,
      validationSchema: VALIDATION_SCHEMA,
      registryDigest: registryDigest(),
      publishedCatalogFileDigest: selected.publishedCatalogFileDigest,
    };
    if (!runtime.packageVersion || !runtime.publishedCatalogFileDigest) {
      return { decision: 'indeterminate', code: 'guidance-cache-runtime-indeterminate' };
    }
    const fallback = [source, packageSource, releaseManifest, index]
      .filter(Boolean)
      .some((entry) => entry.decision !== 'stat');
    const identity = {
      sourceType: selected.sourceType,
      selectedPath: path.resolve(sourcePath),
      profile,
      candidatePath: candidatePath ? path.resolve(candidatePath) : null,
      tracked: selected.tracked,
      warnings: selected.warnings,
      source,
      packageSource,
      releaseManifest,
      index,
      runtime,
    };
    if (fallback) {
      identity.contentDigests = {
        source: fileDigest(sourcePath),
        packageSource: fileDigest(selected.packagePath),
        releaseManifest: fileDigest(selected.releaseManifestPath),
      };
    }
    return { decision: fallback ? 'hash-and-recheck-tracking' : 'stat', identity };
  } catch {
    return { decision: 'indeterminate', code: 'guidance-cache-identity-unavailable' };
  }
}
