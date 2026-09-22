// @story #1672
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeGuidanceSource } from './positions.mjs';
import { validateGuidance } from './validate.mjs';

export const PROJECT_GUIDANCE_PATH = '.ai-task-manager/aitm-guidance.yml';
export const PACKAGE_GUIDANCE_PATH = 'instructions/aitm-guidance.yml';
export const RELEASE_MANIFEST_PATH = 'instructions/aitm-guidance.release.json';
const PACKAGE_NAME = '@kburson/ai-task-manager';

export function resolveGuidanceProjectRoot(cwd = process.cwd()) {
  try {
    return realpathSync(
      execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    );
  } catch {
    return null;
  }
}

function failure(code, sourceType, selectedPath, reason) {
  return {
    sourceType,
    path: selectedPath,
    trust: 'indeterminate',
    code,
    reason,
    tracked: null,
    warnings: [],
    source: null,
    packageRoot: null,
  };
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function regularFile(file) {
  try {
    const stat = lstatSync(file);
    return stat.isFile() ? 'regular' : 'unsupported';
  } catch (error) {
    return error.code === 'ENOENT' ? 'missing' : 'unreadable';
  }
}

function normalizedDigest(bytes) {
  const normalized = decodeGuidanceSource(bytes);
  return `sha256:${createHash('sha256').update(normalized, 'utf8').digest('hex')}`;
}

function packageObservation(moduleUrl) {
  let modulePath;
  try {
    modulePath = realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return { error: 'guidance-package-resolution-unsupported' };
  }
  const packageRoot = path.resolve(path.dirname(modulePath), '..');
  const identity = readJson(path.join(packageRoot, 'package.json'));
  if (
    identity?.name !== PACKAGE_NAME ||
    typeof identity.version !== 'string' ||
    identity.dependencies?.['js-yaml'] !== '5.4.2'
  ) {
    return { error: 'guidance-package-identity-invalid' };
  }
  const sourcePath = path.join(packageRoot, PACKAGE_GUIDANCE_PATH);
  if (regularFile(sourcePath) !== 'regular') {
    return { error: 'guidance-package-source-unavailable', packageRoot, sourcePath };
  }
  const manifestPath = path.join(packageRoot, RELEASE_MANIFEST_PATH);
  if (regularFile(manifestPath) !== 'regular') {
    return { error: 'guidance-release-manifest-unavailable', packageRoot, sourcePath };
  }
  const manifest = readJson(manifestPath);
  if (
    manifest?.schema !== 'aitm.guidance-release/v1' ||
    manifest.package !== PACKAGE_NAME ||
    manifest.packageVersion !== identity.version ||
    manifest.catalogPath !== PACKAGE_GUIDANCE_PATH ||
    !/^sha256:[a-f0-9]{64}$/.test(manifest.catalogFileDigest ?? '') ||
    manifest.parser?.name !== 'js-yaml' ||
    manifest.parser?.version !== '5.4.2' ||
    manifest.compiler?.name !== 'aitm-guidance' ||
    manifest.compiler?.version !== 1 ||
    manifest.compiler?.adapter !== 'js-yaml-events-v1'
  ) {
    return { error: 'guidance-release-manifest-invalid', packageRoot, sourcePath };
  }
  let source;
  let digest;
  try {
    source = readFileSync(sourcePath);
    digest = normalizedDigest(source);
  } catch {
    return { error: 'guidance-package-source-unreadable', packageRoot, sourcePath };
  }
  return { packageRoot, sourcePath, source, digest, manifest };
}

function observeTracking(projectRoot) {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (realpathSync(root) !== realpathSync(projectRoot)) {
      return { tracked: null, code: 'guidance-project-root-indeterminate' };
    }
  } catch {
    return { tracked: null, code: 'guidance-project-tracking-indeterminate' };
  }
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', PROJECT_GUIDANCE_PATH], {
      cwd: projectRoot,
      stdio: 'ignore',
    });
  } catch (error) {
    if (error.status === 1) return { tracked: false, modified: false };
    return { tracked: null, code: 'guidance-project-tracking-indeterminate' };
  }
  try {
    const status = execFileSync('git', ['status', '--porcelain', '--', PROJECT_GUIDANCE_PATH], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { tracked: true, modified: status.trim() !== '' };
  } catch {
    return { tracked: null, code: 'guidance-project-tracking-indeterminate' };
  }
}

