// @story #2069
// Private native approval producer; public writer activation belongs to #2071.
import { createHash } from 'node:crypto';
import { canonicalRecordJson as json } from './github-records/canonical-json.mjs';
import { runPlanApprove, verifyRetainedPlanApproval } from '../verbs/plan-approve.mjs';
import { resolveRuntimeRoot } from './runtime-storage.mjs';
import { resolveSessionId } from './session-id.mjs';
import { withIssueLock, currentIssueLockOwner } from '../issue-mutator-lock.mjs';
import { assertStoryWriter } from './story-cache/writer-claim.mjs';
import { isNativeStoryStore, storyCachePath } from './story-cache/store.mjs';
import { storyIdentityKey, validateManifest } from './story-cache/manifest.mjs';
import { hydrateJournalSnapshot, validateRecoveryJournal } from './story-cache/journal.mjs';
import { validateStagedComposite } from './story-cache/stage-capabilities.mjs';
import { resolveStoryIntentSource } from './story-intent-source.mjs';
import { computeScopeIdentity } from './workflow-policy/scope-identity.mjs';
import { parsePlanApprovedMarker, hasPlanApprovedMarker } from './markers.mjs';
import { parseIssueDirectory } from './github-records/issue-directory.mjs';
import { readRetainedNativePlanChildren } from './plan-child-inventory.mjs';
import {
  defaultResolveTrunkSha,
  readCandidateForecastReady,
  readCandidatePlanApprovalMarker,
  removeCandidatePlanApprovalMarker,
} from './plan-approved-guard.mjs';
import { substantiveMetadataFields } from './metadata-section.mjs';
import { markdownViews } from './plan-markdown-views.mjs';
import { readNativePlanForecastSelection } from './estimation/native-plan-selection.mjs';
import {
  buildPlanApprovalCandidateAudit,
  isCanonicalPlanApprovalAuditComment,
} from './plan-approval-audit.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => JSON.parse(json(value));
const grants = new WeakMap();
const reboundApprovals = new WeakMap();
const SCHEMA = 'aitm.story-issue-update/v2';
function refuse(reason) {
  throw new Error('plan-candidate:' + reason);
}
function payload(record, entry) {
  const bytes = record.payloads.get(entry?.payloadPath);
  if (bytes === undefined || hash(bytes) !== entry.digest) refuse('approval-payload');
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(bytes));
}
function retained(record) {
  if (!record) return null;
  const key = `issue:${record.generation.identity.issueNodeId}`;
  const entry = record.generation.working[key];
  if (!entry) return null;
  let value;
  try {
    value = JSON.parse(payload(record, entry));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    if (entry.capabilityRef?.startsWith('plan-approved:')) refuse('approval-envelope');
    return null;
  }
  if (value?.schema !== SCHEMA) {
    if (entry.capabilityRef?.startsWith('plan-approved:')) refuse('approval-envelope');
    return null;
  }
  if (
    Object.keys(value).sort().join(',') !== 'body,nativeApproval,schema,title' ||
    json(value) !== payload(record, entry)
  )
    refuse('approval-envelope');
  if (entry.capabilityRef !== 'plan-approved:' + hash(json(value.nativeApproval)))
    refuse('approval-reference');
  return value;
}
// Recovered grants are capabilities only while the registered native owner holds the lock.
export function validateNativePlanApprovalDelta(capability, { base, candidate } = {}) {
  const bound = reboundApprovals.get(capability);
  if (!bound) refuse('native-approval-capability');
  bound.check();
  if (base !== bound.beforeBody || candidate !== bound.body) refuse('native-approval-delta');
  return bound.reference;
}
export function readNativePlanDecompositionApproval(capability) {
  const bound = reboundApprovals.get(capability);
  if (!bound) refuse('native-approval-capability');
  bound.check();
  return bound.decomposition ? clone(bound.decomposition) : null;
}
export function validateNativePlanApprovalComposite(capability, { published, candidate } = {}) {
  const bound = reboundApprovals.get(capability);
  if (!bound) refuse('native-approval-capability');
  bound.check();
  if (published !== bound.publishedBody || candidate !== bound.body)
    refuse('native-approval-delta');
  validateStagedComposite({
    base: published,
    candidate: bound.beforeBody,
    operations: [{ base: published, candidate: bound.beforeBody }],
  });
  return true;
}
export async function rebindNativePlanApproval({ store, claim, cfg, body, deps = {} } = {}) {
  const root = resolveRuntimeRoot({ cwd: process.cwd(), env: {} });
  const sessionId = resolveSessionId();
  const owner = () => {
    if (!isNativeStoryStore(store) || !claim?.registryKey || store.cachePath !== claim.cachePath)
      refuse('native-store-required');
    assertStoryWriter(claim, { worktree: root.projectRoot, sessionId });
    if (
      resolveSessionId() !== sessionId ||
      resolveRuntimeRoot({ cwd: process.cwd(), env: {} }).projectRoot !== root.projectRoot
    )
      refuse('local-context');
  };
  owner();
  const initial = await store.readGeneration();
  owner();
  if (
    !initial ||
    initial.manifest.claimId !== claim.claimId ||
    claim.identityKey !== storyIdentityKey(initial.generation.identity) ||
    store.cachePath !==
      storyCachePath({ projectRoot: root.projectRoot, identity: initial.generation.identity })
  )
    refuse('approval-generation');
  const issueNumber = initial.generation.identity.issueNumber;
  const operation = async () => {
    const lock = currentIssueLockOwner(issueNumber);
    const check = () => {
      owner();
      if (
        !lock ||
        currentIssueLockOwner(issueNumber) !== lock ||
        lock.sessionId !== sessionId ||
        lock.projDir !== root.mainRoot
      )
        refuse('native-lock-owner');
    };
    check();
    const current = await store.readGeneration();
    check();
    const value = retained(current),
      record = value?.nativeApproval;
    if (
      !record ||
      current.manifest.claimId !== claim.claimId ||
      record.claimId !== claim.claimId ||
      record.sessionId !== sessionId ||
      record.worktree !== root.projectRoot ||
      json(record.identity) !== json(current.generation.identity) ||
      json(record.cfg) !== json(cfg)
    )
      refuse('approval-provenance');
    const candidate = body ?? value.body;
    if (readCandidatePlanApprovalMarker(candidate) !== readCandidatePlanApprovalMarker(value.body))
      refuse('approval-drift');
    const metadata = (text) =>
      substantiveMetadataFields(markdownViews(text).structuralLines.join('\n'), 'Plan Metadata');
    if (
      json(metadata(candidate)) !== json(metadata(value.body)) ||
      computeScopeIdentity({ repository: cfg.repo, issue: issueNumber, body: candidate }) !==
        record.scopeIdentity ||
      json(parsePlanApprovedMarker(candidate)) !== json(record.approved) ||
      readCandidateForecastReady(candidate) !== record.approved.forecastRecordId
    )
      refuse('approval-drift');
    const source = resolveStoryIntentSource({ body: candidate, projectDir: root.projectRoot });
    if (
      !source.ok ||
      Object.entries(source.binding).some(([key, val]) => record.approved[key] !== val) ||
      (source.observation?.path ?? null) !== (record.planObservation?.path ?? null) ||
      (source.observation?.contentSha256 ?? null) !==
        (record.planObservation?.contentSha256 ?? null)
    )
      refuse('approval-source-drift');
    if (
      (await (deps.resolveTrunkSha ?? defaultResolveTrunkSha)({
        cfg,
        projectDir: root.projectRoot,
      })) !== record.approved.trunkSha
    )
      refuse('trunk-drift');
    check();
    if (record.currentForecastSelection !== null) {
      if (Object.hasOwn(deps, 'readCurrentForecastSelection')) refuse('current-selection-override');
      if (
        json(
          await readNativePlanForecastSelection({
            identity: current.generation.identity,
            body: candidate,
            cfg,
            projectDir: root.projectRoot,
            readPlanAtCommit: deps.readPlanAtCommit,
          })
        ) !== json(record.currentForecastSelection)
      )
        refuse('current-selection-drift');
      check();
    }
    const capability = Object.freeze({});
    const capabilityCheck = () => {
      owner();
      const active = currentIssueLockOwner(issueNumber);
      if (!active || active.sessionId !== sessionId || active.projDir !== root.mainRoot)
        refuse('native-lock-owner');
    };
    reboundApprovals.set(capability, {
      check: capabilityCheck,
      body: value.body,
      beforeBody: record.beforeBody,
      publishedBody: record.publishedBody,
      reference: 'plan-approved:' + hash(json(record)),
      decomposition: record.decomposition ?? null,
    });
    return {
      capability,
      body: value.body,
      beforeBody: record.beforeBody,
      admitted: {
        repository: cfg.repo,
        issue: issueNumber,
        projectDir: root.projectRoot,
        scopeIdentity: record.scopeIdentity,
        approved: clone(record.approved),
        cfg: clone(cfg),
        planObservation: source.observation,
        currentForecastSelection: clone(record.currentForecastSelection),
      },
    };
  };
  if (currentIssueLockOwner(issueNumber)) return operation();
  return withIssueLock(
    { issue: issueNumber, projDir: root.projectRoot, sessionId, retries: 0 },
    operation
  );
}
const nextDigest = (next) =>
  hash(
    json({
      generation: next.generation,
      claimId: next.claimId,
      payloads: [...next.payloads].map(([key, value]) => [key, hash(value)]),
    })
  );
