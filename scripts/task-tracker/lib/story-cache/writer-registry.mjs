// @story #2042 #2056 #2057
// cspell:ignore EISSUELOCKED
// Local validation is separate from current assignment and registry authority.
import path from 'node:path';
import { validateStoryWriterClaim as validateClaim } from './writer-claim-shape.mjs';
import fs from 'node:fs';
import { resolveSessionId } from '../session-id.mjs';
import { assertNotFrozen, releaseProof, readMetadata, PROTOCOL } from './writer-handoff-io.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { resolveRuntimeRoot } from '../runtime-storage.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { storyIdentityKey } from './manifest.mjs';
import { openStoryStore, storyCachePath } from './store.mjs';
import { withIssueLock, currentIssueLockOwner, THIS_HOST } from '../../issue-mutator-lock.mjs';
import { cacheWriterOwnershipDecision } from '../ownership-policy.mjs';
const token = (v) => typeof v === 'string' && v.length > 0 && !/[\s\p{Cc}]/u.test(v);
const absolute = (v) => typeof v === 'string' && path.isAbsolute(v) && path.resolve(v) === v;
function fail(code, reason) {
  throw Object.assign(new Error(`Story writer refused: ${reason}`), { code, reason });
}
/** The original pure seed validates a tuple; acquired claims also re-read their native registry. */
export function assertStoryWriter(claim, context = {}) {
  validateClaim(claim, context);
  if (Object.hasOwn(context, 'registry') || Object.hasOwn(claim, 'registryKey')) {
    try {
      const registry = Object.hasOwn(context, 'registry')
        ? context.registry
        : openStoryWriterRegistry({ projectRoot: context.worktree });
      const { io, registryId } = registryContext(registry, context.worktree);
      if (!claim.registryKey) fail('STORY_WRITER_UNAVAILABLE', 'registry-key');
      const current = readClaim(
        io,
        path.join(registry.path, claim.registryKey + '.json'),
        registryId
      );
      if (!current) fail('STORY_WRITER_UNAVAILABLE', 'missing-claim');
      if (!same(current.claim, claim)) fail('STORY_WRITER_OWNED', 'registry-owner');
      safeDirectory(io, claim.worktree);
      let directory = claim.worktree;
      for (const [index, segment] of path
        .relative(claim.worktree, claim.cachePath)
        .split(path.sep)
        .entries()) {
        directory = path.join(directory, segment);
        safeDirectory(io, directory, { privateMode: index > 0 });
      }
      assertNotFrozen(io, claim);
    } catch (cause) {
      if (cause.code?.startsWith('STORY_WRITER_')) throw cause;
      fail('STORY_WRITER_UNAVAILABLE', 'registry-check');
    }
  }
}

