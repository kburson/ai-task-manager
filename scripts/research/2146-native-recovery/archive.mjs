// @story #2146
// Repository-only preservation of one frozen spike; not a general archive format.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  closeSync,
  fchmodSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

export const PINS = Object.freeze({
  sourceCommit: '2fd89e1103a0ee1976e0e1a1210c2d4e1bb57de0',
  sourceTree: '36a4b5ba652094df909b05b4a99352bb7e41233d',
  manifestSha256: '78afd54726726495057aacba467593b922b218d602081bf6b392274bc2514781',
  originalVerifierSha256: 'e5a8f03a08a2e2b8d5dd9efc420e683d979d6a3b6911e64dd9bff260e8d6fc77',
  originalHarnessSha256: '767fce262ef84ba7b1202519a9f95a4a10617a92ae74da37f9a27a481d0f82a1',
  reportSha256: 'c6c7c01006f77be50f24423f9280d47e07498c240a7dbd53eff9b2f29dc5cb8d',
  planSha256: '1b20fedde2acd4a8e8c4bc41af74656e48932af101444fe21c674562f22b7dc1',
});
export const ORIGINAL_RELATIVE_ROOT = '.scratch/native-recovery-spike/followup-20261103T233057Z';
export const ORIGINAL_ROOT =
  '/Users/kpburson/.codex/worktrees/3d20/ai-task-manager/' + ORIGINAL_RELATIVE_ROOT;
const PINNED_FILES = {
  'verify-v2.mjs': PINS.originalVerifierSha256,
  'harness.mjs': PINS.originalHarnessSha256,
  'report-v2.md': PINS.reportSha256,
  '2026-11-03-2146-native-recovery-defect-plan.md': PINS.planSha256,
};
const ROOT_KEYS = [
  'schema',
  'issue',
  'originalEvidenceRoot',
  'relativeEvidenceRoot',
  'sourceCommit',
  'sourceTree',
  'manifestSha256',
  'originalVerifierSha256',
  'originalHarnessSha256',
  'reportSha256',
  'planSha256',
  'artifactCount',
  'fileCount',
  'objectCount',
  'totalBytes',
  'uniqueBytes',
  'objectFile',
  'files',
];
const HEX = /^[a-f0-9]{64}$/;
const trusted = new WeakSet();
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => {
  throw new Error('archive: ' + message);
};
const requireThat = (condition, message) => {
  if (!condition) fail(message);
};
const keys = (value, expected, label) => {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), label + ' object');
  requireThat(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()),
    label + ' keys'
  );
};
const jsonBytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n');

export function canonicalPath(value) {
  requireThat(typeof value === 'string' && value.length > 0, 'path empty');
  requireThat(
    !path.isAbsolute(value) &&
      !/^[a-z]:/i.test(value) &&
      !value.includes('\\') &&
      !value.includes('\0'),
    'path absolute or noncanonical'
  );
  requireThat(
    !value.split('/').some((part) => ['', '.', '..', '.git'].includes(part)),
    'path segment'
  );
  return value;
}

export function requirePhysicalDirectory(directory) {
  const absolute = path.resolve(directory);
  requireThat(realpathSync(absolute) === absolute, 'directory symlink ancestor');
  requireThat(
    lstatSync(absolute).isDirectory() && !lstatSync(absolute).isSymbolicLink(),
    'directory kind'
  );
  return absolute;
}

function containedFile(root, relative) {
  const parts = canonicalPath(relative).split('/');
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = lstatSync(current);
    requireThat(!stat.isSymbolicLink(), 'symlink in file path');
    requireThat(
      index === parts.length - 1 ? stat.isFile() : stat.isDirectory(),
      'file ancestor kind'
    );
  }
  return current;
}

