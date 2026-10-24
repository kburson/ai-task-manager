// @story #2039 #2057
// Closed local handoff transport; byte integrity is not publication authority.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { storyIdentityKey } from './manifest.mjs';
import { storyCachePath } from './store.mjs';
import { validateStoryWriterClaim } from './writer-claim-shape.mjs';
export const HANDOFF_MANIFEST_MAX_BYTES = 4 * 1024 * 1024;
export const handoffHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function handoffFail(reason, cause) {
  throw Object.assign(new Error('Story handoff unavailable: ' + reason, { cause }), {
    code: 'STORY_HANDOFF_UNAVAILABLE',
    reason,
  });
}
const token = (v) => typeof v === 'string' && v.length > 0 && !/[\s\p{Cc}]/u.test(v);
const absolute = (v) => typeof v === 'string' && path.isAbsolute(v) && path.resolve(v) === v;
const digest = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function exact(v, keys) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).sort().join(',') !== [...keys].sort().join(',')
  )
    handoffFail('shape');
}
function relative(v) {
  if (
    typeof v !== 'string' ||
    !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(v) ||
    v.split('/').some((p) => p === '.' || p === '..') ||
    v.split('/')[0] === '.writer-handoff' ||
    v === 'write.lock'
  )
    handoffFail('path');
  return v;
}
function inventory(values) {
  if (!Array.isArray(values)) handoffFail('inventory');
  for (let i = 0; i < values.length; i++) {
    relative(values[i]);
    if (i && values[i - 1] >= values[i]) handoffFail('inventory');
  }
}
function freeze(v) {
  if (v && typeof v === 'object') {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v;
}
export function validateStoryHandoffManifest(input) {
  try {
    const text = canonicalRecordJson(input);
    if (Buffer.byteLength(text) > HANDOFF_MANIFEST_MAX_BYTES) handoffFail('manifest-size');
    const m = JSON.parse(text);
    exact(m, [
      'schema',
      'transferId',
      'identity',
      'registryId',
      'sourceClaim',
      'target',
      'directories',
      'files',
    ]);
    if (
      m.schema !== 'aitm.story-writer-handoff/v1' ||
      !(typeof m.transferId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(m.transferId)) ||
      !token(m.registryId)
    )
      handoffFail('manifest');
    const key = storyIdentityKey(m.identity);
    if (
      m.identity.host !== m.identity.host.toLowerCase() ||
      m.identity.repository !== m.identity.repository.toLowerCase()
    )
      handoffFail('identity');
    const c = m.sourceClaim;
    validateStoryWriterClaim(c, { sessionId: c?.sessionId, worktree: c?.worktree });
    if (
      c.identityKey !== key ||
      c.registryKey !==
        handoffHash(
          canonicalRecordJson([m.identity.host, m.identity.repository, m.identity.issueNumber])
        ) ||
      c.cachePath !== storyCachePath({ projectRoot: c.worktree, identity: m.identity })
    )
      handoffFail('source');
    const t = m.target;
    exact(t, ['human', 'sessionId', 'worktree', 'cachePath']);
    if (
      !token(t.human) ||
      !/^[a-z0-9](?:[a-z0-9-]{0,38})$/.test(t.human) ||
      !token(t.sessionId) ||
      !absolute(t.worktree) ||
      t.cachePath !== storyCachePath({ projectRoot: t.worktree, identity: m.identity })
    )
      handoffFail('target');
    if (t.human === c.human && t.sessionId === c.sessionId && t.worktree === c.worktree)
      handoffFail('same-owner');
    inventory(m.directories);
    for (const name of ['generations', 'manifests', 'payloads'])
      if (!m.directories.includes(name)) handoffFail('directories');
    const directorySet = new Set(m.directories);
    for (const name of m.directories) {
      const parent = path.posix.dirname(name);
      if (parent !== '.' && !directorySet.has(parent)) handoffFail('directory-parent');
    }
    if (!Array.isArray(m.files)) handoffFail('files');
    inventory(m.files.map((f) => f?.path));
    for (const f of m.files) {
      exact(f, ['path', 'digest', 'size']);
      if (
        !digest(f.digest) ||
        !Number.isSafeInteger(f.size) ||
        f.size < 0 ||
        directorySet.has(f.path)
      )
        handoffFail('file');
      const parent = path.posix.dirname(f.path);
      if (parent !== '.' && !directorySet.has(parent)) handoffFail('file-parent');
    }
    return { manifest: freeze(m), bundleDigest: handoffHash(text) };
  } catch (cause) {
    if (cause.code === 'STORY_HANDOFF_UNAVAILABLE') throw cause;
    handoffFail('manifest', cause);
  }
}
export function validateStoryHandoffBundle(bundle) {
  try {
    exact(bundle, ['manifest', 'payloads']);
    if (!(bundle.payloads instanceof Map)) handoffFail('payload-map');
    const validated = validateStoryHandoffManifest(bundle.manifest);
    if (bundle.payloads.size !== validated.manifest.files.length) handoffFail('payload-inventory');
    const payloads = new Map();
    for (const f of validated.manifest.files) {
      const value = bundle.payloads.get(f.path);
      if (
        !(value instanceof Uint8Array) ||
        value.byteLength !== f.size ||
        handoffHash(value) !== f.digest
      )
        handoffFail('payload');
      payloads.set(f.path, Buffer.from(value));
    }
    return { ...validated, payloads };
  } catch (cause) {
    if (cause.code === 'STORY_HANDOFF_UNAVAILABLE') throw cause;
    handoffFail('bundle', cause);
  }
}
