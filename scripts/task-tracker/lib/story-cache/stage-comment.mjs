// @story #2039 #2058
// cspell:ignore EISSUELOCKED
// Local adapter only. Creation keys are durable intents, never provider node IDs.
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { parseAitmRecord } from '../github-records/record-envelope.mjs';
import { upsertOwnedComment } from '../owned-comment.mjs';
import { resolveRuntimeRoot } from '../runtime-storage.mjs';
import { resolveSessionId } from '../session-id.mjs';
import { assertStoryWriter } from './writer-claim.mjs';
import { storyCachePath } from './store.mjs';
import { storyIdentityKey, validateManifest } from './manifest.mjs';
import { withIssueLock, currentIssueLockOwner } from '../../issue-mutator-lock.mjs';
import { validateReviewedDelta } from '../reviewed-scope/record.mjs';
import {
  findLostMarkers,
  findUnexpectedSectionLoss,
  findCheckboxesTickedWithoutProof,
  findNewMalformedVerifiedCmds,
  findNewlyIntroducedExecutionProof,
  validateMarkerAdvances,
} from '../body-invariants.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => JSON.parse(canonicalRecordJson(value));
const text = (value) => typeof value === 'string' && value.isWellFormed();
function fail(reason, code = 'STORY_MUTATION_INVALID', cause) {
  throw Object.assign(new Error(`Story comment refused: ${reason}`, { cause }), { code, reason });
}
const unavailable = (reason, cause) => fail(reason, 'STORY_MUTATION_UNAVAILABLE', cause);
function argumentsOf(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('arguments');
  const key = input.key;
  const body = input.body;
  if (!text(key) || !/^comment:(?:new:)?[^\s\p{Cc}]+$/u.test(key) || key === 'comment:new:')
    fail('resource-key');
  if (!text(body) || !body.trim()) fail('body');
  if (
    Object.keys(input).some((key) => !['store', 'claim', 'key', 'body', 'capability'].includes(key))
  )
    fail('arguments');
  // #2059 owns operation-specific proof grants. Serialized flags grant no authority.
  const capability = input.capability;
  if (capability !== undefined && capability !== null) fail('capability');
  return Object.freeze({ key, body, store: input.store, claim: input.claim });
}
function payload(current, ref) {
  const bytes = current.payloads.get(ref.payloadPath);
  if (!(typeof bytes === 'string' || Buffer.isBuffer(bytes))) unavailable('payload');
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.from(bytes));
  } catch (error) {
    unavailable('payload', error);
  }
}
// Use the native codecs as validators; discovery alone never authorizes adoption.
async function ownership(body, nodeId, identity) {
  try {
    const { envelope } = parseAitmRecord({
      commentNodeId: nodeId,
      body,
      expectedRepository: identity.repository,
      expectedIssue: identity.issueNumber,
    });
    if (body.includes('aitm-owned-comment')) fail('ambiguous-ownership');
    return { key: `record:${envelope.recordId}`, binding: canonicalRecordJson(envelope) };
  } catch (error) {
    if (error.code === 'STORY_MUTATION_INVALID') throw error;
    if (error.message !== 'record-envelope:missing') fail('record-envelope', undefined, error);
  }
  const marker = /<!-- aitm-owned-comment key="([^"]+)" -->/.exec(body);
  if (!marker) return null;
  const deny = () => fail('native-ownership-validation');
  try {
    // Native upsert verifies rendering/key/correlation/uniqueness without an effect.
    // Every transport port and its before-write fence refuses; only no-op is accepted.
    const result = await upsertOwnedComment({
      repository: identity.repository,
      issue: identity.issueNumber,
      key: marker[1],
      body: body.slice(0, marker.index),
      deps: {
        listComments: async () => ({
          issueId: identity.issueNodeId,
          comments: [
            { id: nodeId, body, repository: identity.repository, issue: identity.issueNumber },
          ],
        }),
        graphql: deny,
        beforeWrite: deny,
        createComment: deny,
        updateComment: deny,
        readComment: deny,
      },
    });
    if (result.status !== 'no-op' || result.id !== nodeId || result.body !== body)
      fail('native-ownership-validation');
  } catch (error) {
    fail('native-ownership-validation', undefined, error);
  }
  return { key: `marker:${marker[1]}`, binding: marker[0] };
}
function validateDelta(base, next, identity) {
  try {
    validateReviewedDelta(base, next);
    validateMarkerAdvances(base, next, {
      issueNumber: identity.issueNumber,
      repo: identity.repository,
    });
  } catch (error) {
    fail('protected-authority', undefined, error);
  }
  if (findLostMarkers(base, next).length) fail('marker-loss');
  if (findUnexpectedSectionLoss(base, next)) fail('section-loss');
  if (findNewlyIntroducedExecutionProof(base, next).length) fail('execution-proof');
  if (findCheckboxesTickedWithoutProof(base, next).length) fail('unverified-ticks');
  if (findNewMalformedVerifiedCmds(base, next).length) fail('verifier-declaration');
}
async function candidate(current, key, body, identity) {
  const baseline = current.generation.baseSnapshot.resources;
  const working = current.generation.working;
  const isNew = key.startsWith('comment:new:');
  if (!isNew && !baseline[key]) fail('comment-missing');
  const original = baseline[key] ? payload(current, baseline[key]) : null;
  const previous = working[key] ? payload(current, working[key]) : original;
  const source = original ?? previous;
  const priorOwner = source === null ? null : await ownership(source, key.slice(8), identity);
  if (source !== null && !priorOwner) fail('foreign-comment');
  const nextOwner = await ownership(body, key.slice(8), identity);
  if (!nextOwner) fail('foreign-comment');
  if (priorOwner && canonicalRecordJson(priorOwner) !== canonicalRecordJson(nextOwner))
    fail('ownership-identity');
  if (previous !== null) {
    const previousOwner = await ownership(previous, key.slice(8), identity);
    if (!previousOwner || canonicalRecordJson(previousOwner) !== canonicalRecordJson(nextOwner))
      fail('ownership-identity');
  }
  // The complete baseline plus pending creations is one local ownership census.
  // Compare logical identity independently from payload equality: conflicting record
  // bytes and missed create replies must never silently create another comment.
  for (const other of new Set([...Object.keys(baseline), ...Object.keys(working)])) {
    if (other === key || !other.startsWith('comment:')) continue;
    const ref = working[other] ?? baseline[other];
    const owner = await ownership(payload(current, ref), other.slice(8), identity);
    if (owner?.key === nextOwner.key) fail('duplicate-ownership');
    if (working[other] && baseline[other]) {
      const baseOwner = await ownership(
        payload(current, baseline[other]),
        other.slice(8),
        identity
      );
      if (baseOwner?.key === nextOwner.key) fail('duplicate-ownership');
    }
  }
  const retainedCapability = working[key]?.capabilityRef;
  if (retainedCapability !== undefined && retainedCapability !== null)
    unavailable('retained-capability');
  validateDelta(previous ?? '', body, identity);
  validateDelta(original ?? '', body, identity);
  return previous;
}
async function stage(input) {
  const { store, claim, key, body } = input;
  const root = resolveRuntimeRoot({ cwd: process.cwd(), env: {} });
  const worktree = root.projectRoot;
  const sessionId = resolveSessionId();
  if (!claim?.registryKey) unavailable('persistent-claim');
  const assertOwner = () => {
    if (
      resolveSessionId() !== sessionId ||
      resolveRuntimeRoot({ cwd: process.cwd(), env: {} }).projectRoot !== worktree
    )
      unavailable('local-context');
    assertStoryWriter(claim, { worktree, sessionId });
    if (
      !store ||
      typeof store.readGeneration !== 'function' ||
      typeof store.commitGeneration !== 'function' ||
      store.cachePath !== claim.cachePath
    )
      unavailable('store-identity');
  };
  assertOwner();
  const cache = await store.readGeneration();
  assertOwner();
  if (!cache) unavailable('generation-missing');
  const identity = cache.manifest?.identity;
  if (
    storyIdentityKey(identity) !== claim.identityKey ||
    storyCachePath({ projectRoot: worktree, identity }) !== store.cachePath
  )
    unavailable('store-identity');
  return withIssueLock(
    { issue: identity.issueNumber, projDir: worktree, sessionId, retries: 0 },
    async () => {
      const lockOwner = currentIssueLockOwner(identity.issueNumber);
      const revalidate = () => {
        assertOwner();
        if (
          !lockOwner ||
          currentIssueLockOwner(identity.issueNumber) !== lockOwner ||
          lockOwner.projDir !== root.mainRoot ||
          lockOwner.sessionId !== sessionId
        )
          unavailable('native-lock-owner');
      };
      revalidate();
      const raw = await store.readGeneration();
      revalidate();
      if (
        !raw ||
        raw.manifest.claimId !== claim.claimId ||
        storyIdentityKey(raw.manifest.identity) !== claim.identityKey
      )
        unavailable('generation-identity');
      const current = {
        ...raw,
        ...validateManifest(raw.manifest, { identity, payloads: raw.payloads }),
      };
      const generation = clone(current.generation);
      if (generation.batch !== null || generation.conflicts.length)
        unavailable('publication-pending');
      const previous = await candidate(current, key, body, identity);
      revalidate();
      const result = (status, number, dirtyKeys) =>
        Object.freeze({
          status,
          body,
          generation: number,
          dirtyKeys: Object.freeze([...dirtyKeys]),
          publication: 'unpublished',
        });
      if (body === previous) return result('no-op', generation.generation, generation.dirtyKeys);
      // Stable comment:new:<intentId> survives reopening and every edit. Never replace
      // it with a node ID before the later publisher has verified an actual create.
      const payloadPath = `working/comment-${hash(body)}.md`;
      const payloads = new Map(current.payloads);
      payloads.set(payloadPath, Buffer.from(body));
      generation.generation++;
      generation.working[key] = {
        payloadPath,
        digest: hash(body),
        kind: 'comment',
        capabilityRef: null,
      };
      generation.dirtyKeys = [...new Set([...generation.dirtyKeys, key])].sort();
      revalidate();
      const committed = await store.commitGeneration(
        { generation, claimId: claim.claimId, payloads },
        { expectedGeneration: current.manifest.generation }
      );
      revalidate();
      if (
        !committed ||
        committed.manifest.claimId !== claim.claimId ||
        committed.manifest.generation !== generation.generation
      )
        unavailable('commit-readback');
      const verified = {
        ...committed,
        ...validateManifest(committed.manifest, { identity, payloads: committed.payloads }),
      };
      const expected = clone(generation);
      expected.working[key].payloadPath = verified.generation.working[key]?.payloadPath;
      if (
        canonicalRecordJson(expected) !== canonicalRecordJson(verified.generation) ||
        !verified.generation.working[key] ||
        payload(verified, verified.generation.working[key]) !== body
      )
        unavailable('commit-readback');
      return result('staged', generation.generation, generation.dirtyKeys);
    }
  );
}
export async function stageOwnedComment(input = {}) {
  try {
    return await stage(argumentsOf(input));
  } catch (error) {
    let code;
    try {
      code = error?.code;
    } catch {
      /* Arbitrary thrown accessors are untrusted. */
    }
    if (typeof code === 'string' && (code.startsWith('STORY_') || code === 'EISSUELOCKED'))
      throw error;
    unavailable('operation', error);
  }
}
