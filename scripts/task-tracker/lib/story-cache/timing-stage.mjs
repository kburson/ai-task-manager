// @story #2039 #2060
// cspell:ignore EISSUELOCKED
// Native interval events are inputs. Ingestion samples no clock and publishes nothing.
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { resolveRuntimeRoot } from '../runtime-storage.mjs';
import { resolveSessionId } from '../session-id.mjs';
import { assertStoryWriter } from './writer-claim.mjs';
import { storyCachePath } from './store.mjs';
import { storyIdentityKey, validateManifest } from './manifest.mjs';
import { mergeTimingEvents } from './timing-events.mjs';
import { withIssueLock, currentIssueLockOwner } from '../../issue-mutator-lock.mjs';
export { mergeTimingEvents } from './timing-events.mjs';
const clone = (value) => JSON.parse(canonicalRecordJson(value));
const same = (left, right) => canonicalRecordJson(left) === canonicalRecordJson(right);
const cursor = (value) =>
  value === null || (typeof value === 'string' && value.length > 0 && !/[\s\p{Cc}]/u.test(value));
function unavailable(reason, cause) {
  throw Object.assign(new Error(`Story timing ingestion unavailable: ${reason}`, { cause }), {
    code: 'STORY_TIMING_INGEST_UNAVAILABLE',
    reason,
  });
}
function prepare(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !['store', 'claim', 'events'].includes(key)) ||
    !Array.isArray(input.events)
  )
    unavailable('arguments');
  // Preserve delivery order separately from the merger's deterministic timestamp order.
  const events = clone(input.events);
  mergeTimingEvents([], events);
  return { events, claim: clone(input.claim), store: input.store };
}
async function ingest({ store, claim, events }) {
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
      const timing = generation.timing;
      if (
        !cursor(timing.ingestedCursor) ||
        !cursor(timing.publishedCursor) ||
        !cursor(timing.canonicalCommentKey)
      )
        unavailable('timing-state');
      // Validate retained native events as well as this delivery; never repair corrupt history.
      const retained = mergeTimingEvents(timing.events, []);
      if (!same(retained, timing.events)) unavailable('timing-state');
      if (generation.batch !== null || generation.conflicts.length)
        unavailable('publication-pending');
      const merged = mergeTimingEvents(timing.events, events);
      const seen = new Set(timing.events.map((event) => event.eventId));
      let ingestedCursor = timing.ingestedCursor;
      for (const event of events) {
        if (seen.has(event.eventId)) continue;
        seen.add(event.eventId);
        ingestedCursor = event.sourceCursor;
      }
      const result = (status, persisted) =>
        Object.freeze({
          status,
          generation: persisted.generation,
          ingestedCursor: persisted.timing.ingestedCursor,
          publishedCursor: persisted.timing.publishedCursor,
          publication: 'unpublished',
        });
      if (same(merged, timing.events)) return result('no-op', generation);
      generation.generation++;
      // The immutable generation is the local event log and acknowledgement checkpoint.
      // Publication cursor, publication counter, working payloads and batch are unchanged.
      timing.events = merged;
      timing.ingestedCursor = ingestedCursor;
      revalidate();
      const committed = await store.commitGeneration(
        {
          generation,
          claimId: claim.claimId,
          payloads: new Map(current.payloads),
        },
        { expectedGeneration: current.manifest.generation }
      );
      revalidate();
      if (
        !committed ||
        committed.manifest.claimId !== claim.claimId ||
        committed.manifest.generation !== generation.generation
      )
        unavailable('commit-readback');
      const verified = validateManifest(committed.manifest, {
        identity,
        payloads: committed.payloads,
      });
      if (!same(verified.generation, generation)) unavailable('commit-readback');
      return result('ingested', verified.generation);
    }
  );
}
export async function ingestTimingEvents(input) {
  try {
    return await ingest(prepare(input));
  } catch (error) {
    let code;
    try {
      code = error?.code;
    } catch {
      /* Retain fail-closed behavior for arbitrary errors. */
    }
    if (typeof code === 'string' && (code.startsWith('STORY_') || code === 'EISSUELOCKED'))
      throw error;
    unavailable('operation', error);
  }
}