/** Select exactly one catalog. The default module URL binds package identity to this running module. */
export function resolveGuidanceSource({
  projectRoot = resolveGuidanceProjectRoot(),
  moduleUrl = import.meta.url,
  publishedOnly = false,
} = {}) {
  const packageResult = packageObservation(moduleUrl);
  if (!publishedOnly && projectRoot === null) {
    return failure('guidance-project-root-indeterminate', 'project', null, 'git-root-unavailable');
  }
  const projectPath = projectRoot === null ? null : path.join(projectRoot, PROJECT_GUIDANCE_PATH);
  const projectFileType = projectPath === null ? 'missing' : regularFile(projectPath);
  const selectedProject = !publishedOnly && projectFileType !== 'missing';
  const selectedPath = selectedProject ? projectPath : packageResult.sourcePath;
  const sourceType = selectedProject ? 'project' : 'package';
  if (packageResult.error) {
    return failure(packageResult.error, sourceType, selectedPath ?? null, packageResult.error);
  }
  if (!selectedProject) {
    return {
      sourceType,
      path: packageResult.sourcePath,
      trust:
        packageResult.digest === packageResult.manifest.catalogFileDigest
          ? 'published'
          : 'published-tampered',
      code: null,
      reason: 'running-package',
      tracked: null,
      warnings: [],
      source: packageResult.source,
      packageRoot: packageResult.packageRoot,
      catalogFileDigest: packageResult.digest,
      publishedCatalogFileDigest: packageResult.manifest.catalogFileDigest,
    };
  }
  if (projectFileType !== 'regular') {
    return failure(
      'guidance-project-source-invalid-type',
      sourceType,
      projectPath,
      projectFileType
    );
  }
  const tracking = observeTracking(projectRoot);
  if (tracking.tracked === null) {
    return failure(tracking.code, sourceType, projectPath, 'tracking-indeterminate');
  }
  let source;
  let digest;
  try {
    source = readFileSync(projectPath);
    digest = normalizedDigest(source);
  } catch {
    return failure('guidance-project-source-unreadable', sourceType, projectPath, 'unreadable');
  }
  return {
    sourceType,
    path: projectPath,
    trust: tracking.tracked
      ? digest === packageResult.digest
        ? 'project-owned-current'
        : 'project-owned-diverged'
      : 'project-untracked',
    code: null,
    reason: 'project-override',
    tracked: tracking.tracked,
    warnings: tracking.modified ? ['guidance-project-source-uncommitted'] : [],
    source,
    packageRoot: packageResult.packageRoot,
    catalogFileDigest: digest,
    publishedCatalogFileDigest: packageResult.manifest.catalogFileDigest,
  };
}

export function loadSelectedGuidance(selected) {
  if (!selected || selected.trust === 'indeterminate') {
    return {
      valid: false,
      code: selected?.code ?? 'guidance-source-indeterminate',
      source: selected,
    };
  }
  if (['project-untracked', 'published-tampered'].includes(selected.trust)) {
    return { valid: false, code: 'guidance-catalog-invalid', source: selected };
  }
  const validation = validateGuidance({
    source: selected.source,
    sourcePath: selected.sourceType === 'project' ? PROJECT_GUIDANCE_PATH : PACKAGE_GUIDANCE_PATH,
    packageRoot: selected.packageRoot,
    profile: selected.sourceType === 'project' ? 'active-project' : 'published',
    tracked: selected.tracked,
    fileType: 'regular',
  });
  return {
    ...validation,
    source: selected,
    code: validation.valid ? null : 'guidance-catalog-invalid',
  };
}