// Called by the actual durable store before any payload or pointer write. No mint API.
export function authorizeNativePlanApprovalCommit({ current, next, cachePath, issuance }) {
  const before = retained(current);
  const after = retained(next);
  if (before && after && json(before) === json(after)) return;
  if (!before && !after) return;
  if (
    before &&
    !after &&
    current.generation.batch?.status === 'complete' &&
    next.generation.batch === null
  ) {
    validateRecoveryJournal(current);
    return;
  }
  const grant = grants.get(issuance);
  if (
    !grant ||
    grant.cachePath !== cachePath ||
    grant.claimId !== next.claimId ||
    grant.previous !== current?.manifest.generation ||
    grant.next !== nextDigest(next)
  )
    refuse('native-approval-issuance');
  grants.delete(issuance);
}
export async function stageNativePlanApproval({ store, claim, cfg, deps = {} } = {}) {
  if (Object.hasOwn(deps, 'env')) refuse('native-provenance-override');
  if (Object.hasOwn(deps, 'readCurrentForecastSelection')) refuse('current-selection-override');
  const root = resolveRuntimeRoot({ cwd: process.cwd(), env: {} });
  const sessionId = resolveSessionId();
  if (!isNativeStoryStore(store) || !claim?.registryKey) refuse('native-store-required');
  const check = () => {
    assertStoryWriter(claim, { worktree: root.projectRoot, sessionId });
    if (
      resolveSessionId() !== sessionId ||
      resolveRuntimeRoot({ cwd: process.cwd(), env: {} }).projectRoot !== root.projectRoot ||
      store.cachePath !== claim.cachePath
    )
      refuse('local-context');
  };
  check();
  const initial = await store.readGeneration();
  check();
  if (
    !initial ||
    initial.manifest.claimId !== claim.claimId ||
    storyIdentityKey(initial.generation.identity) !== claim.identityKey ||
    storyCachePath({ projectRoot: root.projectRoot, identity: initial.generation.identity }) !==
      store.cachePath
  )
    refuse('approval-generation');
  const identity = initial.generation.identity;
  if (cfg?.repo !== identity.repository || cfg.projectId !== identity.projectId)
    refuse('approval-identity');
  return withIssueLock(
    { issue: identity.issueNumber, projDir: root.projectRoot, sessionId, retries: 0 },
    async () => {
      const lock = currentIssueLockOwner(identity.issueNumber);
      const locked = () => {
        check();
        if (
          !lock ||
          currentIssueLockOwner(identity.issueNumber) !== lock ||
          lock.sessionId !== sessionId ||
          lock.projDir !== root.mainRoot
        )
          refuse('native-lock-owner');
      };
      locked();
      const current = await store.readGeneration();
      locked();
      const verified = validateManifest(current.manifest, { identity, payloads: current.payloads });
      if (
        current.manifest.claimId !== claim.claimId ||
        json(verified.generation) !== json(current.generation)
      )
        refuse('approval-generation');
      if (current.generation.batch !== null || current.generation.conflicts.length)
        refuse('publication-pending');
      if (retained(current)) refuse('native-approval-already-staged');
      const status = current.generation.baseSnapshot.fields.find(
        (field) => field.fieldId === cfg.kanbanFieldId
      );
      if (
        typeof cfg.kanbanFieldId !== 'string' ||
        !cfg.kanbanFieldId.trim() ||
        typeof cfg.kanbanOptionPlan !== 'string' ||
        !cfg.kanbanOptionPlan.trim() ||
        status?.type !== 'SINGLE_SELECT' ||
        status.itemId !== identity.projectItemId ||
        status.value?.optionId !== cfg.kanbanOptionPlan
      )
        refuse('approval-plan-state');
      const key = `issue:${identity.issueNodeId}`;
      const baseline = hydrateJournalSnapshot(current.generation.baseSnapshot, current.payloads);
      const entry = current.generation.working[key];
      let body = entry ? payload(current, entry) : baseline.resources[key].body;
      let title = baseline.title;
      try {
        const value = JSON.parse(body);
        if (value.schema?.startsWith('aitm.story-issue-update/')) {
          if (
            value.schema !== 'aitm.story-issue-update/v1' ||
            Object.keys(value).sort().join(',') !== 'body,schema,title'
          )
            refuse('approval-working-payload');
          body = value.body;
          title = value.title;
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
      validateStagedComposite({
        base: baseline.resources[key].body,
        candidate: body,
        operations: [{ base: baseline.resources[key].body, candidate: body }],
      });
      const beforeBody = body;
      // Retained graph data is an explicit local input, never a request to fetch.
      const childInventory =
        deps.nativeChildInventory == null ? null : clone(deps.nativeChildInventory);
      const { withNativePlanAssessmentAdvance } = await import('./decomposition-projection.mjs');
      const assessment = await withNativePlanAssessmentAdvance({
        store,
        claim,
        cfg,
        body,
        deps: { ...deps, nativeChildInventory: childInventory },
      });
      body = assessment.body;
      // A published stamp is retained as evidence, not adopted as this invocation's
      // actor. Explicit native approval reauthorizes it using the real current mode.
      if (hasPlanApprovedMarker(body)) body = removeCandidatePlanApprovalMarker(body);
      const comments = baseline.inventory.map((id) => ({
        id,
        body: baseline.resources['comment:' + id].body,
      }));
      const stagedAudits = [];
      const result = await runPlanApprove({
        issueNumber: identity.issueNumber,
        cfg,
        projectDir: root.projectRoot,
        retainCandidateAuthority: true,
        deps: {
          resolveTrunkSha: deps.resolveTrunkSha,
          fetchEpicChildren: async ({ cfg: requested, parentEpicNumber }) => {
            locked();
            if (
              requested.repo !== identity.repository ||
              requested.projectId !== identity.projectId ||
              parentEpicNumber !== identity.issueNumber
            )
              refuse('native-child-inventory-invalid');
            return readRetainedNativePlanChildren({
              inventory: childInventory,
              identity,
              publishedBody: baseline.resources[key].body,
            });
          },
          readDirectoryContract: async ({ repository, issue, issueBody }) => {
            if (repository !== identity.repository || issue !== identity.issueNumber)
              refuse('directory-subject');
            const directory = parseIssueDirectory({ issueBody });
            if (directory && directory.issueNodeId !== identity.issueNodeId)
              refuse('directory-subject');
            return directory;
          },
          readCurrentForecastSelection: () =>
            readNativePlanForecastSelection({
              identity,
              body,
              projectDir: root.projectRoot,
              cfg,
              readPlanAtCommit: deps.readPlanAtCommit,
            }),
          nowIso: deps.nowIso,
          fetchIssueBody: async () => body,
          getBoardState: async () => 'plan',
          listComments: async () => comments,
          postComment: async ({ body: audit }) => {
            stagedAudits.push(audit);
          },
          mutateIssueBody: async ({ mutate, validateFreshBase }) => {
            locked();
            validateFreshBase(body);
            body = mutate(body);
            locked();
            return { status: 'ok', body };
          },
        },
      });
      locked();
      if (result.status !== 'approved') refuse('native-approval-' + result.status);
      const admitted = await verifyRetainedPlanApproval(result.approvalCapability, {
        body,
        repository: identity.repository,
        issue: identity.issueNumber,
        projectDir: root.projectRoot,
      });
      locked();
      const nativeApproval = {
        schema: 'aitm.native-plan-approval/v1',
        identity,
        claimId: claim.claimId,
        sessionId,
        worktree: root.projectRoot,
        beforeBody,
        decomposition: assessment.decomposition,
        publishedBody: baseline.resources[key].body,
        approved: admitted.approved,
        scopeIdentity: admitted.scopeIdentity,
        planObservation: admitted.planObservation,
        currentForecastSelection: admitted.currentForecastSelection,
        cfg: admitted.cfg,
      };
      const raw = json({ schema: SCHEMA, body, title, nativeApproval });
      const generation = clone(current.generation),
        payloads = new Map(current.payloads);
      const issuePath = 'working/approval-' + hash(raw) + '.json';
      payloads.set(issuePath, Buffer.from(raw));
      generation.working[key] = {
        kind: 'issue',
        capabilityRef: 'plan-approved:' + hash(json(nativeApproval)),
        payloadPath: issuePath,
        digest: hash(raw),
      };
      generation.dirtyKeys = [...new Set([...generation.dirtyKeys, key])].sort();
      if (admitted.approved.mode === 'full-auto') {
        const args = { issueNumber: identity.issueNumber, ts: admitted.approved.ts };
        const audit = buildPlanApprovalCandidateAudit(args);
        if (
          stagedAudits.length !== 1 ||
          !isCanonicalPlanApprovalAuditComment(stagedAudits[0], args)
        )
          refuse('approval-audit');
        const auditKey = 'comment:new:approval-' + hash(audit);
        const auditPath = 'working/approval-audit-' + hash(audit) + '.md';
        payloads.set(auditPath, Buffer.from(audit));
        generation.working[auditKey] = {
          kind: 'comment',
          capabilityRef: null,
          payloadPath: auditPath,
          digest: hash(audit),
        };
        generation.dirtyKeys = [...new Set([...generation.dirtyKeys, auditKey])].sort();
      }
      generation.generation = current.manifest.generation + 1;
      const next = { generation, payloads, claimId: claim.claimId };
      const issuance = Object.freeze({});
      grants.set(issuance, {
        cachePath: store.cachePath,
        claimId: claim.claimId,
        previous: current.manifest.generation,
        next: nextDigest(next),
      });
      const saved = await store.commitGeneration(next, {
        expectedGeneration: current.manifest.generation,
        nativeApprovalIssuance: issuance,
      });
      locked();
      if (json(retained(saved)) !== raw) refuse('approval-readback');
      return Object.freeze({
        status: 'staged',
        publication: 'unpublished',
        body,
        title,
        generation: saved.manifest.generation,
      });
    }
  );
}

/** Withdraw only the exact unpublished native stamp after any unattempted batch is released.
 * Restores the pre-approval working body; immutable generations retain both versions.
 */
export async function invalidateNativePlanApproval({ store, claim, approvalRef } = {}) {
  const root = resolveRuntimeRoot({ cwd: process.cwd(), env: {} });
  const sessionId = resolveSessionId();
  const owner = () => {
    if (!isNativeStoryStore(store) || !claim?.registryKey || store.cachePath !== claim.cachePath)
      refuse('native-store-required');
    assertStoryWriter(claim, { worktree: root.projectRoot, sessionId });
    if (
      resolveSessionId() !== sessionId ||
      resolveRuntimeRoot({ cwd: process.cwd(), env: {} }).projectRoot !== root.projectRoot
    )
      refuse('local-context');
  };
  owner();
  const initial = await store.readGeneration();
  owner();
  if (
    !initial ||
    initial.manifest.claimId !== claim.claimId ||
    claim.identityKey !== storyIdentityKey(initial.generation.identity) ||
    store.cachePath !==
      storyCachePath({ projectRoot: root.projectRoot, identity: initial.generation.identity })
  )
    refuse('approval-generation');
  const identity = initial.generation.identity;
  return withIssueLock(
    { issue: identity.issueNumber, projDir: root.projectRoot, sessionId, retries: 0 },
    async () => {
      const lock = currentIssueLockOwner(identity.issueNumber);
      const check = () => {
        owner();
        if (
          !lock ||
          currentIssueLockOwner(identity.issueNumber) !== lock ||
          lock.sessionId !== sessionId ||
          lock.projDir !== root.mainRoot
        )
          refuse('native-lock-owner');
      };
      check();
      const current = await store.readGeneration();
      check();
      const value = retained(current);
      const key = `issue:${identity.issueNodeId}`;
      if (
        !value ||
        current.manifest.claimId !== claim.claimId ||
        json(current.generation.identity) !== json(identity) ||
        json(value.nativeApproval.identity) !== json(identity) ||
        approvalRef !== current.generation.working[key].capabilityRef
      )
        refuse('approval-reference');
      if (current.generation.batch !== null || current.generation.conflicts.length)
        refuse('publication-pending');
      const generation = clone(current.generation),
        payloads = new Map(current.payloads);
      const restored = json({
        schema: 'aitm.story-issue-update/v1',
        body: value.nativeApproval.beforeBody,
        title: value.title,
      });
      const issuePath = 'working/approval-withdrawn-' + hash(restored) + '.json';
      payloads.set(issuePath, Buffer.from(restored));
      generation.working[key] = {
        kind: 'issue',
        capabilityRef: null,
        payloadPath: issuePath,
        digest: hash(restored),
      };
      if (value.nativeApproval.approved.mode === 'full-auto') {
        const audit = buildPlanApprovalCandidateAudit({
          issueNumber: identity.issueNumber,
          ts: value.nativeApproval.approved.ts,
        });
        const auditKey = 'comment:new:approval-' + hash(audit);
        const entry = generation.working[auditKey];
        if (entry && payload(current, entry) !== audit) refuse('approval-audit-changed');
        delete generation.working[auditKey];
        generation.dirtyKeys = generation.dirtyKeys.filter((dirty) => dirty !== auditKey);
      }
      generation.generation = current.manifest.generation + 1;
      const next = { generation, payloads, claimId: claim.claimId };
      const issuance = Object.freeze({});
      grants.set(issuance, {
        cachePath: store.cachePath,
        claimId: claim.claimId,
        previous: current.manifest.generation,
        next: nextDigest(next),
      });
      const saved = await store.commitGeneration(next, {
        expectedGeneration: current.manifest.generation,
        nativeApprovalIssuance: issuance,
      });
      check();
      if (retained(saved) !== null || payload(saved, saved.generation.working[key]) !== restored)
        refuse('approval-readback');
      return Object.freeze({
        status: 'invalidated',
        publication: 'unpublished',
        body: value.nativeApproval.beforeBody,
        title: value.title,
        generation: saved.manifest.generation,
      });
    }
  );
}
