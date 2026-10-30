// @story #2039 #2067
// Provider inspection only. A baseline read never proves an earlier request cannot arrive.
import { canonicalRecordJson as json } from '../github-records/canonical-json.mjs';
import { resolveRuntimeRoot } from '../runtime-storage.mjs';
import { resolveSessionId } from '../session-id.mjs';
import { withIssueLock, currentIssueLockOwner } from '../../issue-mutator-lock.mjs';
import { assertStoryWriter } from './writer-claim.mjs';
import { storyIdentityKey } from './manifest.mjs';
import { storyCachePath } from './store.mjs';
import { compareSnapshots } from './snapshot-compare.mjs';
import { confirmResourceEffect } from './provider-adapters.mjs';
import { materializeBodyTemplate } from './body-template.mjs';
import { createHash } from 'node:crypto';
import { validateRecoveryJournal, hydrateJournalSnapshot, checkpointResource } from './journal.mjs';
const clone = (value) => JSON.parse(json(value));
const same = (a, b) => json(a) === json(b);
const hash = (value) => createHash('sha256').update(value).digest('hex');
function fail(reason, cause) {
  throw Object.assign(new Error(`Story recovery unavailable: ${reason}`, { cause }), {
    code: 'STORY_RECOVERY_UNAVAILABLE',
    reason,
  });
}
const limitation =
  'Read-only provider recovery cannot prove a timed-out request will never arrive; it never retries or completes the native transition.';
export async function recoverStoryBatch({ store, claim, ports, allowMutation = false } = {}) {
  if (
    allowMutation !== false ||
    !store ||
    typeof store.readGeneration !== 'function' ||
    typeof store.commitGeneration !== 'function' ||
    !ports ||
    typeof ports.readSnapshot !== 'function' ||
    typeof ports.observe !== 'function'
  )
    fail('arguments');
  const root = resolveRuntimeRoot({ cwd: process.cwd(), env: {} });
  const worktree = root.projectRoot,
    sessionId = resolveSessionId();
  let identity;
  if (!claim?.registryKey) fail('registered-claim-required');
  const assertOwner = () => {
    assertStoryWriter(claim, { worktree, sessionId });
    if (
      resolveSessionId() !== sessionId ||
      resolveRuntimeRoot({ cwd: process.cwd(), env: {} }).projectRoot !== worktree ||
      store.cachePath !== claim.cachePath ||
      (identity &&
        (store.cachePath !== storyCachePath({ projectRoot: worktree, identity }) ||
          claim.identityKey !== storyIdentityKey(identity)))
    )
      fail('local-context');
  };
  assertOwner();
  const initial = await store.readGeneration();
  assertOwner();
  if (!initial || initial.manifest.claimId !== claim.claimId) fail('missing-generation');
  validateRecoveryJournal(initial);
  identity = clone(initial.generation.identity);
  assertOwner();
  return withIssueLock(
    { issue: identity.issueNumber, projDir: worktree, sessionId, retries: 0 },
    async () => {
      const owner = currentIssueLockOwner(identity.issueNumber);
      const revalidate = () => {
        assertOwner();
        if (
          !owner ||
          currentIssueLockOwner(identity.issueNumber) !== owner ||
          owner.projDir !== root.mainRoot ||
          owner.sessionId !== sessionId
        )
          fail('native-lock-owner');
      };
      revalidate();
      const record = await store.readGeneration();
      revalidate();
      if (
        !record ||
        record.manifest.claimId !== claim.claimId ||
        !same(record.generation.identity, identity)
      )
        fail('missing-generation');
      const batch = validateRecoveryJournal(record);
      if (!batch)
        return {
          status:
            record.generation.dirtyKeys.length ||
            record.generation.timing.ingestedCursor !== record.generation.timing.publishedCursor
              ? 'staged'
              : 'clean',
          batch: null,
          limitation,
        };
      if (batch.status === 'conflict' || batch.status === 'complete')
        return { status: batch.status, batch: clone(batch), limitation };
      let cloud;
      try {
        cloud = clone(await ports.readSnapshot({ identity: clone(record.generation.identity) }));
      } catch (error) {
        revalidate();
        fail('snapshot-unavailable', error);
      }
      revalidate();
      if (cloud?.complete !== true) fail('snapshot-incomplete');
      compareSnapshots(cloud, cloud);
      assertStoryWriter(claim, { worktree, sessionId, assignment: cloud.assignees });
      const generation = clone(record.generation),
        payloads = new Map(record.payloads);
      let changed = false;
      for (const effect of generation.batch.effects) {
        if (!effect.attempted || effect.outcome.state === 'confirmed') continue;
        let dispatch = clone(effect);
        if (effect.kind === 'issue-update') {
          const realized = materializeBodyTemplate({
            template: batch.bodyTemplate,
            expectedDigest: hash(json(batch.bodyTemplate)),
            effects: generation.batch.effects,
          });
          if (!same(realized, batch.realizedIssue)) fail('realized-issue-drift');
          dispatch = { ...dispatch, ...realized };
        }
        let confirmation;
        try {
          const observed = await ports.observe(clone(dispatch));
          revalidate();
          confirmation = confirmResourceEffect(dispatch, observed, {
            baseline: generation.baseSnapshot,
          });
        } catch (error) {
          revalidate();
          if (error.code !== 'STORY_EFFECT_UNCONFIRMED') fail('observation-unavailable', error);
        }
        if (confirmation) {
          effect.outcome = clone(confirmation.outcome);
          checkpointResource(generation, payloads, dispatch, confirmation);
          changed = true;
        }
      }
      const expected = hydrateJournalSnapshot(generation.baseSnapshot, payloads);
      const comparison = compareSnapshots(expected, cloud);
      if (!comparison.equal) {
        generation.batch.status = 'conflict';
        generation.conflicts.push({
          batchId: batch.batchId,
          baseline: clone(batch.baseline),
          working: clone(generation.working),
          current: cloud,
          changes: clone(comparison.changes),
        });
        changed = true;
      } else if (changed) {
        generation.batch.status = generation.batch.effects.some(
          (row) => row.attempted && row.outcome?.state !== 'confirmed'
        )
          ? 'uncertain'
          : generation.batch.effects.every((row) => row.outcome?.state === 'confirmed')
            ? 'confirmed'
            : 'partial';
      }
      const latest = await store.readGeneration();
      revalidate();
      if (!latest || latest.manifest.payloadDigest !== record.manifest.payloadDigest)
        fail('generation-race');
      if (changed) {
        generation.generation = record.manifest.generation + 1;
        const committed = await store.commitGeneration(
          { generation, claimId: claim.claimId, payloads },
          { expectedGeneration: record.manifest.generation }
        );
        revalidate();
        const stored = validateRecoveryJournal(committed);
        if (!same(stored, generation.batch)) fail('commit-readback');
      }
      return { status: generation.batch.status, batch: clone(generation.batch), limitation };
    }
  );
}
