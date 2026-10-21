// @story #2039 #2057
// Private explicit-export I/O. No lease, timer, cloud or lifecycle authority.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import {
  handoffFail,
  handoffHash,
  HANDOFF_MANIFEST_MAX_BYTES,
  validateStoryHandoffManifest,
} from './writer-handoff-bytes.mjs';
const uid = process.getuid?.();
const proofs = new WeakMap();
const same = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
export const PROTOCOL = '.writer-handoff';
export function directory(io, file, { create = false } = {}) {
  if (create)
    try {
      io.mkdirSync(file, { mode: 0o700 });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  const s = io.lstatSync(file);
  if (
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    io.realpathSync(file) !== file ||
    (s.mode & 0o777) !== 0o700 ||
    (uid !== undefined && s.uid !== uid)
  )
    handoffFail('directory');
  if (create) syncDirectory(io, path.dirname(file));
}
function inside(root, relative) {
  if (
    typeof relative !== 'string' ||
    path.isAbsolute(relative) ||
    relative.split(/[\\/]/).some((p) => !p || p === '.' || p === '..')
  )
    handoffFail('path');
  const file = path.join(root, relative);
  if (!file.startsWith(root + path.sep)) handoffFail('path');
  return file;
}
export function walk(io, root, relative, { create = false, leaf = false } = {}) {
  directory(io, root);
  const file = inside(root, relative);
  const end = leaf ? file : path.dirname(file);
  let current = root;
  for (const part of path.relative(root, end).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    directory(io, current, { create });
  }
  return file;
}
export function syncDirectory(io, file) {
  const fd = io.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW
  );
  try {
    io.fsyncSync(fd);
  } finally {
    io.closeSync(fd);
  }
}
function regular(s, links = 1) {
  return (
    s.isFile() &&
    s.nlink === links &&
    (s.mode & 0o777) === 0o600 &&
    (uid === undefined || s.uid === uid) &&
    Number.isSafeInteger(s.size) &&
    s.size >= 0
  );
}
function opened(io, file, { links = 1, max = Infinity } = {}, fn) {
  const before = io.lstatSync(file);
  if (!regular(before, links) || before.size > max) handoffFail('file');
  const fd = io.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    const start = io.fstatSync(fd);
    if (
      !regular(start, links) ||
      start.ino !== before.ino ||
      start.dev !== before.dev ||
      start.size !== before.size
    )
      handoffFail('file-drift');
    const result = fn(fd, start);
    const after = io.fstatSync(fd);
    const named = io.lstatSync(file);
    if (
      !regular(after, links) ||
      after.size !== start.size ||
      after.ino !== named.ino ||
      after.dev !== named.dev ||
      !regular(named, links)
    )
      handoffFail('file-drift');
    return result;
  } finally {
    io.closeSync(fd);
  }
}
export function hashFile(io, root, relative, { links = 1, sync = false } = {}) {
  const file = walk(io, root, relative);
  return opened(io, file, { links }, (fd, stat) => {
    const hash = createHash('sha256');
    const chunk = Buffer.alloc(65536);
    let size = 0;
    for (;;) {
      const n = io.readSync(fd, chunk, 0, chunk.length, null);
      if (!n) break;
      hash.update(chunk.subarray(0, n));
      size += n;
    }
    if (size !== stat.size) handoffFail('file-size-drift');
    if (sync) io.fsyncSync(fd);
    return { size, digest: hash.digest('hex') };
  });
}
/** Safe bounded raw native bytes; unlike protocol metadata these carry no added newline. */
export function readPrivateBytes(io, root, relative, { max = 4 * 1024 * 1024 } = {}) {
  return opened(io, walk(io, root, relative), { max }, (fd) => io.readFileSync(fd));
}
export function readMetadata(
  io,
  root,
  relative,
  { optional = false, max = 65536, links = 1 } = {}
) {
  directory(io, root);
  try {
    const file = walk(io, root, relative);
    return opened(io, file, { max, links }, (fd) => {
      const raw = io.readFileSync(fd);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
      const value = JSON.parse(text);
      if (text !== canonicalRecordJson(value) + '\n') handoffFail('ambiguous-json');
      return value;
    });
  } catch (e) {
    if (optional && e.code === 'ENOENT') return null;
    throw e;
  }
}
function recoverAlias(io, root, relative, expected) {
  const file = walk(io, root, relative);
  const stat = io.lstatSync(file);
  if (stat.nlink !== 2) return;
  const stages = path.join(root, PROTOCOL, 'stages');
  directory(io, stages);
  const prefix = handoffHash(relative) + '.';
  const aliases = io
    .readdirSync(stages)
    .filter((name) => name.startsWith(prefix) && /\.[a-f0-9-]{36}\.tmp$/.test(name))
    .filter((name) => {
      const s = io.lstatSync(path.join(stages, name));
      return s.dev === stat.dev && s.ino === stat.ino;
    });
  if (
    aliases.length !== 1 ||
    !regular(stat, 2) ||
    !same(hashFile(io, root, relative, { links: 2, sync: true }), expected)
  )
    handoffFail('stage-alias');
  const alias = path.join(stages, aliases[0]);
  const a = io.lstatSync(alias);
  if (!regular(a, 2) || a.ino !== stat.ino || a.dev !== stat.dev) handoffFail('stage-alias');
  syncDirectory(io, path.dirname(file));
  io.unlinkSync(alias);
  syncDirectory(io, stages);
}
export function publishFile(io, root, relative, { bytes, source, expected }) {
  const file = walk(io, root, relative, { create: true });
  walk(io, root, PROTOCOL + '/stages', { create: true, leaf: true });
  try {
    io.lstatSync(file);
    recoverAlias(io, root, relative, expected);
    if (!same(hashFile(io, root, relative, { sync: true }), expected))
      handoffFail('existing-bytes');
    syncDirectory(io, path.dirname(file));
    return;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const stageRelative = PROTOCOL + '/stages/' + handoffHash(relative) + '.' + randomUUID() + '.tmp';
  const stage = walk(io, root, stageRelative);
  let fd;
  try {
    fd = io.openSync(
      stage,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
      0o600
    );
    const hash = createHash('sha256');
    let size = 0;
    const write = (chunk) => {
      hash.update(chunk);
      size += chunk.length;
      let offset = 0;
      while (offset < chunk.length) {
        const n = io.writeSync(fd, chunk, offset, chunk.length - offset);
        if (n <= 0) handoffFail('short-write');
        offset += n;
      }
    };
    if (bytes !== undefined) write(Buffer.from(bytes));
    else {
      const input = walk(io, source.root, source.relative);
      opened(io, input, {}, (inputFd) => {
        const chunk = Buffer.alloc(65536);
        for (;;) {
          const n = io.readSync(inputFd, chunk, 0, chunk.length, null);
          if (!n) break;
          write(chunk.subarray(0, n));
        }
      });
    }
    if (!same({ size, digest: hash.digest('hex') }, expected)) handoffFail('copy-drift');
    io.fsyncSync(fd);
    io.closeSync(fd);
    fd = undefined;
    walk(io, root, relative);
    io.linkSync(stage, file);
    io.unlinkSync(stage);
    syncDirectory(io, path.dirname(file));
    syncDirectory(io, path.dirname(stage));
    if (!same(hashFile(io, root, relative), expected)) handoffFail('read-back');
  } finally {
    if (fd !== undefined) io.closeSync(fd);
  }
}
export function publishMetadata(io, root, relative, value) {
  const bytes = Buffer.from(canonicalRecordJson(value) + '\n');
  publishFile(io, root, relative, {
    bytes,
    expected: { size: bytes.length, digest: handoffHash(bytes) },
  });
}
export function protocol(io, root) {
  directory(io, root);
  const location = path.join(root, PROTOCOL);
  directory(io, location, { create: true });
  for (const name of io.readdirSync(location))
    if (!['stages', 'transfers', 'received', 'frozen.json'].includes(name))
      handoffFail('unknown-protocol-entry');
  for (const name of ['stages', 'transfers', 'received']) {
    directory(io, path.join(location, name), { create: true });
    syncDirectory(io, location);
  }
}
export function scanTree(io, root, { ownedLock = null, excludeProtocol = true } = {}) {
  const directories = [];
  const files = [];
  directory(io, root);
  const visit = (base, relative) => {
    for (const name of io.readdirSync(base).sort()) {
      const rel = relative ? relative + '/' + name : name;
      const file = path.join(base, name);
      const stat = io.lstatSync(file);
      if (!relative && name === PROTOCOL && excludeProtocol) {
        directory(io, file);
        continue;
      }
      if (!relative && name === 'write.lock') {
        if (
          !ownedLock ||
          !regular(stat) ||
          stat.ino !== ownedLock.ino ||
          stat.dev !== ownedLock.dev
        )
          handoffFail('cache-write-in-progress');
        continue;
      }
      if (stat.isDirectory()) {
        directory(io, file);
        directories.push(rel);
        visit(file, rel);
      } else {
        const measured = hashFile(io, root, rel);
        files.push({ path: rel, ...measured });
      }
    }
  };
  visit(root, '');
  return {
    directories: directories.sort(),
    files: files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  };
}
export function exactTree(io, root, manifest, options = {}) {
  const actual = scanTree(io, root, options);
  if (!same(actual, { directories: manifest.directories, files: manifest.files }))
    handoffFail('inventory-drift');
}
export function readExport(io, sourceRoot, transferId, bundleDigest) {
  const relative = PROTOCOL + '/transfers/' + transferId + '/manifest.json';
  const manifest = readMetadata(io, sourceRoot, relative, { max: HANDOFF_MANIFEST_MAX_BYTES });
  const validated = validateStoryHandoffManifest(manifest);
  if (validated.bundleDigest !== bundleDigest || manifest.transferId !== transferId)
    handoffFail('export-digest');
  const exportedRoot = path.join(sourceRoot, PROTOCOL, 'transfers', transferId, 'files');
  exactTree(io, exportedRoot, manifest, { excludeProtocol: false });
  return validated;
}
export function acknowledgment(
  io,
  manifest,
  bundleDigest,
  { checkWorking = true, recoverStage = false, deferStaged = false } = {}
) {
  const relative = PROTOCOL + '/received/' + manifest.transferId + '.json';
  const expected = {
    schema: 'aitm.story-writer-handoff-ack/v1',
    transferId: manifest.transferId,
    bundleDigest,
    recipient: manifest.target,
    sourceClaimDigest: handoffHash(canonicalRecordJson(manifest.sourceClaim)),
  };
  let record;
  const validate = (value) => {
    if (!same(value, expected)) handoffFail('acknowledgment');
  };
  if (recoverStage) record = recoverMetadata(io, manifest.target.cachePath, relative, validate);
  else
    try {
      record = readMetadata(io, manifest.target.cachePath, relative, { optional: true });
    } catch (cause) {
      // Only defer a complete, exact two-link record to the actual recipient.
      // No proof or cleanup is produced by this read; its stage must still be verified.
      if (!deferStaged) throw cause;
      const staged = readMetadata(io, manifest.target.cachePath, relative, { links: 2 });
      validate(staged);
      return null;
    }
  if (record === null) return null;
  validate(record);
  const retained = readMetadata(
    io,
    manifest.target.cachePath,
    PROTOCOL + '/received/' + manifest.transferId + '/manifest.json',
    { max: HANDOFF_MANIFEST_MAX_BYTES }
  );
  if (!same(retained, manifest)) handoffFail('acknowledgment-manifest');
  exactTree(
    io,
    path.join(manifest.target.cachePath, PROTOCOL, 'received', manifest.transferId, 'files'),
    manifest,
    { excludeProtocol: false }
  );
  if (checkWorking) exactTree(io, manifest.target.cachePath, manifest);
  const proof = Object.freeze({ transferId: manifest.transferId, bundleDigest });
  proofs.set(proof, { manifest, bundleDigest });
  return proof;
}
export function releaseProof(proof, claim, registryId) {
  const known = proofs.get(proof);
  if (
    !known ||
    !same(known.manifest.sourceClaim, claim) ||
    known.manifest.registryId !== registryId
  )
    handoffFail('release-proof');
  return known;
}
export function assertNotFrozen(io, claim) {
  try {
    const folder = path.join(claim.cachePath, PROTOCOL);
    io.lstatSync(folder);
    directory(io, folder);
    const frozen = readMetadata(io, claim.cachePath, PROTOCOL + '/frozen.json', { optional: true });
    if (frozen !== null)
      throw Object.assign(new Error('Story writer is fenced by an explicit handoff'), {
        code: 'STORY_WRITER_UNAVAILABLE',
        reason: 'handoff-frozen',
      });
  } catch (e) {
    if (e.code === 'ENOENT') return;
    throw e;
  }
}

/** Explicit matching-intent reconciliation, never an ordinary permissive read. */
export function recoverMetadata(io, root, relative, validate, options = {}) {
  let value;
  try {
    value = readMetadata(io, root, relative, { ...options, optional: true });
  } catch (cause) {
    const file = walk(io, root, relative);
    const stat = io.lstatSync(file);
    if (stat.nlink !== 2) throw cause;
    value = readMetadata(io, root, relative, { ...options, links: 2 });
    validate(value);
    publishMetadata(io, root, relative, value);
  }
  if (value !== null) validate(value);
  return value;
}
