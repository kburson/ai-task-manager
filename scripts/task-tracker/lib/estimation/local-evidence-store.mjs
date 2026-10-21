// @story #2039 #2045
// cspell:ignore HJKMNP
// Immutable local evidence, separate from story content and cloud authority.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  resolveRuntimeRoot,
  assertRuntimeReadable,
  assertRuntimeStoragePath,
} from '../runtime-storage.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { validateLocalEvidence } from './local-evidence.mjs';
const stores = new WeakMap();
const uid = process.getuid?.();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const digest = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const id = (v) => typeof v === 'string' && /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(v);
function fail(reason, cause) {
  throw Object.assign(new Error('Local evidence store unavailable: ' + reason, { cause }), {
    code: 'LOCAL_EVIDENCE_STORE_UNAVAILABLE',
    reason,
  });
}
function guarded(operation) {
  try {
    return operation();
  } catch (cause) {
    if (cause.code === 'LOCAL_EVIDENCE_STORE_UNAVAILABLE') throw cause;
    fail('storage', cause);
  }
}
function directory(io, target, { create = false, privateMode = false } = {}) {
  if (create)
    try {
      io.mkdirSync(target, { mode: 0o700 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  const stat = io.lstatSync(target);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    io.realpathSync(target) !== target ||
    (uid !== undefined && stat.uid !== uid) ||
    (stat.mode & 0o022) !== 0 ||
    (privateMode && (stat.mode & 0o777) !== 0o700)
  )
    fail('directory');
}
function syncDirectory(io, target) {
  const fd = io.openSync(
    target,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW
  );
  try {
    io.fsyncSync(fd);
  } finally {
    io.closeSync(fd);
  }
}
function walk(record) {
  let current = record.projectRoot;
  directory(record.io, current);
  for (const segment of path.relative(current, record.path).split(path.sep)) {
    current = path.join(current, segment);
    directory(record.io, current, {
      privateMode: current === record.base || current === record.path,
    });
  }
  for (const name of ['payloads', 'plans', 'records', 'manifests'])
    directory(record.io, path.join(record.path, name), { privateMode: true });
}
function context(store) {
  const record = stores.get(store);
  if (!record) fail('store-capability');
  const root = resolveRuntimeRoot({ cwd: record.projectRoot, env: {} });
  const active = assertRuntimeReadable({ projectRoot: root.projectRoot, mainRoot: root.mainRoot });
  if (
    root.projectRoot !== record.projectRoot ||
    root.mainRoot !== record.mainRoot ||
    active.layout.localRoot !== record.localRoot
  )
    fail('root-drift');
  assertRuntimeStoragePath(record.path, record.localRoot);
  walk(record);
  return record;
}
function privateRead(io, file, { sync = false, max = 4 * 1024 * 1024, links = 1 } = {}) {
  const safe = (stat) =>
    stat.isFile() &&
    stat.nlink === links &&
    (stat.mode & 0o777) === 0o600 &&
    (uid === undefined || stat.uid === uid) &&
    stat.size <= max;
  const before = io.lstatSync(file);
  if (!safe(before)) fail('file');
  const fd = io.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    const opened = io.fstatSync(fd);
    if (!safe(opened) || opened.dev !== before.dev || opened.ino !== before.ino) fail('file-drift');
    const bytes = io.readFileSync(fd);
    const after = io.fstatSync(fd);
    if (!safe(after) || after.size !== bytes.length || bytes.length > max) fail('file-drift');
    if (sync) io.fsyncSync(fd);
    return bytes;
  } finally {
    io.closeSync(fd);
  }
}
function parse(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const value = JSON.parse(text);
  if (text !== canonicalRecordJson(value)) fail('encoding');
  return value;
}
function reconcileStageAlias(io, file, expected) {
  let published;
  try {
    published = io.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (!published.isFile() || published.nlink !== 2) return;
  const prefix = path.basename(file) + '.';
  const aliases = io.readdirSync(path.dirname(file)).filter((name) => {
    if (
      !name.startsWith(prefix) ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.tmp$/.test(
        name.slice(prefix.length)
      )
    )
      return false;
    const staged = io.lstatSync(path.join(path.dirname(file), name));
    return (
      staged.isFile() &&
      staged.dev === published.dev &&
      staged.ino === published.ino &&
      staged.nlink === 2 &&
      (staged.mode & 0o777) === 0o600 &&
      (uid === undefined || staged.uid === uid)
    );
  });
  if (aliases.length !== 1) return;
  if (!privateRead(io, file, { sync: true, links: 2 }).equals(expected))
    fail('immutable-collision');
  const alias = path.join(path.dirname(file), aliases[0]);
  const current = io.lstatSync(file),
    staged = io.lstatSync(alias);
  if (
    current.dev !== published.dev ||
    current.ino !== published.ino ||
    current.nlink !== 2 ||
    staged.dev !== current.dev ||
    staged.ino !== current.ino
  )
    fail('stage-alias-drift');
  // The complete canonical bytes and their directory entry are durable before
  // removing only the proven redundant staging name. Unknown aliases refuse.
  syncDirectory(io, path.dirname(file));
  io.unlinkSync(alias);
  syncDirectory(io, path.dirname(file));
}
function persist(io, file, bytes) {
  reconcileStageAlias(io, file, bytes);
  const reuse = () => {
    try {
      if (!privateRead(io, file, { sync: true }).equals(bytes)) fail('immutable-collision');
      syncDirectory(io, path.dirname(file));
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return false;
    }
  };
  if (reuse()) return;
  const temporary = file + '.' + randomUUID() + '.tmp';
  let fd;
  let failure;
  try {
    fd = io.openSync(
      temporary,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
      0o600
    );
    io.writeFileSync(fd, bytes);
    io.fsyncSync(fd);
    io.closeSync(fd);
    fd = undefined;
    try {
      io.linkSync(temporary, file);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!reuse()) throw error;
    }
    io.unlinkSync(temporary);
    syncDirectory(io, path.dirname(file));
  } catch (error) {
    failure = error;
  } finally {
    if (fd !== undefined)
      try {
        io.closeSync(fd);
      } catch (error) {
        failure ??= error;
      }
    // Reconcile a possibly completed local link by inode identity, never by age.
    // Retain failed, unreferenced stages; only a redundant published alias is removed.
    try {
      const staged = io.lstatSync(temporary);
      const published = io.lstatSync(file);
      if (staged.dev === published.dev && staged.ino === published.ino) {
        io.unlinkSync(temporary);
        syncDirectory(io, path.dirname(file));
      }
    } catch (error) {
      if (error.code !== 'ENOENT') failure ??= error;
    }
  }
  if (failure) throw failure;
  if (!privateRead(io, file, { sync: true }).equals(bytes)) fail('write-readback');
}
function recordReference(index) {
  return {
    schema: 'aitm.local-evidence-record-reference/v1',
    recordId: index.recordId,
    payloadDigest: index.payloadDigest,
    payloadPath: index.payloadPath,
  };
}
function readBundle(store, manifestDigest) {
  return guarded(() => {
    const record = context(store);
    if (!digest(manifestDigest)) fail('manifest-digest');
    const raw = privateRead(
      record.io,
      path.join(record.path, 'manifests', manifestDigest + '.json')
    );
    if (hash(raw) !== manifestDigest) fail('manifest-hash');
    const manifest = parse(raw);
    if (
      manifest.host !== record.host ||
      manifest.repository !== record.repository ||
      !digest(manifest.plan?.digest) ||
      !Array.isArray(manifest.inputs)
    )
      fail('manifest-scope');
    const payloads = new Map();
    for (const index of manifest.inputs) {
      if (
        !id(index.recordId) ||
        !digest(index.payloadDigest) ||
        index.payloadPath !== 'payloads/' + index.payloadDigest + '.json'
      )
        fail('reference-path');
      payloads.set(
        index.payloadPath,
        privateRead(record.io, path.join(record.path, index.payloadPath), { max: 256 * 1024 })
      );
      const retained = parse(
        privateRead(record.io, path.join(record.path, 'records', index.recordId + '.json'))
      );
      if (!same(retained, recordReference(index))) fail('record-reference');
    }
    const planBytes = privateRead(
      record.io,
      path.join(record.path, 'plans', manifest.plan.digest + '.txt')
    );
    const result = validateLocalEvidence({ manifest, payloads, planBytes });
    if (result.manifestDigest !== manifestDigest) fail('manifest-readback');
    context(store);
    return result;
  });
}
/** Requires an already activated native runtime; never initializes migration controls. */
export function openLocalEvidenceStore({ projectRoot, host, repository, fs: io = fs } = {}) {
  return guarded(() => {
    if (
      typeof host !== 'string' ||
      !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host) ||
      typeof repository !== 'string' ||
      !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repository) ||
      repository.split('/').some((v) => v === '.' || v === '..')
    )
      fail('scope');
    const root = resolveRuntimeRoot({ cwd: projectRoot, env: {} });
    if (root.projectRoot !== projectRoot || path.resolve(projectRoot) !== projectRoot)
      fail('project-root');
    const active = assertRuntimeReadable({ projectRoot, mainRoot: root.mainRoot });
    const localRoot = active.layout.localRoot;
    const base = path.join(localRoot, 'estimation-evidence');
    const location = path.join(base, hash(Buffer.from(canonicalRecordJson([host, repository]))));
    assertRuntimeStoragePath(location, localRoot);
    // Native parents already exist; only the evidence namespace is initialized here.
    let ancestor = projectRoot;
    directory(io, ancestor);
    for (const segment of path.relative(projectRoot, localRoot).split(path.sep)) {
      ancestor = path.join(ancestor, segment);
      directory(io, ancestor);
    }
    directory(io, base, { create: true, privateMode: true });
    syncDirectory(io, localRoot);
    const existing = io.existsSync(location);
    directory(io, location, { create: !existing, privateMode: true });
    syncDirectory(io, base);
    for (const name of ['payloads', 'plans', 'records', 'manifests']) {
      directory(io, path.join(location, name), { create: !existing, privateMode: true });
      syncDirectory(io, location);
    }
    const record = {
      projectRoot,
      mainRoot: root.mainRoot,
      localRoot,
      base,
      path: location,
      io,
      host,
      repository,
    };
    let store;
    store = Object.freeze({
      path: location,
      read: (manifestDigest) => readBundle(store, manifestDigest),
    });
    stores.set(store, record);
    context(store);
    return store;
  });
}
/** Offline import. Only the final durable manifest acknowledges a complete immutable bundle. */
export async function importLocalEvidence({ evidenceStore, bundle } = {}) {
  const record = guarded(() => context(evidenceStore));
  const validated = validateLocalEvidence(bundle);
  return guarded(() => {
    if (
      validated.manifest.host !== record.host ||
      validated.manifest.repository !== record.repository
    )
      fail('import-scope');
    for (const [relative, raw] of validated.payloads)
      persist(record.io, path.join(record.path, relative), raw);
    persist(
      record.io,
      path.join(record.path, 'plans', validated.manifest.plan.digest + '.txt'),
      validated.planBytes
    );
    for (const { descriptor } of validated.records)
      persist(
        record.io,
        path.join(record.path, 'records', descriptor.recordId + '.json'),
        Buffer.from(canonicalRecordJson(recordReference(descriptor)))
      );
    context(evidenceStore);
    persist(
      record.io,
      path.join(record.path, 'manifests', validated.manifestDigest + '.json'),
      Buffer.from(canonicalRecordJson(validated.manifest))
    );
    const result = readBundle(evidenceStore, validated.manifestDigest);
    return { manifestDigest: result.manifestDigest, manifest: result.manifest };
  });
}