function manifestFrom(bytes) {
  requireThat(sha(bytes) === PINS.manifestSha256, 'original manifest pin');
  const manifest = JSON.parse(bytes);
  requireThat(
    manifest.sourceHead === PINS.sourceCommit &&
      manifest.sourceTree === PINS.sourceTree &&
      manifest.sourceStatus === '',
    'original source pins'
  );
  requireThat(
    Object.keys(manifest.artifacts).length === 1133 && Object.keys(manifest.sources).length === 12,
    'original inventory counts'
  );
  for (const [name, digest] of Object.entries(PINNED_FILES))
    requireThat(manifest.artifacts[name] === digest, 'original executable/report pin');
  return manifest;
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function buildArchive(evidenceRoot) {
  const root = requirePhysicalDirectory(evidenceRoot);
  const manifestBytes = readFileSync(containedFile(root, 'manifest-v2.json'));
  const manifest = manifestFrom(manifestBytes);
  const objects = new Map();
  const files = [...Object.keys(manifest.artifacts), 'manifest-v2.json'].sort().map((name) => {
    const file = containedFile(root, name),
      stat = lstatSync(file),
      bytes = readFileSync(file),
      digest = sha(bytes);
    requireThat(
      digest === (name === 'manifest-v2.json' ? PINS.manifestSha256 : manifest.artifacts[name]),
      'original artifact digest: ' + name
    );
    requireThat((stat.mode & 0o777) === 0o644, 'original file mode');
    objects.set(digest, bytes);
    return { path: name, sha256: digest, size: bytes.length, mode: stat.mode & 0o777 };
  });
  const raw = Buffer.from(
    JSON.stringify(
      [...objects]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([digest, bytes]) => [digest, bytes.toString('base64')])
    ) + '\n'
  );
  const compressed = gzipSync(raw, { level: 9 });
  // Freeze the original carrier's OS byte across hosts without changing archived bytes.
  compressed[9] = 19;
  const index = {
    schema: 'aitm.spike-archive/v1',
    issue: 2146,
    originalEvidenceRoot: ORIGINAL_ROOT,
    relativeEvidenceRoot: ORIGINAL_RELATIVE_ROOT,
    ...PINS,
    artifactCount: 1133,
    fileCount: files.length,
    objectCount: objects.size,
    totalBytes: files.reduce((total, file) => total + file.size, 0),
    uniqueBytes: [...objects.values()].reduce((total, bytes) => total + bytes.length, 0),
    objectFile: {
      path: 'objects.json.gz',
      size: compressed.length,
      sha256: sha(compressed),
      uncompressedBytes: raw.length,
    },
    files,
  };
  validateArchive(jsonBytes(index), compressed);
  return { index, compressed };
}

