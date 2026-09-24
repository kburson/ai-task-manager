// @story #1674
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { observeCacheIdentity } from './cache-identity.mjs';
import { compileGuidance } from './compile.mjs';
import {
  loadSelectedGuidance,
  observeGuidanceSource,
  resolveGuidanceProjectRoot,
  resolveGuidanceSource,
} from './source.mjs';
import { validateGuidance } from './validate.mjs';

const MANIFEST = 'manifest.v1.json';
const ARTIFACTS = {
  agent: ['agent-index.v1.json', 'aitm.guidance-agent-index/v1', 'agentIndex'],
  human: ['human-catalog.v1.json', 'aitm.guidance-human-catalog/v1', 'humanCatalog'],
  diagnostics: ['diagnostics.v1.json', 'aitm.guidance-diagnostics/v1', 'diagnostics'],
};
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
// Parsed artifacts are process-local only. Bytes are still rehashed on every
// read, and callers get clones so one response cannot mutate another.
const parsedArtifacts = new Map();

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function summary(selected) {
  return {
    sourceType: selected.sourceType,
    path: selected.path,
    trust: selected.trust,
    tracked: selected.tracked,
    warnings: selected.warnings,
    catalogFileDigest: selected.catalogFileDigest ?? null,
    publishedCatalogFileDigest: selected.publishedCatalogFileDigest ?? null,
  };
}

function manifestResult(manifest, artifact = null, need = 'manifest') {
  return {
    valid: manifest.valid,
    code: manifest.code,
    source: manifest.selected,
    catalogDigest: manifest.catalogDigest,
    fingerprints: manifest.fingerprints,
    warnings: manifest.warnings,
    ...(need === 'agent' ? { agentIndex: artifact } : {}),
    ...(need === 'human' ? { humanCatalog: artifact } : {}),
    ...(need === 'diagnostics' ? { errors: artifact?.errors ?? [] } : {}),
  };
}

function readArtifact(cacheDir, descriptor, need) {
  const [filename, schema] = ARTIFACTS[need];
  if (
    !descriptor ||
    descriptor.path !== filename ||
    !/^sha256:[a-f0-9]{64}$/.test(descriptor.digest)
  ) {
    return null;
  }
  try {
    const bytes = readFileSync(path.join(cacheDir, filename));
    if (digest(bytes) !== descriptor.digest) return null;
    const memoKey = `${schema}:${descriptor.digest}`;
    const memoized = parsedArtifacts.get(memoKey);
    if (memoized) return structuredClone(memoized);
    const artifact = JSON.parse(bytes.toString('utf8'));
    if (artifact?.schema !== schema) return null;
    if (parsedArtifacts.size >= 32) parsedArtifacts.clear();
    parsedArtifacts.set(memoKey, artifact);
    return structuredClone(artifact);
  } catch {
    return null;
  }
}

function validDescriptor(descriptor, need) {
  return (
    descriptor?.path === ARTIFACTS[need][0] &&
    typeof descriptor.digest === 'string' &&
    SHA256_DIGEST.test(descriptor.digest)
  );
}

function validFingerprints(fingerprints, catalogDigest) {
  return (
    fingerprints !== null &&
    typeof fingerprints === 'object' &&
    fingerprints.catalogFileDigest === catalogDigest &&
    SHA256_DIGEST.test(fingerprints.catalogSemanticDigest) &&
    Array.isArray(fingerprints.entryDigests) &&
    fingerprints.entryDigests.length > 0 &&
    fingerprints.entryDigests.every(
      (entry) =>
        typeof entry?.id === 'string' &&
        entry.id.length > 0 &&
        SHA256_DIGEST.test(entry.agentDigest) &&
        SHA256_DIGEST.test(entry.humanDigest) &&
        SHA256_DIGEST.test(entry.entryDigest)
    )
  );
}

function coherentManifest(manifest) {
  if (
    !manifest ||
    typeof manifest.valid !== 'boolean' ||
    !manifest.selected ||
    typeof manifest.selected.path !== 'string' ||
    !Array.isArray(manifest.warnings) ||
    !manifest.artifacts ||
    typeof manifest.artifacts !== 'object'
  )
    return false;
  const artifacts = manifest.artifacts;
  if (manifest.valid) {
    return (
      manifest.code === null &&
      typeof manifest.catalogDigest === 'string' &&
      SHA256_DIGEST.test(manifest.catalogDigest) &&
      validFingerprints(manifest.fingerprints, manifest.catalogDigest) &&
      validDescriptor(artifacts.agent, 'agent') &&
      validDescriptor(artifacts.human, 'human') &&
      !Object.hasOwn(artifacts, 'diagnostics')
    );
  }
  return (
    typeof manifest.code === 'string' &&
    manifest.code.length > 0 &&
    !Object.hasOwn(artifacts, 'agent') &&
    !Object.hasOwn(artifacts, 'human') &&
    validDescriptor(artifacts.diagnostics, 'diagnostics')
  );
}

