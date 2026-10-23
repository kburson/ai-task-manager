// @story #2039 #2066
// One frozen attempt per resource. Aggregate transition completion belongs to the coordinator.
import { createHash } from 'node:crypto';
import { canonicalRecordJson as json } from '../github-records/canonical-json.mjs';
import { resolveRuntimeRoot } from '../runtime-storage.mjs';
import { resolveSessionId } from '../session-id.mjs';
import { withIssueLock, currentIssueLockOwner } from '../../issue-mutator-lock.mjs';
import { assertStoryWriter } from './writer-claim.mjs';
import { storyIdentityKey, validateManifest } from './manifest.mjs';
import { storyCachePath } from './store.mjs';
import { freezeStoryBatch } from './batch.mjs';
import { materializeBodyTemplate } from './body-template.mjs';
import { compareSnapshots } from './snapshot-compare.mjs';
import { confirmResourceEffect } from './provider-adapters.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const same = (a, b) => json(a) === json(b);
const clone = (value) => JSON.parse(json(value));
function fail(code, reason, cause) {
  throw Object.assign(new Error(`Story publication refused: ${reason}`, { cause }), {
    code,
    reason,
  });
}
const unavailable = (reason, cause) => fail('STORY_PUBLICATION_UNAVAILABLE', reason, cause);
const limitation =
  'Provider writes are non-atomic; a local lock and read-back cannot eliminate compare/write races or establish server-side exactly-once creation.';
function snapshotCopy(snapshot) {
  if (snapshot?.complete !== true) fail('STORY_OBSERVATION_UNAVAILABLE', 'snapshot-incomplete');
  const value = clone(snapshot);
  if (
    !value.resources ||
    Object.values(value.resources).some(
      (row) => typeof row.body !== 'string' || Object.hasOwn(row, 'payloadPath')
    )
  )
    fail('STORY_OBSERVATION_UNAVAILABLE', 'snapshot-current-bytes');
  compareSnapshots(value, value);
  return value;
}
function sourceBody(record, batch) {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    Buffer.from(
      record.payloads.get(
        batch.baseline.resources[`issue:${batch.baseline.identity.issueNodeId}`].payloadPath
      )
    )
  );
}
function checkpointResource(generation, payloads, effect, confirmation) {
  const { outcome, observed, field } = confirmation;
  if (field) {
    generation.baseSnapshot.fields = generation.baseSnapshot.fields.map((row) =>
      row.fieldId === field.fieldId ? clone(field) : row
    );
    generation.baseSnapshot.fieldsDigest = hash(
      json({
        canonicalizationVersion: 'aitm.canonical-json/v1',
        fields: generation.baseSnapshot.fields,
      })
    );
  } else {
    const { body, ...resource } = observed;
    const payloadPath = `payloads/${observed.digest}.txt`;
    payloads.set(payloadPath, body);
    generation.baseSnapshot.resources[observed.key] = {
      ...clone(resource),
      ownership: 'owned',
      payloadPath,
    };
    if (
      observed.kind === 'comment' &&
      !generation.baseSnapshot.inventory.includes(outcome.providerId)
    )
      generation.baseSnapshot.inventory.push(outcome.providerId);
    generation.baseSnapshot.inventory.sort();
    if (observed.kind === 'issue') {
      generation.baseSnapshot.title = effect.candidate.title;
      generation.baseSnapshot.titleDigest = hash(effect.candidate.title);
    }
    if (effect.candidate?.schema === 'aitm.story-timing-candidate/v1') {
      generation.timing.publishedCursor = effect.candidate.timing.ingestedCursor;
      generation.timing.canonicalCommentKey = observed.key;
    }
  }
  generation.dirtyKeys = generation.dirtyKeys.filter((key) => key !== effect.key);
  // Working intent is retained until aggregate completion; creation keeps its local key.
}
/** ports retain the same genuine native capabilities used by freezeStoryBatch and
 * validateIssue rechecks the realized composite/proof scope before the final dispatch.
 * No public writer/caller activation, recovery replay or final completion is performed here.
 */