const registries = new WeakMap();
const uid = process.getuid?.();
const same = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
function safeDirectory(io, target, { create = false, privateMode = false } = {}) {
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
    fail('STORY_WRITER_UNAVAILABLE', 'registry-directory');
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
/** Repository-shared ownership pointers only; no story content is stored here. */
export function openStoryWriterRegistry({ projectRoot, fs: io = fs } = {}) {
  try {
    const root = resolveRuntimeRoot({ cwd: projectRoot, env: {} });
    if (root.projectRoot !== projectRoot || !absolute(projectRoot))
      fail('STORY_WRITER_UNAVAILABLE', 'project-root');
    const common = root.worktreeIdentity.commonDir;
    safeDirectory(io, common);
    const parent = path.join(common, 'aitm');
    safeDirectory(io, parent, { create: true });
    syncDirectory(io, common);
    const location = path.join(parent, 'story-writers');
    const identityPath = path.join(parent, 'story-writers.identity.json');
    let identity = readPrivateJson(io, identityPath);
    if (identity) {
      // A previously initialized but missing namespace is lost evidence, not a new registry.
      safeDirectory(io, location, { privateMode: true });
    } else {
      if (io.existsSync(location) && io.readdirSync(location).length !== 0)
        fail('STORY_WRITER_UNAVAILABLE', 'registry-identity-missing');
      safeDirectory(io, location, { create: true, privateMode: true });
      const candidate = {
        schema: 'aitm.story-writer-registry-identity/v1',
        registryId: randomUUID(),
        commonDir: common,
        host: THIS_HOST,
      };
      try {
        persistClaim(io, identityPath, candidate);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      identity = readPrivateJson(io, identityPath);
    }
    if (
      !identity ||
      identity.schema !== 'aitm.story-writer-registry-identity/v1' ||
      !token(identity.registryId) ||
      identity.host !== THIS_HOST ||
      identity.commonDir !== common ||
      Object.keys(identity).sort().join(',') !== 'commonDir,host,registryId,schema'
    )
      fail('STORY_WRITER_UNAVAILABLE', 'registry-identity');
    syncDirectory(io, parent);
    const registry = Object.freeze({ path: location, identityPath });
    registries.set(registry, { root, io, parent, registryId: identity.registryId });
    return registry;
  } catch (cause) {
    if (cause.code?.startsWith('STORY_WRITER_')) throw cause;
    fail('STORY_WRITER_UNAVAILABLE', 'registry-open');
  }
}
function registryContext(registry, worktree) {
  const record = registries.get(registry);
  if (!record || record.root.projectRoot !== worktree)
    fail('STORY_WRITER_UNAVAILABLE', 'shared-registry');
  const root = resolveRuntimeRoot({ cwd: worktree, env: {} });
  if (
    root.mainRoot !== record.root.mainRoot ||
    root.projectRoot !== worktree ||
    root.worktreeIdentity.commonDir !== record.root.worktreeIdentity.commonDir
  )
    fail('STORY_WRITER_UNAVAILABLE', 'root-drift');
  safeDirectory(record.io, record.root.worktreeIdentity.commonDir);
  safeDirectory(record.io, record.parent);
  safeDirectory(record.io, registry.path, { privateMode: true });
  const identity = readPrivateJson(record.io, registry.identityPath);
  if (
    !identity ||
    identity.registryId !== record.registryId ||
    identity.host !== THIS_HOST ||
    identity.commonDir !== root.worktreeIdentity.commonDir ||
    identity.schema !== 'aitm.story-writer-registry-identity/v1' ||
    Object.keys(identity).sort().join(',') !== 'commonDir,host,registryId,schema'
  )
    fail('STORY_WRITER_UNAVAILABLE', 'registry-identity-drift');
  return record;
}
function claimFile(registry, identity) {
  const scope = canonicalRecordJson([
    identity.host.toLowerCase(),
    identity.repository.toLowerCase(),
    identity.issueNumber,
  ]);
  return path.join(registry.path, createHash('sha256').update(scope).digest('hex') + '.json');
}
function readPrivateJson(io, file) {
  let stat;
  try {
    stat = io.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const safe = (s) =>
    s.isFile() &&
    s.nlink === 1 &&
    (s.mode & 0o777) === 0o600 &&
    (uid === undefined || s.uid === uid) &&
    s.size <= 65536;
  if (!safe(stat)) fail('STORY_WRITER_UNAVAILABLE', 'registry-file');
  const fd = io.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    if (!safe(io.fstatSync(fd))) fail('STORY_WRITER_UNAVAILABLE', 'registry-file');
    const body = io.readFileSync(fd);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
    const value = JSON.parse(text);
    // Native immutable writers emit this exact closed encoding. Refuse duplicate
    // keys or alternate encodings rather than silently choosing one authority.
    if (text !== canonicalRecordJson(value) + '\n')
      fail('STORY_WRITER_UNAVAILABLE', 'ambiguous-registry-json');
    return value;
  } finally {
    io.closeSync(fd);
  }
}
function presenceFile(file) {
  return path.join(
    path.dirname(path.dirname(file)),
    'story-writer-' + path.basename(file, '.json') + '.presence.json'
  );
}
function presenceOf(claim, registryId) {
  return {
    schema: 'aitm.story-writer-presence/v1',
    registryId,
    identityKey: claim.identityKey,
    claimId: claim.claimId,
  };
}
function readClaim(io, file, registryId) {
  const record = readPrivateJson(io, file);
  if (record === null) return null;
  if (
    !record ||
    record.schema !== 'aitm.story-writer-registry/v1' ||
    record.host !== THIS_HOST ||
    record.registryId !== registryId ||
    !record.identity ||
    !record.claim ||
    Object.keys(record).sort().join(',') !== 'claim,host,identity,registryId,schema'
  )
    fail('STORY_WRITER_UNAVAILABLE', 'registry-record');
  const key = storyIdentityKey(record.identity);
  validateClaim(record.claim, {
    sessionId: record.claim.sessionId,
    worktree: record.claim.worktree,
  });
  if (record.claim.registryKey !== path.basename(file, '.json'))
    fail('STORY_WRITER_UNAVAILABLE', 'registry-key');
  if (record.claim.identityKey !== key) fail('STORY_WRITER_UNAVAILABLE', 'registry-identity');
  if (!same(readPrivateJson(io, presenceFile(file)), presenceOf(record.claim, registryId)))
    fail('STORY_WRITER_UNAVAILABLE', 'claim-presence');
  return record;
}
function persistClaim(io, file, record) {
  const temp = file + '.' + randomUUID() + '.tmp';
  let fd;
  let failure;
  try {
    fd = io.openSync(
      temp,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
      0o600
    );
    io.writeFileSync(fd, canonicalRecordJson(record) + '\n');
    io.fsyncSync(fd);
    io.closeSync(fd);
    fd = undefined;
    // Publish a complete immutable pointer without ever replacing another claim.
    io.linkSync(temp, file);
    io.unlinkSync(temp);
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
    try {
      io.unlinkSync(temp);
    } catch (error) {
      if (error.code !== 'ENOENT') failure ??= error;
    }
  }
  if (failure) throw failure;
}
/** Assignment is supplied by the caller's fresh bounded native observation. */
export async function acquireStoryWriter({
  identity,
  human,
  sessionId,
  worktree,
  cachePath,
  assignment,
  registry,
} = {}) {
  try {
    const decision = cacheWriterOwnershipDecision({ assignees: assignment, currentUser: human });
    if (!decision.ok) fail('STORY_WRITER_ASSIGNMENT', decision.kind);
    const key = storyIdentityKey(identity);
    if (
      !token(sessionId) ||
      !absolute(worktree) ||
      cachePath !== storyCachePath({ projectRoot: worktree, identity })
    )
      fail('STORY_WRITER_UNAVAILABLE', 'local-identity');
    const { root, io, registryId } = registryContext(registry, worktree);
    return await withIssueLock(
      { issue: identity.issueNumber, projDir: worktree, sessionId, retries: 0 },
      async () => {
        const owner = currentIssueLockOwner(identity.issueNumber);
        const revalidate = () => {
          if (
            !owner ||
            currentIssueLockOwner(identity.issueNumber) !== owner ||
            owner.projDir !== root.mainRoot ||
            owner.sessionId !== sessionId
          )
            fail('STORY_WRITER_UNAVAILABLE', 'native-lock-owner');
          registryContext(registry, worktree);
        };
        revalidate();
        const file = claimFile(registry, identity);
        const existing = readClaim(io, file, registryId);
        if (existing) {
          if (existing.claim.identityKey !== key)
            fail('STORY_WRITER_UNAVAILABLE', 'identity-drift');
          if (
            existing.claim.human !== decision.currentUser ||
            existing.claim.sessionId !== sessionId ||
            existing.claim.worktree !== worktree ||
            existing.claim.cachePath !== cachePath
          )
            fail('STORY_WRITER_OWNED', 'persistent-owner');
          if (!io.existsSync(cachePath)) fail('STORY_WRITER_UNAVAILABLE', 'missing-owned-cache');
          const store = await openStoryStore({ projectRoot: worktree, identity });
          revalidate();
          const current = await store.readGeneration();
          revalidate();
          if (current && current.manifest.claimId !== existing.claim.claimId)
            fail('STORY_WRITER_UNAVAILABLE', 'cache-claim');
          return Object.freeze({ ...existing.claim });
        }
        if (readPrivateJson(io, presenceFile(file)) !== null)
          fail('STORY_WRITER_UNAVAILABLE', 'missing-published-claim');
        if (io.existsSync(cachePath)) fail('STORY_WRITER_UNAVAILABLE', 'unclaimed-cache');
        const claim = {
          schema: 'aitm.story-writer-claim/v1',
          claimId: randomUUID(),
          identityKey: key,
          human: decision.currentUser,
          sessionId,
          worktree,
          cachePath,
          status: 'owned',
          transfer: null,
          registryKey: path.basename(file, '.json'),
        };
        // Retain issue-level presence before cache creation/publication. A crash or
        // partial registry loss cannot make another worktree look like a first owner.
        persistClaim(io, presenceFile(file), presenceOf(claim, registryId));
        await openStoryStore({ projectRoot: worktree, identity });
        revalidate();
        if (!same(readPrivateJson(io, presenceFile(file)), presenceOf(claim, registryId)))
          fail('STORY_WRITER_UNAVAILABLE', 'claim-presence-drift');
        persistClaim(io, file, {
          schema: 'aitm.story-writer-registry/v1',
          host: THIS_HOST,
          registryId,
          identity: {
            ...identity,
            host: identity.host.toLowerCase(),
            repository: identity.repository.toLowerCase(),
          },
          claim,
        });
        if (!same(readClaim(io, file, registryId)?.claim, claim))
          fail('STORY_WRITER_UNAVAILABLE', 'registry-readback');
        return Object.freeze(claim);
      }
    );
  } catch (cause) {
    if (cause.code?.startsWith('STORY_WRITER_') || cause.code === 'EISSUELOCKED') throw cause;
    fail('STORY_WRITER_UNAVAILABLE', 'acquisition');
  }
}

/** Inspect existing authority only; never initialize a namespace during binding cleanup. */
export function inspectStoryWriterScope({ projectRoot, host, repository, issueNumber } = {}) {
  try {
    const root = resolveRuntimeRoot({ cwd: projectRoot, env: {} });
    if (root.projectRoot !== projectRoot) fail('STORY_WRITER_UNAVAILABLE', 'project-root');
    const common = root.worktreeIdentity.commonDir;
    safeDirectory(fs, common);
    const parent = path.join(common, 'aitm');
    const location = path.join(parent, 'story-writers');
    const identityPath = path.join(parent, 'story-writers.identity.json');
    const registry = Object.freeze({ path: location, identityPath });
    const file = claimFile(registry, { host, repository, issueNumber });
    const present = (p) => {
      try {
        fs.lstatSync(p);
        return true;
      } catch (e) {
        if (e.code === 'ENOENT') return false;
        throw e;
      }
    };
    const any = present(identityPath) || present(location) || present(presenceFile(file));
    if (!any) return null;
    safeDirectory(fs, parent);
    const identity = readPrivateJson(fs, identityPath);
    if (!identity || !token(identity.registryId))
      fail('STORY_WRITER_UNAVAILABLE', 'registry-identity-missing');
    registries.set(registry, { root, io: fs, parent, registryId: identity.registryId });
    registryContext(registry, projectRoot);
    const record = readClaim(fs, file, identity.registryId);
    if (!record) {
      if (present(presenceFile(file))) fail('STORY_WRITER_UNAVAILABLE', 'missing-claim');
      return null;
    }
    if (claimFile(registry, record.identity) !== file) fail('STORY_WRITER_UNAVAILABLE', 'scope');
    const claim = pointerRecord(registry, record.identity);
    return Object.freeze({ identity: record.identity, claim, registryId: identity.registryId });
  } catch (cause) {
    if (cause.code?.startsWith('STORY_WRITER_')) throw cause;
    fail('STORY_WRITER_UNAVAILABLE', 'scope-inspection');
  }
}

function pointerRecord(registry, identity) {
  const known = registries.get(registry);
  if (!known) fail('STORY_WRITER_UNAVAILABLE', 'shared-registry');
  const context = registryContext(registry, known.root.projectRoot);
  const key = storyIdentityKey(identity);
  const file = claimFile(registry, identity);
  const record = readClaim(context.io, file, context.registryId);
  if (!record || record.claim.identityKey !== key)
    fail('STORY_WRITER_UNAVAILABLE', 'missing-or-mismatched-reference');
  const claim = record.claim;
  const owner = resolveRuntimeRoot({ cwd: claim.worktree, env: {} });
  if (
    owner.projectRoot !== claim.worktree ||
    owner.mainRoot !== context.root.mainRoot ||
    owner.worktreeIdentity.commonDir !== context.root.worktreeIdentity.commonDir ||
    claim.cachePath !== storyCachePath({ projectRoot: claim.worktree, identity: record.identity })
  )
    fail('STORY_WRITER_UNAVAILABLE', 'reference-owner');
  safeDirectory(context.io, claim.worktree);
  let directory = claim.worktree;
  for (const [index, segment] of path
    .relative(claim.worktree, claim.cachePath)
    .split(path.sep)
    .entries()) {
    directory = path.join(directory, segment);
    safeDirectory(context.io, directory, { privateMode: index > 0 });
  }
  for (const child of ['payloads', 'generations', 'manifests'])
    safeDirectory(context.io, path.join(claim.cachePath, child), { privateMode: true });
  return Object.freeze({ ...claim });
}
/** Read-only pointer observation; never acquisition, publication permission or content validation. */
export function resolveStoryWriter({ identity, registry } = {}) {
  try {
    return pointerRecord(registry, identity);
  } catch (cause) {
    if (cause.code?.startsWith('STORY_WRITER_')) throw cause;
    fail('STORY_WRITER_UNAVAILABLE', 'reference-resolution');
  }
}
/** Idempotently register an already-acquired pointer; never reconstruct or replace its authority. */
export function registerStoryWriter({ claim, registry } = {}) {
  try {
    validateClaim(claim, { sessionId: claim?.sessionId, worktree: claim?.worktree });
    if (!claim.registryKey) fail('STORY_WRITER_UNAVAILABLE', 'registry-key');
    const known = registries.get(registry);
    if (!known) fail('STORY_WRITER_UNAVAILABLE', 'shared-registry');
    const context = registryContext(registry, known.root.projectRoot);
    const file = path.join(registry.path, claim.registryKey + '.json');
    const record = readClaim(context.io, file, context.registryId);
    if (!record || !same(record.claim, claim) || claimFile(registry, record.identity) !== file)
      fail('STORY_WRITER_UNAVAILABLE', 'registration-owner');
    return pointerRecord(registry, record.identity);
  } catch (cause) {
    if (cause.code?.startsWith('STORY_WRITER_')) throw cause;
    fail('STORY_WRITER_UNAVAILABLE', 'reference-registration');
  }
}

/** Internal observation adapter; it never initializes missing native ownership. */
export function observeStoryWriterHandoff({ identity, registry, worktree } = {}) {
  const context = registryContext(registry, worktree);
  const claim = pointerRecord(registry, identity);
  return {
    identity: JSON.parse(canonicalRecordJson(identity)),
    claim,
    registryId: context.registryId,
    io: context.io,
  };
}
/** The sole handoff write seam. Only a freshly verified local byte-ack proof can commit. */
export async function withStoryWriterHandoff({ claim, registry }, operation) {
  validateClaim(claim, { sessionId: claim?.sessionId, worktree: claim?.worktree });
  const context = registryContext(registry, claim.worktree);
  const actor = () => {
    if (
      resolveSessionId() !== claim.sessionId ||
      resolveRuntimeRoot({ cwd: process.cwd(), env: {} }).projectRoot !== claim.worktree
    )
      fail('STORY_WRITER_OWNED', 'handoff-actor');
  };
  actor();
  const file = path.join(registry.path, claim.registryKey + '.json');
  const initial = readClaim(context.io, file, context.registryId);
  if (!initial) fail('STORY_WRITER_UNAVAILABLE', 'missing-claim');
  const identity = initial.identity;
  if (storyIdentityKey(identity) !== claim.identityKey || claimFile(registry, identity) !== file)
    fail('STORY_WRITER_UNAVAILABLE', 'handoff-identity');
  return withIssueLock(
    {
      issue: identity.issueNumber,
      projDir: claim.worktree,
      sessionId: claim.sessionId,
      retries: 0,
    },
    async () => {
      const owner = currentIssueLockOwner(identity.issueNumber);
      const check = () => {
        actor();
        if (
          !owner ||
          currentIssueLockOwner(identity.issueNumber) !== owner ||
          owner.projDir !== context.root.mainRoot ||
          owner.sessionId !== claim.sessionId
        )
          fail('STORY_WRITER_UNAVAILABLE', 'native-lock-owner');
        registryContext(registry, claim.worktree);
      };
      const observe = () => {
        check();
        return pointerRecord(registry, identity);
      };
      const commit = (proof) => {
        check();
        const { manifest } = releaseProof(proof, claim, context.registryId);
        const next = { ...claim, ...manifest.target };
        validateClaim(next, { sessionId: next.sessionId, worktree: next.worktree });
        const targetRoot = resolveRuntimeRoot({ cwd: next.worktree, env: {} });
        if (
          targetRoot.projectRoot !== next.worktree ||
          targetRoot.mainRoot !== context.root.mainRoot ||
          targetRoot.worktreeIdentity.commonDir !== context.root.worktreeIdentity.commonDir
        )
          fail('STORY_WRITER_UNAVAILABLE', 'handoff-target-root');
        const current = readClaim(context.io, file, context.registryId);
        if (same(current?.claim, next)) return pointerRecord(registry, identity);
        const frozen = readMetadata(context.io, claim.cachePath, PROTOCOL + '/frozen.json');
        if (
          frozen?.schema !== 'aitm.story-writer-handoff-intent/v1' ||
          frozen.transferId !== manifest.transferId ||
          frozen.bundleDigest !== proof.bundleDigest ||
          frozen.claimDigest !==
            createHash('sha256').update(canonicalRecordJson(claim)).digest('hex') ||
          !same(frozen.target, manifest.target)
        )
          fail('STORY_WRITER_UNAVAILABLE', 'handoff-release-intent');
        if (!same(current?.claim, claim)) fail('STORY_WRITER_OWNED', 'handoff-owner-changed');
        const temp = file + '.' + randomUUID() + '.tmp';
        let fd;
        try {
          fd = context.io.openSync(
            temp,
            fs.constants.O_WRONLY |
              fs.constants.O_CREAT |
              fs.constants.O_EXCL |
              fs.constants.O_NOFOLLOW,
            0o600
          );
          context.io.writeFileSync(fd, canonicalRecordJson({ ...current, claim: next }) + '\n');
          context.io.fsyncSync(fd);
          context.io.closeSync(fd);
          fd = undefined;
          check();
          if (!same(readClaim(context.io, file, context.registryId)?.claim, claim))
            fail('STORY_WRITER_OWNED', 'handoff-owner-changed');
          context.io.renameSync(temp, file);
          syncDirectory(context.io, registry.path);
          if (!same(readClaim(context.io, file, context.registryId)?.claim, next))
            fail('STORY_WRITER_UNAVAILABLE', 'handoff-readback');
          return pointerRecord(registry, identity);
        } finally {
          if (fd !== undefined) context.io.closeSync(fd);
        }
      };
      check();
      const result = await operation(
        Object.freeze({
          identity,
          registryId: context.registryId,
          io: context.io,
          check,
          observe,
          commit,
        })
      );
      check();
      return result;
    }
  );
}