function readWarm(cacheDir, identity, need) {
  const manifest = readJson(path.join(cacheDir, MANIFEST));
  if (
    manifest?.schema !== 'aitm.guidance-cache-manifest/v1' ||
    !coherentManifest(manifest) ||
    JSON.stringify(manifest.identity) !== JSON.stringify(identity.identity)
  )
    return null;
  if (
    need === 'manifest' ||
    (!manifest.valid && need !== 'diagnostics') ||
    (manifest.valid && need === 'diagnostics')
  ) {
    return manifestResult(manifest, null, need);
  }
  const descriptor = manifest.artifacts?.[need];
  const artifact = readArtifact(cacheDir, descriptor, need);
  if (!artifact) return null;
  if (artifact.catalogDigest && artifact.catalogDigest !== manifest.catalogDigest) return null;
  return manifestResult(manifest, artifact, need);
}

function publish(cacheDir, manifest, compiled) {
  mkdirSync(cacheDir, { recursive: true });
  const suffix = `${process.pid}.${randomUUID()}`;
  const tempFiles = [];
  try {
    for (const [need, [filename, , property]] of Object.entries(ARTIFACTS)) {
      const artifact = compiled[property];
      if (!artifact) continue;
      const bytes = Buffer.from(JSON.stringify(artifact));
      const temp = path.join(cacheDir, `${filename}.${suffix}.tmp`);
      writeFileSync(temp, bytes, { flag: 'wx' });
      tempFiles.push(temp);
      renameSync(temp, path.join(cacheDir, filename));
      manifest.artifacts[need] = { path: filename, digest: digest(bytes) };
    }
    const tempManifest = path.join(cacheDir, `${MANIFEST}.${suffix}.tmp`);
    writeFileSync(tempManifest, JSON.stringify(manifest), { flag: 'wx' });
    tempFiles.push(tempManifest);
    renameSync(tempManifest, path.join(cacheDir, MANIFEST));
  } finally {
    for (const temp of tempFiles) rmSync(temp, { force: true });
  }
}

function coldCompile({
  projectRoot,
  moduleUrl,
  publishedOnly,
  cacheDir,
  need,
  profile,
  candidatePath,
}) {
  let publicationMismatch = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const selectedBefore = observeGuidanceSource({ projectRoot, moduleUrl, publishedOnly });
    const before = observeCacheIdentity({
      selected: selectedBefore,
      projectRoot,
      profile,
      candidatePath,
    });
    if (before.decision === 'indeterminate') {
      return { valid: false, code: before.code, source: selectedBefore };
    }
    let selected;
    let validation;
    if (profile === 'candidate') {
      try {
        const source = readFileSync(candidatePath);
        validation = validateGuidance({ source, sourcePath: candidatePath, profile: 'candidate' });
        selected = {
          sourceType: 'candidate',
          path: candidatePath,
          trust: 'candidate',
          tracked: null,
          warnings: [],
          catalogFileDigest: validation.catalogDigest,
          publishedCatalogFileDigest: selectedBefore.publishedCatalogFileDigest,
        };
      } catch {
        continue;
      }
    } else {
      selected = resolveGuidanceSource({ projectRoot, moduleUrl, publishedOnly });
      validation = loadSelectedGuidance(selected);
    }
    const selectedAfter = observeGuidanceSource({ projectRoot, moduleUrl, publishedOnly });
    const after = observeCacheIdentity({
      selected: selectedAfter,
      projectRoot,
      profile,
      candidatePath,
    });
    if (
      after.decision === 'indeterminate' ||
      JSON.stringify(after.identity) !== JSON.stringify(before.identity)
    ) {
      continue;
    }
    const compiled = compileGuidance(validation);
    const manifest = {
      schema: 'aitm.guidance-cache-manifest/v1',
      identity: before.identity,
      selected: summary(selected),
      valid: validation.valid,
      code: validation.code ?? (validation.valid ? null : 'guidance-catalog-invalid'),
      catalogDigest: validation.catalogDigest ?? null,
      fingerprints: validation.fingerprints ?? null,
      warnings: validation.warnings ?? [],
      artifacts: {},
    };
    publish(cacheDir, manifest, compiled);
    const loaded = readWarm(cacheDir, before, need);
    if (loaded) return loaded;
    publicationMismatch = true;
  }
  return {
    valid: false,
    code: publicationMismatch
      ? 'guidance-cache-publication-indeterminate'
      : 'guidance-source-changed-during-read',
    source: null,
  };
}

/** Load a manifest-first cache result; cold compilation is silent and never grants authority. */
export function loadGuidance({
  projectRoot = resolveGuidanceProjectRoot(),
  moduleUrl,
  selected = null,
  need = 'manifest',
  profile = 'active-project',
  candidatePath = null,
  publishedOnly = false,
  refresh = false,
} = {}) {
  if (!['manifest', 'agent', 'human', 'diagnostics'].includes(need)) {
    throw new TypeError(`unknown guidance need: ${need}`);
  }
  const observation = selected ?? observeGuidanceSource({ projectRoot, moduleUrl, publishedOnly });
  const identity = observeCacheIdentity({
    selected: observation,
    projectRoot,
    profile,
    candidatePath,
  });
  if (identity.decision === 'indeterminate') {
    return { valid: false, code: identity.code, source: observation };
  }
  const cacheDir = path.join(projectRoot ?? observation.packageRoot, '.tmp/aitm/guidance-cache');
  if (!refresh) {
    const warm = readWarm(cacheDir, identity, need);
    if (warm) return warm;
  }
  return coldCompile({
    projectRoot,
    moduleUrl,
    publishedOnly,
    cacheDir,
    need,
    profile,
    candidatePath,
  });
}
