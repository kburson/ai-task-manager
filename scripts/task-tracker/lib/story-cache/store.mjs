// @story #2054
// This store validates local persistence, never claim ownership or cloud freshness.
import nodeFs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { resolveRuntimeRoot } from '../runtime-storage.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { storyIdentityKey, validateManifest } from './manifest.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const nativeStores = new WeakSet();
// @story #2069 — authority readers require the actual opened store, not its shape.
export const isNativeStoryStore = (store) => nativeStores.has(store);
function fail(reason, cause) {
  throw Object.assign(new Error(`Story store unavailable: ${reason}`, { cause }), {
    code: 'STORY_STORE_UNAVAILABLE',
    reason,
  });
}
function relative(value) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value) ||
    value.split('/').some((p) => p === '.' || p === '..')
  )
    fail('unsafe-path');
  return value;
}
function canonicalIdentity(identity) {
  storyIdentityKey(identity);
  return {
    ...identity,
    host: identity.host.toLowerCase(),
    repository: identity.repository.toLowerCase(),
  };
}
export function storyCachePath({ projectRoot, identity } = {}) {
  if (
    typeof projectRoot !== 'string' ||
    !path.isAbsolute(projectRoot) ||
    path.resolve(projectRoot) !== projectRoot
  )
    fail('project-root');
  const subject = canonicalIdentity(identity);
  return path.join(
    projectRoot,
    '.tmp',
    'gh',
    subject.host,
    hash(subject.repository),
    String(subject.issueNumber)
  );
}
/** fs is the node:fs/promises interface. next = {generation, claimId, payloads: Map}. */
export async function openStoryStore({ projectRoot, identity, fs: io = nodeFs } = {}) {
  try {
    const subject = canonicalIdentity(identity);
    const cachePath = storyCachePath({ projectRoot, identity: subject });
    if (
      (await io.realpath(projectRoot)) !== projectRoot ||
      resolveRuntimeRoot({ cwd: projectRoot, env: {} }).projectRoot !== projectRoot
    )
      fail('project-root');
    const owner = process.getuid?.();
    const directory = async (target, create, privateMode) => {
      let created = false;
      if (create)
        try {
          await io.mkdir(target, { mode: 0o700 });
          created = true;
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
        }
      const stat = await io.lstat(target);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (owner !== undefined && stat.uid !== owner) ||
        (stat.mode & 0o022) !== 0 ||
        (privateMode && (stat.mode & 0o777) !== 0o700) ||
        (await io.realpath(target)) !== target
      )
        fail('unsafe-directory');
      if (created) {
        const parent = await io.open(
          path.dirname(target),
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
        );
        try {
          await parent.sync();
        } finally {
          await parent.close();
        }
      }
    };
    // Existing project/.tmp may be 0755; story bytes start inside private .tmp/gh.
    const walk = async (target, { create = false, leafDirectory = false } = {}) => {
      if (target !== projectRoot && !target.startsWith(projectRoot + path.sep)) fail('containment');
      await directory(projectRoot, false, false);
      const pieces = path.relative(projectRoot, target).split(path.sep).filter(Boolean);
      if (!leafDirectory) pieces.pop();
      let cursor = projectRoot;
      for (let i = 0; i < pieces.length; i++) {
        cursor = path.join(cursor, pieces[i]);
        await directory(cursor, create, i > 0);
      }
    };
    const regular = (stat) => {
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        (owner !== undefined && stat.uid !== owner) ||
        (stat.mode & 0o777) !== 0o600
      )
        fail('unsafe-file');
    };
    const read = async (relativePath, { sync = false } = {}) => {
      const target = path.join(cachePath, relative(relativePath));
      await walk(target);
      regular(await io.lstat(target));
      const handle = await io.open(
        target,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      );
      try {
        regular(await handle.stat());
        const bytes = await handle.readFile();
        if (sync) await handle.sync();
        return bytes;
      } finally {
        await handle.close();
      }
    };
    const syncDirectory = async (target) => {
      await walk(target, { leafDirectory: true });
      const handle = await io.open(
        target,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
      );
      try {
        if (!(await handle.stat()).isDirectory()) fail('unsafe-directory');
        await handle.sync();
      } finally {
        await handle.close();
      }
    };
    const write = async (relativePath, bytes) => {
      const target = path.join(cachePath, relative(relativePath));
      await walk(target, { create: true });
      const reuse = async () => {
        try {
          if (!(await read(relativePath, { sync: true })).equals(Buffer.from(bytes)))
            fail('immutable-collision');
          await syncDirectory(path.dirname(target));
          return true;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          return false;
        }
      };
      if (await reuse()) return;
      // The exclusive store lock serializes all supported publishers. A partial
      // write stays at a unique unreferenced name, never poisoning a hash path.
      const temporary = path.join(path.dirname(target), `stage-${randomUUID()}.tmp`);
      const handle = await io.open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600
      );
      try {
        regular(await handle.stat());
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      // Refuse unexpected final bytes even if an external process installed
      // them while staging. Arbitrary same-user rename races remain out of scope.
      if (await reuse()) await io.unlink(temporary);
      else await io.rename(temporary, target);
      await syncDirectory(path.dirname(target));
    };
    const payloadReferences = (value) => {
      const refs = [];
      const visit = (v) => {
        if (!v || typeof v !== 'object') return;
        if (Object.hasOwn(v, 'payloadPath')) refs.push(v);
        for (const child of Object.values(v)) visit(child);
      };
      visit(value);
      return refs;
    };
    const readGeneration = async () => {
      try {
        const raw = await read('manifest.json');
        const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
        if (!same(manifest.identity, subject)) fail('identity');
        const generationRaw = await read(manifest.payloadPath);
        if (hash(generationRaw) !== manifest.payloadDigest) fail('generation-checksum');
        const generation = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(generationRaw)
        );
        const payloads = new Map([[manifest.payloadPath, generationRaw]]);
        for (const ref of payloadReferences(generation))
          if (!payloads.has(ref.payloadPath))
            payloads.set(ref.payloadPath, await read(ref.payloadPath));
        const verified = validateManifest(manifest, { identity: subject, payloads });
        return {
          ...verified,
          payloads: new Map([...payloads].map(([key, bytes]) => [key, Buffer.from(bytes)])),
        };
      } catch (error) {
        if (error.code === 'ENOENT') {
          // A missing referenced payload or deleted pointer must not become empty hydration.
          try {
            await io.lstat(path.join(cachePath, 'manifest.json'));
          } catch (pointerError) {
            if (pointerError.code !== 'ENOENT') fail('pointer', pointerError);
            try {
              await walk(path.join(cachePath, 'manifests'), { leafDirectory: true });
              const retained = await io.readdir(path.join(cachePath, 'manifests'));
              if (retained.length === 0) return null;
            } catch (inventoryError) {
              fail('recovery-inventory', inventoryError);
            }
          }
        }
        fail('read', error);
      }
    };
    await walk(cachePath, { create: true, leafDirectory: true });
    for (const dir of ['payloads', 'generations', 'manifests'])
      await walk(path.join(cachePath, dir), { create: true, leafDirectory: true });
    await readGeneration();
    const commitGeneration = async (next, { expectedGeneration, nativeApprovalIssuance } = {}) => {
      let lock;
      try {
        const descriptors = Object.getOwnPropertyDescriptors(next);
        if (
          Reflect.ownKeys(descriptors).sort().join(',') !== 'claimId,generation,payloads' ||
          Object.values(descriptors).some(
            (descriptor) => !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
          ) ||
          !(descriptors.payloads.value instanceof Map)
        )
          fail('commit-input');
        // Snapshot once before awaits or native issuance checks. Never inspect a caller
        // accessor or an overridden Map iterator again during persistence.
        next = {
          generation: JSON.parse(canonicalRecordJson(descriptors.generation.value)),
          claimId: descriptors.claimId.value,
          payloads: new Map(
            [...Map.prototype.entries.call(descriptors.payloads.value)].map(([key, bytes]) => {
              if (typeof key !== 'string' || !(typeof bytes === 'string' || Buffer.isBuffer(bytes)))
                fail('commit-payload');
              return [key, Buffer.from(bytes)];
            })
          ),
        };
        await walk(path.join(cachePath, 'write.lock'));
        lock = await io.open(
          path.join(cachePath, 'write.lock'),
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600
        );
        const current = await readGeneration();
        if (expectedGeneration !== (current?.manifest.generation ?? null)) fail('generation-race');
        const { authorizeNativePlanApprovalCommit } = await import('../plan-approval-staging.mjs');
        authorizeNativePlanApprovalCommit({
          current,
          next,
          cachePath,
          issuance: nativeApprovalIssuance,
        });
        const candidate = JSON.parse(canonicalRecordJson(next.generation));
        const n = (current?.manifest.generation ?? 0) + 1;
        if (candidate.generation !== n || !(next.payloads instanceof Map)) fail('generation');
        // First validate original paths, bytes and identity before rewriting any reference.
        const originalRaw = canonicalRecordJson(candidate);
        const makeManifest = (payloadPath, payloadDigest) => ({
          schema: 'aitm.story-cache-manifest/v1',
          identity: subject,
          identityKey: storyIdentityKey(subject),
          generation: n,
          payloadPath,
          payloadDigest,
          previousGeneration: current?.manifest.generation ?? null,
          claimId: next.claimId,
        });
        validateManifest(makeManifest(`generations/${n}.json`, hash(originalRaw)), {
          identity: subject,
          payloads: new Map([...next.payloads, [`generations/${n}.json`, originalRaw]]),
        });
        const payloads = new Map();
        for (const ref of payloadReferences(candidate)) {
          const bytes = Buffer.from(next.payloads.get(ref.payloadPath));
          const immutable = `payloads/${hash(bytes)}.txt`;
          ref.payloadPath = immutable;
          payloads.set(immutable, bytes);
        }
        const raw = canonicalRecordJson(candidate);
        const generationPath = `generations/${n}-${hash(raw)}.json`;
        const manifest = makeManifest(generationPath, hash(raw));
        payloads.set(generationPath, Buffer.from(raw));
        validateManifest(manifest, { identity: subject, payloads });
        // An interrupted mkdir may exist without a durable parent entry. Flush
        // the full namespace before acknowledging a pointer into this hierarchy.
        for (let directory = cachePath; ; directory = path.dirname(directory)) {
          await syncDirectory(directory);
          if (directory === projectRoot) break;
        }
        for (const [file, bytes] of payloads) await write(file, bytes);
        const manifestRaw = canonicalRecordJson(manifest);
        await write(`manifests/${n}-${hash(manifestRaw)}.json`, manifestRaw);
        const temporary = `manifest-${randomUUID()}.tmp`;
        await write(temporary, manifestRaw);
        await walk(path.join(cachePath, 'manifest.json'));
        await io.rename(path.join(cachePath, temporary), path.join(cachePath, 'manifest.json'));
        await syncDirectory(cachePath);
        const result = await readGeneration();
        if (!same(result.manifest, manifest)) fail('read-back');
        await lock.close();
        lock = null;
        await io.unlink(path.join(cachePath, 'write.lock'));
        await syncDirectory(cachePath);
        return result;
      } catch (error) {
        fail('commit', error);
      } finally {
        if (lock) {
          await lock.close().catch(() => {});
          await io.unlink(path.join(cachePath, 'write.lock')).catch(() => {});
        }
      }
    };
    const store = Object.freeze({ cachePath, readGeneration, commitGeneration });
    if (io === nodeFs) nativeStores.add(store);
    return store;
  } catch (error) {
    if (error.code?.startsWith('STORY_STORE_')) throw error;
    fail('open', error);
  }
}
