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
import { observeContent } from './native-observation.mjs';
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
// These are comparisons of separately observed points, not a new provider snapshot.
function targetState(effect, value, before) {
  if (value?.complete !== true) return null;
  if (!same(value.identity, effect.target.identity)) fail('observation-identity');
  if (effect.kind === 'project-field-update') {
    const field = value.field;
    if (
      !field ||
      field.fieldId !== effect.target.fieldId ||
      field.itemId !== effect.target.itemId ||
      field.type !== effect.target.type
    )
      fail('observation-identity');
    const projection = clone(before);
    projection.fields = projection.fields.map((row) =>
      row.fieldId === field.fieldId ? clone(field) : row
    );
    projection.fieldsDigest = hash(
      json({ canonicalizationVersion: 'aitm.canonical-json/v1', fields: projection.fields })
    );
    compareSnapshots(projection, projection);
    return {
      unchanged: same(
        before.fields.find((row) => row.fieldId === field.fieldId),
        field
      ),
    };
  }
  const observed = observeContent(value);
  const issue = effect.kind === 'issue-update';
  if (issue && typeof value.title !== 'string') return null;
  if (
    observed.kind !== (issue ? 'issue' : 'comment') ||
    (issue
      ? observed.key !== `issue:${effect.target.issueNodeId}`
      : effect.kind === 'comment-update' &&
        observed.key !== `comment:${effect.target.commentNodeId}`)
  )
    fail('observation-identity');
  if (effect.kind === 'comment-create') {
    if (!Array.isArray(value.inventory)) return null;
    if (
      value.inventory.some((row) => typeof row.id !== 'string' || typeof row.body !== 'string') ||
      new Set(value.inventory.map((row) => row.id)).size !== value.inventory.length
    )
      fail('observation-inventory');
    return { unchanged: false };
  }
  const previous = before.resources[observed.key];
  return {
    unchanged:
      previous?.digest === observed.digest &&
      same(previous.revision, observed.revision) &&
      (!issue || before.title === value.title),
  };
}
function accountLaterConfirmation(comparison, before, effect, confirmation) {
  if (confirmation.field) {
    const id = confirmation.field.fieldId;
    if (
      same(
        comparison.fields.find((row) => row.fieldId === id),
        before.fields.find((row) => row.fieldId === id)
      )
    ) {
      comparison.fields = comparison.fields.map((row) =>
        row.fieldId === id ? clone(confirmation.field) : row
      );
      comparison.fieldsDigest = hash(
        json({ canonicalizationVersion: 'aitm.canonical-json/v1', fields: comparison.fields })
      );
    }
    return;
  }
  const observed = confirmation.observed,
    key = observed.key;
  const earlier = comparison.resources[key],
    baseline = before.resources[key];
  const knownBefore =
    baseline &&
    earlier?.digest === baseline.digest &&
    same(earlier.revision, baseline.revision) &&
    (observed.kind !== 'issue' || comparison.title === before.title);
  const knownAbsent =
    effect.kind === 'comment-create' && !earlier && same(comparison.inventory, before.inventory);
  if (!knownBefore && !knownAbsent) return;
  comparison.resources[key] = { ...clone(observed), ownership: 'owned' };
  if (knownAbsent)
    comparison.inventory = [...comparison.inventory, confirmation.outcome.providerId].sort();
  if (observed.kind === 'issue') {
    comparison.title = effect.candidate.title;
    comparison.titleDigest = hash(comparison.title);
  }
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
      if (!same(cloud.identity, identity)) fail('snapshot-identity');
      compareSnapshots(cloud, cloud);
      assertStoryWriter(claim, { worktree, sessionId, assignment: cloud.assignees });
      const generation = clone(record.generation),
        payloads = new Map(record.payloads);
      const comparisonCloud = clone(cloud),
        targets = [],
        targetedChanges = [];
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
        let confirmation, value;
        const before = hydrateJournalSnapshot(generation.baseSnapshot, payloads);
        try {
          value = await ports.observe(clone(dispatch));
          revalidate();
          confirmation = confirmResourceEffect(dispatch, value, {
            baseline: generation.baseSnapshot,
          });
        } catch (error) {
          revalidate();
          if (error.code !== 'STORY_EFFECT_UNCONFIRMED') fail('observation-unavailable', error);
          const actual = targetState(dispatch, value, before);
          if (actual && !actual.unchanged)
            targetedChanges.push({ kind: 'target-observation', key: effect.key });
        }
        targets.push({ key: effect.key, value: clone(value ?? null) });
        if (confirmation) {
          accountLaterConfirmation(comparisonCloud, before, dispatch, confirmation);
          effect.outcome = clone(confirmation.outcome);
          checkpointResource(generation, payloads, dispatch, confirmation);
          changed = true;
        }
      }
      const expected = hydrateJournalSnapshot(generation.baseSnapshot, payloads);
      const comparison = compareSnapshots(expected, comparisonCloud);
      if (!comparison.equal || targetedChanges.length) {
        generation.batch.status = 'conflict';
        generation.conflicts.push({
          batchId: batch.batchId,
          baseline: clone(batch.baseline),
          working: clone(generation.working),
          current: cloud,
          observations: clone(targets),
          changes: [...clone(comparison.changes), ...targetedChanges],
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
        // The latest bounded observation window is phase evidence, never frozen intent
        // or a claim of an atomic current vector. Prior windows remain in immutable generations.
        generation.batch.recoveryObservation = {
          schema: 'aitm.story-recovery-observation/v1',
          snapshot: clone(cloud),
          targets: clone(targets),
        };
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