export async function publishResourceEffects({ store, claim, batch, snapshot, ports } = {}) {
  const cloud = snapshotCopy(snapshot);
  if (
    !store ||
    typeof store.readGeneration !== 'function' ||
    typeof store.commitGeneration !== 'function' ||
    !ports ||
    typeof ports.apply !== 'function' ||
    typeof ports.observe !== 'function' ||
    typeof ports.validateIssue !== 'function' ||
    !Array.isArray(ports.capabilities)
  )
    unavailable('arguments');
  const root = resolveRuntimeRoot({ cwd: process.cwd(), env: {} }),
    worktree = root.projectRoot,
    sessionId = resolveSessionId();
  if (!claim?.registryKey) fail('STORY_WRITER_UNAVAILABLE', 'registered-claim-required');
  const assertOwner = () => {
    assertStoryWriter(claim, { worktree, sessionId });
    if (
      resolveSessionId() !== sessionId ||
      resolveRuntimeRoot({ cwd: process.cwd(), env: {} }).projectRoot !== worktree ||
      store.cachePath !== claim.cachePath ||
      store.cachePath !== storyCachePath({ projectRoot: worktree, identity: cloud.identity }) ||
      claim.identityKey !== storyIdentityKey(cloud.identity)
    )
      unavailable('local-context');
  };
  assertOwner();
  return withIssueLock(
    { issue: cloud.identity.issueNumber, projDir: worktree, sessionId, retries: 0 },
    async () => {
      const owner = currentIssueLockOwner(cloud.identity.issueNumber);
      const revalidate = () => {
        assertOwner();
        if (
          !owner ||
          currentIssueLockOwner(cloud.identity.issueNumber) !== owner ||
          owner.projDir !== root.mainRoot ||
          owner.sessionId !== sessionId
        )
          unavailable('native-lock-owner');
      };
      revalidate();
      let record = await store.readGeneration();
      revalidate();
      if (!record) unavailable('missing-generation');
      const verified = validateManifest(record.manifest, {
        identity: cloud.identity,
        payloads: record.payloads,
      });
      if (
        !same(record.generation, verified.generation) ||
        record.manifest.claimId !== claim.claimId
      )
        unavailable('generation-identity');
      if (record.generation.batch !== null && record.generation.batch.status !== 'complete')
        fail('STORY_PUBLICATION_PENDING', 'recover-existing-batch');
      const approved = freezeStoryBatch({
        generation: record,
        transition: batch?.transition,
        effects: batch?.effects.map((effect) =>
          effect.kind === 'issue-update'
            ? {
                ...effect,
                candidate: {
                  schema: 'aitm.story-final-body-template/v1',
                  body: batch.bodyTemplate.body,
                  title: batch.bodyTemplate.title,
                  slots: batch.bodyTemplate.slots,
                },
                intendedDigest: null,
              }
            : effect
        ),
        capabilities: ports.capabilities,
      });
      if (!same(approved, batch)) fail('STORY_BATCH_INVALID', 'frozen-batch-drift');
      let generation = clone(record.generation),
        payloads = new Map(record.payloads);
      generation.publicationGeneration = approved.publicationGeneration;
      generation.batch = { ...clone(approved), status: 'prepared' };
      const persist = async () => {
        revalidate();
        generation.generation = record.manifest.generation + 1;
        const expected = clone(generation);
        const committed = await store.commitGeneration(
          { generation, claimId: claim.claimId, payloads },
          { expectedGeneration: record.manifest.generation }
        );
        revalidate();
        const readback = validateManifest(committed.manifest, {
          identity: cloud.identity,
          payloads: committed.payloads,
        });
        // Stores may canonicalize immutable payload paths; compare against the actual bytes too.
        const withoutPaths = (value) =>
          JSON.parse(json(value), (key, v) => (key === 'payloadPath' ? undefined : v));
        if (
          committed.manifest.claimId !== claim.claimId ||
          !same(withoutPaths(readback.generation), withoutPaths(expected)) ||
          !same(committed.generation, readback.generation)
        )
          unavailable('commit-readback');
        record = committed;
        generation = clone(readback.generation);
        payloads = new Map(committed.payloads);
      };
      const comparison = compareSnapshots(approved.baseline, cloud);
      if (!comparison.equal) {
        generation.batch.status = 'conflict';
        generation.conflicts.push({
          batchId: approved.batchId,
          baseline: clone(approved.baseline),
          working: clone(generation.working),
          current: cloud,
          changes: clone(comparison.changes),
        });
        await persist();
        return {
          status: 'conflict',
          batch: clone(generation.batch),
          changes: comparison.changes,
          limitation,
        };
      }
      assertStoryWriter(claim, { worktree, sessionId, assignment: cloud.assignees });
      await persist();
      for (let index = 0; index < generation.batch.effects.length; index++) {
        let effect = generation.batch.effects[index];
        if (effect.attempted || effect.outcome !== null)
          fail('STORY_PUBLICATION_PENDING', 'attempted-resource');
        if (
          effect.dependencies.some(
            (key) =>
              generation.batch.effects.find((row) => row.key === key)?.outcome?.state !==
              'confirmed'
          )
        )
          unavailable('unconfirmed-dependency');
        let dispatch = clone(effect);
        if (effect.kind === 'issue-update') {
          const realized = materializeBodyTemplate({
            template: generation.batch.bodyTemplate,
            expectedDigest: hash(json(approved.bodyTemplate)),
            effects: generation.batch.effects,
          });
          await ports.validateIssue({
            base: sourceBody(record, approved),
            candidate: realized.candidate,
            effects: clone(generation.batch.effects),
            snapshot: cloud,
          });
          revalidate();
          generation.batch.realizedIssue = clone(realized);
          dispatch = { ...dispatch, ...clone(realized) };
        }
        effect.attempted = true;
        effect.outcome = { state: 'dispatching' };
        generation.batch.status = 'dispatching';
        await persist(); // Never invoke the provider until the attempt and exact realized body are durable.
        revalidate();
        let result, confirmation, reason;
        try {
          result = await ports.apply(clone(dispatch));
        } catch (error) {
          reason = String(error?.code ?? error?.message ?? 'transport-error');
        }
        revalidate();
        try {
          confirmation = confirmResourceEffect(dispatch, result, {
            baseline: generation.baseSnapshot,
          });
        } catch (error) {
          reason ??= error.reason ?? error.code;
        }
        if (!confirmation) {
          try {
            result = await ports.observe(clone(dispatch));
            revalidate();
            confirmation = confirmResourceEffect(dispatch, result, {
              baseline: generation.baseSnapshot,
            });
          } catch (error) {
            reason = String(error?.reason ?? error?.code ?? 'observation-unavailable');
          }
        }
        revalidate();
        effect = generation.batch.effects[index];
        if (!confirmation) {
          effect.outcome = { state: 'uncertain', reason };
          generation.batch.status = 'uncertain';
          await persist();
          return { status: 'uncertain', batch: clone(generation.batch), limitation };
        }
        effect.outcome = clone(confirmation.outcome);
        checkpointResource(generation, payloads, dispatch, confirmation);
        generation.batch.status = 'partial';
        await persist();
      }
      generation.batch.status = 'confirmed';
      await persist();
      return { status: 'confirmed', batch: clone(generation.batch), limitation };
    }
  );
}