export function validateArchive(indexBytes, compressed) {
  requireThat(indexBytes.length <= 1024 * 1024, 'index size limit');
  requireThat(compressed.length <= 2 * 1024 * 1024, 'compressed size limit');
  const index = JSON.parse(indexBytes);
  requireThat(
    jsonBytes(index).equals(Buffer.from(indexBytes)),
    'noncanonical or duplicate index JSON'
  );
  keys(index, ROOT_KEYS, 'index');
  requireThat(index.schema === 'aitm.spike-archive/v1' && index.issue === 2146, 'schema');
  requireThat(
    index.originalEvidenceRoot === ORIGINAL_ROOT &&
      index.relativeEvidenceRoot === ORIGINAL_RELATIVE_ROOT,
    'root pin'
  );
  for (const [key, digest] of Object.entries(PINS))
    requireThat(index[key] === digest, 'pin ' + key);
  requireThat(
    index.artifactCount === 1133 && index.fileCount === 1134 && index.objectCount === 593,
    'inventory counts'
  );
  requireThat(
    index.totalBytes === 119208600 &&
      index.totalBytes <= 120 * 1024 * 1024 &&
      index.uniqueBytes === 5549342,
    'expanded size limit'
  );
  keys(index.objectFile, ['path', 'size', 'sha256', 'uncompressedBytes'], 'object file');
  requireThat(
    index.objectFile.path === 'objects.json.gz' &&
      index.objectFile.size === compressed.length &&
      index.objectFile.sha256 === sha(compressed),
    'archive digest or size'
  );
  requireThat(
    compressed.subarray(0, 10).equals(Buffer.from('1f8b0800000000000213', 'hex')),
    'noncanonical gzip header'
  );
  requireThat(
    Number.isSafeInteger(index.objectFile.uncompressedBytes) &&
      index.objectFile.uncompressedBytes <= 8 * 1024 * 1024,
    'inflation size limit'
  );
  const raw = gunzipSync(compressed, { maxOutputLength: 8 * 1024 * 1024 });
  requireThat(raw.length === index.objectFile.uncompressedBytes, 'inflated size');
  const pairs = JSON.parse(raw);
  requireThat(
    Array.isArray(pairs) &&
      pairs.length === index.objectCount &&
      Buffer.from(JSON.stringify(pairs) + '\n').equals(raw),
    'canonical object array'
  );
  const objects = new Map();
  let previous = '',
    uniqueBytes = 0;
  for (const pair of pairs) {
    requireThat(
      Array.isArray(pair) &&
        pair.length === 2 &&
        HEX.test(pair[0]) &&
        typeof pair[1] === 'string' &&
        pair[0] > previous,
      'object identity/order'
    );
    const bytes = Buffer.from(pair[1], 'base64');
    requireThat(
      bytes.toString('base64') === pair[1] && sha(bytes) === pair[0],
      'object content digest/base64'
    );
    objects.set(pair[0], bytes);
    previous = pair[0];
    uniqueBytes += bytes.length;
  }
  requireThat(uniqueBytes === index.uniqueBytes, 'unique size');
  requireThat(objects.has(PINS.manifestSha256), 'missing original manifest');
  const manifest = manifestFrom(objects.get(PINS.manifestSha256));
  const expectedNames = [...Object.keys(manifest.artifacts), 'manifest-v2.json'].sort();
  requireThat(
    Array.isArray(index.files) && index.files.length === expectedNames.length,
    'missing/extra member'
  );
  const directories = new Set();
  const used = new Set();
  let totalBytes = 0;
  for (const [ordinal, file] of index.files.entries()) {
    keys(file, ['path', 'sha256', 'size', 'mode'], 'file entry');
    canonicalPath(file.path);
    requireThat(file.path === expectedNames[ordinal], 'file inventory/order/duplicate');
    requireThat(
      file.mode === 0o644 &&
        Number.isSafeInteger(file.size) &&
        file.size >= 0 &&
        HEX.test(file.sha256),
      'file metadata'
    );
    const expected =
      file.path === 'manifest-v2.json' ? PINS.manifestSha256 : manifest.artifacts[file.path];
    requireThat(file.sha256 === expected, 'file original digest');
    const bytes = objects.get(file.sha256);
    requireThat(bytes && bytes.length === file.size, 'missing object/file size');
    const pieces = file.path.split('/');
    pieces.pop();
    while (pieces.length) {
      directories.add(pieces.join('/'));
      pieces.pop();
    }
    used.add(file.sha256);
    totalBytes += file.size;
  }
  requireThat(
    totalBytes === index.totalBytes && used.size === objects.size,
    'unused object/total size'
  );
  for (const file of index.files)
    requireThat(!directories.has(file.path), 'file/directory prefix collision');
  const result = { index: freeze(index), objects, directories, inventoryDigest: sha(indexBytes) };
  trusted.add(result);
  return result;
}

export function restoreArchive(validated, emptyDestination) {
  requireThat(trusted.has(validated), 'unvalidated extraction');
  const root = requirePhysicalDirectory(emptyDestination);
  requireThat(readdirSync(root).length === 0, 'destination must be empty');
  for (const file of validated.index.files) {
    const bytes = validated.objects.get(file.sha256);
    requireThat(
      bytes && bytes.length === file.size && sha(bytes) === file.sha256,
      'extraction content changed'
    );
    const parts = canonicalPath(file.path).split('/');
    let directory = root;
    for (const part of parts.slice(0, -1)) {
      directory = path.join(directory, part);
      try {
        mkdirSync(directory, { mode: 0o700 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      requirePhysicalDirectory(directory);
    }
    const target = path.join(directory, parts.at(-1));
    const descriptor = openSync(target, 'wx', 0o600);
    try {
      writeFileSync(descriptor, bytes);
      fchmodSync(descriptor, file.mode);
    } finally {
      closeSync(descriptor);
    }
    assert.equal(sha(readFileSync(containedFile(root, file.path))), file.sha256);
  }
  return validated.inventoryDigest;
}
