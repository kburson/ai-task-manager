// @story #2039 #2043
// cspell:ignore EISSUELOCKED
// Local-only adapter. Public writers and operation-specific proof grants are not activated here.
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
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

const ISSUE_UPDATE = 'aitm.story-issue-update/v1';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => JSON.parse(canonicalRecordJson(value));
const text = (value) => typeof value === 'string' && value.isWellFormed();
const titleText = (value) =>
  text(value) && value.trim().length > 0 && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value);
function fail(reason, code = 'STORY_MUTATION_INVALID', cause) {
  throw Object.assign(new Error(`Story mutation refused: ${reason}`, { cause }), { code, reason });
}
function unavailable(reason, cause) {
  fail(reason, 'STORY_MUTATION_UNAVAILABLE', cause);
}
function normalize(error) {
  let code;
  try {
    code = error?.code;
  } catch {
    /* Arbitrary thrown values may have throwing accessors. */
  }
  if (typeof code === 'string' && (code.startsWith('STORY_') || code === 'EISSUELOCKED'))
    throw error;
  unavailable('operation', error);
}
function argumentsOf(input, kind) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('arguments');
  // Read and validate primitives once, before dependency access or the first await.
  const operation =
    kind === 'body' ? { mutate: input.mutate, key: input.key } : { title: input.title };
  if (kind === 'body') {
    if (typeof operation.mutate !== 'function' || !text(operation.key)) fail('arguments');
    if (!operation.key.startsWith('issue:')) fail('resource-key');
  } else if (!titleText(operation.title)) fail('arguments');
  const keys =
    kind === 'body'
      ? ['store', 'claim', 'key', 'mutate', 'capability']
      : ['store', 'claim', 'title', 'capability'];
  if (Object.keys(input).some((key) => !keys.includes(key))) fail('arguments');
  // Task #2059 owns genuine retained proof capabilities. No flags acquire authority here.
  const capability = input.capability;
  if (capability !== undefined && capability !== null) fail('capability');
  return Object.freeze({ ...operation, store: input.store, claim: input.claim });
}
function validateBody(base, next, identity) {
  if (!text(next)) fail('result');
  const versions = (value) =>
    [...value.matchAll(/<!--\s*aitm-body-version(?:\s*:|\s+version=)[\s\S]*?-->/gi)].map(
      (match) => match[0]
    );
  if (canonicalRecordJson(versions(base)) !== canonicalRecordJson(versions(next)))
    fail('legacy-version');
  try {
    validateReviewedDelta(base, next);
  } catch (error) {
    fail('reviewed-scope', undefined, error);
  }
  const lost = findLostMarkers(base, next);
  if (lost.length) fail('marker-loss', undefined, lost);
  try {
    validateMarkerAdvances(base, next, {
      issueNumber: identity.issueNumber,
      repo: identity.repository,
    });
  } catch (error) {
    fail('marker-advance', undefined, error);
  }
  if (findUnexpectedSectionLoss(base, next)) fail('section-loss');
  if (findNewlyIntroducedExecutionProof(base, next).length) fail('execution-proof');
  if (findCheckboxesTickedWithoutProof(base, next).length) fail('unverified-ticks');
  if (findNewMalformedVerifiedCmds(base, next).length) fail('verifier-declaration');
}
function readPayload(current, reference) {
  const bytes = current.payloads.get(reference.payloadPath);
  if (!(typeof bytes === 'string' || Buffer.isBuffer(bytes))) unavailable('payload');
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.from(bytes));
  } catch (error) {
    unavailable('payload', error);
  }
}
function issueCandidate(current, key) {
  const baseline = current.generation.baseSnapshot;
  const entry = current.generation.working[key];
  if (!entry)
    return {
      schema: ISSUE_UPDATE,
      body: readPayload(current, baseline.resources[key]),
      title: baseline.title,
    };
  const raw = readPayload(current, entry);
  // Existing accepted generations may retain plain working body bytes. Preserve them.
  let candidate;
  try {
    candidate = JSON.parse(raw);
  } catch {
    /* Plain Markdown is the legacy working-body form. */
  }
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof candidate.schema === 'string' &&
    candidate.schema.startsWith('aitm.story-issue-update/')
  ) {
    if (
      candidate.schema !== ISSUE_UPDATE ||
      Object.keys(candidate).sort().join(',') !== 'body,schema,title' ||
      !text(candidate.body) ||
      !titleText(candidate.title) ||
      canonicalRecordJson(candidate) !== raw
    )
      unavailable('issue-payload');
    return candidate;
  }
  return { schema: ISSUE_UPDATE, body: raw, title: baseline.title };
}
async function stage(input, kind) {
  const { store, claim } = input;
  const root = resolveRuntimeRoot({ cwd: process.cwd(), env: {} });
  const worktree = root.projectRoot;
  const sessionId = resolveSessionId();
  if (!claim?.registryKey) unavailable('persistent-claim');
  const context = { worktree, sessionId };
  const assertOwner = () => {
    if (
      resolveSessionId() !== sessionId ||
      resolveRuntimeRoot({ cwd: process.cwd(), env: {} }).projectRoot !== worktree
    )
      unavailable('local-context');
    assertStoryWriter(claim, context);
    if (
      !store ||
      typeof store.readGeneration !== 'function' ||
      typeof store.commitGeneration !== 'function' ||
      store.cachePath !== claim.cachePath
    )
      unavailable('store-identity');
  };
  assertOwner();
  // Serialize cooperating staging and handoff through the same native issue lock.
  // The persistent registry stays authoritative; this short lock grants no lease.
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
      // Do not rely solely on the injectable store's validation or mutate its returned objects.
      const current = {
        ...raw,
        ...validateManifest(raw.manifest, { identity, payloads: raw.payloads }),
      };
      const generation = clone(current.generation);
      if (generation.batch !== null || generation.conflicts.length)
        unavailable('publication-pending');
      const key = `issue:${identity.issueNodeId}`;
      if (kind === 'body' && input.key !== key) fail('resource-key');
      const candidate = issueCandidate(current, key);
      const body = kind === 'body' ? await input.mutate(candidate.body) : candidate.body;
      const title = kind === 'title' ? input.title : candidate.title;
      revalidate();
      if (!titleText(title)) fail('title');
      validateBody(candidate.body, body, identity);
      // Revalidate the composite against the immutable baseline as well as the last edit.
      validateBody(readPayload(current, generation.baseSnapshot.resources[key]), body, identity);
      const result = (status, number, dirtyKeys) =>
        Object.freeze({
          status,
          body,
          title,
          generation: number,
          dirtyKeys: Object.freeze([...dirtyKeys]),
          publication: 'unpublished',
        });
      if (body === candidate.body && title === candidate.title)
        return result('no-op', generation.generation, generation.dirtyKeys);
      const retainedCapability = generation.working[key]?.capabilityRef;
      if (retainedCapability !== undefined && retainedCapability !== null)
        unavailable('retained-capability');
      const payload = canonicalRecordJson({ schema: ISSUE_UPDATE, body, title });
      const payloadPath = `working/issue-${hash(payload)}.json`;
      const payloads = new Map(current.payloads);
      payloads.set(payloadPath, Buffer.from(payload));
      generation.generation++;
      generation.working[key] = {
        payloadPath,
        digest: hash(payload),
        kind: 'issue',
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
      if (canonicalRecordJson(expected) !== canonicalRecordJson(verified.generation))
        unavailable('commit-readback');
      const persisted = issueCandidate(verified, key);
      if (
        persisted.body !== body ||
        persisted.title !== title ||
        canonicalRecordJson(committed.generation.dirtyKeys) !==
          canonicalRecordJson(generation.dirtyKeys)
      )
        unavailable('commit-readback');
      return result('staged', generation.generation, generation.dirtyKeys);
    }
  );
}
export async function stageStoryMutation(input = {}) {
  try {
    return await stage(argumentsOf(input, 'body'), 'body');
  } catch (error) {
    normalize(error);
  }
}
export async function stageStoryTitle(input = {}) {
  try {
    return await stage(argumentsOf(input, 'title'), 'title');
  } catch (error) {
    normalize(error);
  }
}
