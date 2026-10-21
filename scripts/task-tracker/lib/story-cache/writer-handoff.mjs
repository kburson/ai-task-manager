// @story #2039 #2057
// cspell:ignore EISSUELOCKED
// Explicit local transfer; receiving bytes never grants cloud or publication authority.
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveRuntimeRoot } from '../runtime-storage.mjs';
import { resolveSessionId } from '../session-id.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { cacheWriterOwnershipDecision } from '../ownership-policy.mjs';
import { openStoryStore, storyCachePath } from './store.mjs';
import { observeStoryWriterHandoff, withStoryWriterHandoff } from './writer-registry.mjs';
import {
  handoffHash,
  handoffFail,
  validateStoryHandoffManifest,
  HANDOFF_MANIFEST_MAX_BYTES,
} from './writer-handoff-bytes.mjs';
import {
  PROTOCOL,
  directory,
  walk,
  protocol,
  scanTree,
  exactTree,
  publishFile,
  publishMetadata,
  readMetadata,
  recoverMetadata,
  readExport,
  acknowledgment,
  syncDirectory,
} from './writer-handoff-io.mjs';
export { validateStoryHandoffBundle } from './writer-handoff-bytes.mjs';
const same = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const id = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const tuple = (t) => ({
  human: t.human,
  sessionId: t.sessionId,
  worktree: t.worktree,
  cachePath: t.cachePath,
});
function actor(expected) {
  if (
    resolveSessionId() !== expected.sessionId ||
    resolveRuntimeRoot({ cwd: process.cwd(), env: {} }).projectRoot !== expected.worktree
  )
    handoffFail('actor');
}
function scopedRecord(record, { schema, claimDigest, target }) {
  if (
    !record ||
    record.schema !== schema ||
    record.claimDigest !== claimDigest ||
    !same(record.target, target) ||
    !id(record.transferId)
  )
    handoffFail('retained-intent');
  const fields =
    schema === 'aitm.story-writer-handoff-intent/v1'
      ? 'bundleDigest,claimDigest,schema,target,transferId'
      : 'claimDigest,schema,target,transferId';
  if (Object.keys(record).sort().join(',') !== fields) handoffFail('retained-intent');
}
async function assigned(target, check) {
  const assignment =
    typeof target.assignment === 'function' ? await target.assignment() : target.assignment;
  check();
  if (!cacheWriterOwnershipDecision({ assignees: assignment, currentUser: target.human }).ok)
    handoffFail('assignment');
}
function sourceLock(io, root, record) {
  publishMetadata(io, root, 'write.lock', record);
  const file = walk(io, root, 'write.lock');
  const stat = io.lstatSync(file);
  return {
    stat,
    release: () => {
      const current = io.lstatSync(file);
      if (
        current.ino !== stat.ino ||
        current.dev !== stat.dev ||
        !same(readMetadata(io, root, 'write.lock'), record)
      )
        handoffFail('cache-lock-changed');
      io.unlinkSync(file);
      syncDirectory(io, root);
    },
  };
}
function existingAck(io, manifest, digest, options) {
  try {
    return acknowledgment(io, manifest, digest, options);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
function expectedRequest(manifest, bundleDigest) {
  return Object.freeze({
    identity: manifest.identity,
    transferId: manifest.transferId,
    bundleDigest,
    exportPath: path.join(
      manifest.sourceClaim.cachePath,
      PROTOCOL,
      'transfers',
      manifest.transferId
    ),
  });
}
function completedExport(io, root, claim, target) {
  const matches = [];
  const folder = path.join(root, PROTOCOL, 'transfers');
  directory(io, folder);
  for (const name of io.readdirSync(folder)) {
    if (!id(name)) handoffFail('unknown-export');
    const m = readMetadata(io, root, PROTOCOL + '/transfers/' + name + '/manifest.json', {
      max: HANDOFF_MANIFEST_MAX_BYTES,
    });
    if (same(m.sourceClaim, claim) && same(m.target, target))
      matches.push(validateStoryHandoffManifest(m));
  }
  if (matches.length !== 1) handoffFail('ambiguous-completion');
  return matches[0];
}
export async function transferStoryWriter({ claim, target, store, registry } = {}) {
  try {
    if (
      !target ||
      Object.keys(target).sort().join(',') !==
        'acknowledge,assignment,cachePath,human,sessionId,worktree' ||
      typeof target.acknowledge !== 'function' ||
      store?.cachePath !== claim?.cachePath
    )
      handoffFail('target-or-store');
    actor(claim);
    return await withStoryWriterHandoff({ claim, registry }, async (ctx) => {
      const io = ctx.io;
      const destination = tuple(target);
      const claimDigest = handoffHash(canonicalRecordJson(claim));
      await assigned(target, ctx.check);
      const root = resolveRuntimeRoot({ cwd: destination.worktree, env: {} });
      ctx.check();
      const sourceRoot = resolveRuntimeRoot({ cwd: claim.worktree, env: {} });
      if (
        root.projectRoot !== destination.worktree ||
        root.mainRoot !== sourceRoot.mainRoot ||
        root.worktreeIdentity.commonDir !== sourceRoot.worktreeIdentity.commonDir ||
        destination.cachePath !==
          storyCachePath({ projectRoot: destination.worktree, identity: ctx.identity })
      )
        handoffFail('target-root');
      protocol(io, claim.cachePath);
      const scope = { claimDigest, target: destination };
      let frozen = recoverMetadata(io, claim.cachePath, PROTOCOL + '/frozen.json', (r) =>
        scopedRecord(r, { ...scope, schema: 'aitm.story-writer-handoff-intent/v1' })
      );
      let validated;
      const current = ctx.observe();
      const next = { ...claim, ...destination };
      if (!same(current, claim)) {
        if (!same(current, next)) handoffFail('owner-changed');
        if (frozen)
          validated = readExport(io, claim.cachePath, frozen.transferId, frozen.bundleDigest);
        else validated = completedExport(io, claim.cachePath, claim, destination);
        const proof = existingAck(io, validated.manifest, validated.bundleDigest, {
          checkWorking: false,
        });
        if (!proof) handoffFail('missing-acknowledgment');
        ctx.commit(proof);
        // Reconcile a committed pointer whose matching fence removal was interrupted.
        if (claim.cachePath === destination.cachePath && frozen) {
          if (!same(readMetadata(io, claim.cachePath, PROTOCOL + '/frozen.json'), frozen))
            handoffFail('frozen-intent-changed');
          io.unlinkSync(path.join(claim.cachePath, PROTOCOL, 'frozen.json'));
          syncDirectory(io, path.join(claim.cachePath, PROTOCOL));
        }
        return {
          status: 'transferred',
          ...expectedRequest(validated.manifest, validated.bundleDigest),
          claim: next,
          reconciled: true,
        };
      }
      const retainedLock = recoverMetadata(io, claim.cachePath, 'write.lock', (r) =>
        scopedRecord(r, { ...scope, schema: 'aitm.story-writer-handoff-lock/v1' })
      );
      const transferId = frozen?.transferId ?? retainedLock?.transferId ?? randomUUID();
      if (retainedLock && retainedLock.transferId !== transferId) handoffFail('cache-lock-intent');
      const lock = sourceLock(io, claim.cachePath, {
        schema: 'aitm.story-writer-handoff-lock/v1',
        transferId,
        ...scope,
      });
      try {
        const nativeStore = await openStoryStore({
          projectRoot: claim.worktree,
          identity: ctx.identity,
        });
        ctx.check();
        const generation = await nativeStore.readGeneration();
        ctx.check();
        const inventory = scanTree(io, claim.cachePath, { ownedLock: lock.stat });
        if (!generation && inventory.files.length) handoffFail('missing-current-generation');
        validated = validateStoryHandoffManifest({
          schema: 'aitm.story-writer-handoff/v1',
          transferId,
          identity: ctx.identity,
          registryId: ctx.registryId,
          sourceClaim: claim,
          target: destination,
          ...inventory,
        });
        if (frozen && frozen.bundleDigest !== validated.bundleDigest)
          handoffFail('frozen-byte-drift');
        const prefix = PROTOCOL + '/transfers/' + transferId;
        frozen = {
          schema: 'aitm.story-writer-handoff-intent/v1',
          transferId,
          bundleDigest: validated.bundleDigest,
          ...scope,
        };
        publishMetadata(io, claim.cachePath, PROTOCOL + '/frozen.json', frozen);
        publishMetadata(io, claim.cachePath, prefix + '/manifest.json', validated.manifest);
        const exported = prefix + '/files';
        walk(io, claim.cachePath, exported, { create: true, leaf: true });
        for (const dir of validated.manifest.directories)
          walk(io, claim.cachePath, exported + '/' + dir, { create: true, leaf: true });
        for (const f of validated.manifest.files)
          publishFile(io, claim.cachePath, exported + '/' + f.path, {
            source: { root: claim.cachePath, relative: f.path },
            expected: { size: f.size, digest: f.digest },
          });
        readExport(io, claim.cachePath, transferId, validated.bundleDigest);
        ctx.check();
      } finally {
        lock.release();
      }
      const manifest = validated.manifest;
      const request = expectedRequest(manifest, validated.bundleDigest);
      let proof = existingAck(io, manifest, validated.bundleDigest);
      if (!proof) {
        await target.acknowledge(request);
        ctx.check();
        proof = existingAck(io, manifest, validated.bundleDigest);
      }
      if (!proof) handoffFail('missing-acknowledgment');
      if (!same(tuple(target), destination)) handoffFail('target-changed');
      await assigned(target, ctx.check);
      exactTree(io, claim.cachePath, manifest);
      ctx.check();
      proof = existingAck(io, manifest, validated.bundleDigest);
      if (!proof) handoffFail('missing-acknowledgment');
      const transferred = ctx.commit(proof);
      publishMetadata(
        io,
        claim.cachePath,
        PROTOCOL + '/transfers/' + manifest.transferId + '/completed.json',
        {
          schema: 'aitm.story-writer-handoff-completed/v1',
          transferId: manifest.transferId,
          bundleDigest: validated.bundleDigest,
          claim: transferred,
        }
      );
      if (claim.cachePath === destination.cachePath) {
        if (!same(readMetadata(io, claim.cachePath, PROTOCOL + '/frozen.json'), frozen))
          handoffFail('frozen-intent-changed');
        io.unlinkSync(path.join(claim.cachePath, PROTOCOL, 'frozen.json'));
        syncDirectory(io, path.join(claim.cachePath, PROTOCOL));
      }
      return { status: 'transferred', ...request, claim: transferred };
    });
  } catch (cause) {
    if (cause.code?.startsWith('STORY_') || cause.code === 'EISSUELOCKED') throw cause;
    handoffFail('transfer', cause);
  }
}
/** Called by the named recipient; a source process cannot impersonate it through an argument. */
export async function acknowledgeStoryWriterTransfer({
  identity,
  transferId,
  bundleDigest,
  exportPath,
  store,
  registry,
} = {}) {
  try {
    if (!id(transferId) || !/^[a-f0-9]{64}$/.test(bundleDigest ?? '')) handoffFail('request');
    const worktree = resolveRuntimeRoot({ cwd: process.cwd(), env: {} }).projectRoot;
    const observed = observeStoryWriterHandoff({ identity, registry, worktree });
    const io = observed.io;
    const source = observed.claim.cachePath;
    if (exportPath !== path.join(source, PROTOCOL, 'transfers', transferId))
      handoffFail('export-path');
    const { manifest } = readExport(io, source, transferId, bundleDigest);
    actor(manifest.target);
    if (
      store?.cachePath !== manifest.target.cachePath ||
      observed.registryId !== manifest.registryId
    )
      handoffFail('recipient-store');
    const next = { ...manifest.sourceClaim, ...manifest.target };
    if (!same(observed.claim, manifest.sourceClaim) && !same(observed.claim, next))
      handoffFail('recipient-source');
    try {
      directory(io, store.cachePath);
    } catch (cause) {
      if (cause.code !== 'ENOENT') throw cause;
      await openStoryStore({ projectRoot: worktree, identity });
      actor(manifest.target);
    }
    protocol(io, store.cachePath);
    const already = existingAck(io, manifest, bundleDigest, {
      checkWorking: !same(observed.claim, next),
    });
    if (already) return already;
    if (!same(observed.claim, manifest.sourceClaim)) handoffFail('unacknowledged-owner');
    const prefix = PROTOCOL + '/received/' + transferId;
    const intent = recoverMetadata(
      io,
      store.cachePath,
      prefix + '/manifest.json',
      (candidate) => {
        if (!same(candidate, manifest)) handoffFail('recipient-intent');
      },
      { max: HANDOFF_MANIFEST_MAX_BYTES }
    );
    if (intent)
      for (const f of manifest.files) {
        try {
          io.lstatSync(path.join(store.cachePath, f.path));
        } catch (cause) {
          if (cause.code === 'ENOENT') continue;
          throw cause;
        }
        publishFile(io, store.cachePath, f.path, {
          source: {
            root: source,
            relative: PROTOCOL + '/transfers/' + transferId + '/files/' + f.path,
          },
          expected: { size: f.size, digest: f.digest },
        });
      }
    const current = scanTree(io, store.cachePath);
    const sameCache = store.cachePath === source;
    if (
      !intent &&
      !sameCache &&
      (current.files.length ||
        current.directories.some((d) => !['generations', 'manifests', 'payloads'].includes(d)))
    )
      handoffFail('recipient-has-unsettled-work');
    if (intent && !same(intent, manifest)) handoffFail('recipient-intent');
    for (const f of current.files) {
      const expected = manifest.files.find((x) => x.path === f.path);
      if (!expected || !same(expected, f)) handoffFail('recipient-conflict');
    }
    if (current.directories.some((d) => !manifest.directories.includes(d)))
      handoffFail('recipient-conflict');
    publishMetadata(io, store.cachePath, prefix + '/manifest.json', manifest);
    const archive = prefix + '/files';
    walk(io, store.cachePath, archive, { create: true, leaf: true });
    for (const dir of manifest.directories) {
      walk(io, store.cachePath, dir, { create: true, leaf: true });
      walk(io, store.cachePath, archive + '/' + dir, { create: true, leaf: true });
    }
    const copyOrder = [
      ...manifest.files.filter((f) => f.path !== 'manifest.json'),
      ...manifest.files.filter((f) => f.path === 'manifest.json'),
    ];
    for (const f of copyOrder) {
      const options = {
        source: {
          root: source,
          relative: PROTOCOL + '/transfers/' + transferId + '/files/' + f.path,
        },
        expected: { size: f.size, digest: f.digest },
      };
      publishFile(io, store.cachePath, f.path, options);
      publishFile(io, store.cachePath, archive + '/' + f.path, options);
    }
    exactTree(io, store.cachePath, manifest);
    const nativeStore = await openStoryStore({ projectRoot: worktree, identity });
    actor(manifest.target);
    await nativeStore.readGeneration();
    actor(manifest.target);
    const latest = observeStoryWriterHandoff({ identity, registry, worktree });
    if (!same(latest.claim, manifest.sourceClaim) || latest.registryId !== manifest.registryId)
      handoffFail('recipient-owner-drift');
    const record = {
      schema: 'aitm.story-writer-handoff-ack/v1',
      transferId,
      bundleDigest,
      recipient: manifest.target,
      sourceClaimDigest: handoffHash(canonicalRecordJson(manifest.sourceClaim)),
    };
    publishMetadata(io, store.cachePath, PROTOCOL + '/received/' + transferId + '.json', record);
    return acknowledgment(io, manifest, bundleDigest);
  } catch (cause) {
    if (cause.code?.startsWith('STORY_') || cause.code === 'EISSUELOCKED') throw cause;
    handoffFail('acknowledgment', cause);
  }
}
