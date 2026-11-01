// @story #2069
// Source-bound derivation for the protected native Plan assessment issuer.
import { resolveRuntimeRoot } from './runtime-storage.mjs';
import { resolveSessionId } from './session-id.mjs';
import { currentIssueLockOwner } from '../issue-mutator-lock.mjs';
import { assertStoryWriter } from './story-cache/writer-claim.mjs';
import { isNativeStoryStore, storyCachePath } from './story-cache/store.mjs';
import { storyIdentityKey } from './story-cache/manifest.mjs';
import { loadConfig } from '../config.mjs';
import { fieldIdFor } from '../project-fields.mjs';
import { hydrateJournalSnapshot } from './story-cache/journal.mjs';
import { decompositionPolicyIdentity } from './decomposition-policy.mjs';
import { readDecompositionRecords } from './decomposition-records.mjs';
import {
  derivePlanDecompositionProjection,
  planProjectionResources,
} from './plan-decomposition-projection.mjs';
import { readCandidateForecastReady } from './plan-approved-guard.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { canonicalRecordJson as json } from './github-records/canonical-json.mjs';
import { readRetainedNativePlanChildren } from './plan-child-inventory.mjs';

export async function prepareNativePlanAssessment({ store, claim, cfg, body, deps = {} }) {
  const root = resolveRuntimeRoot({ cwd: process.cwd(), env: {} });
  const sessionId = resolveSessionId();
  // The exact issue is independently read from the actual protected store below.
  if (!isNativeStoryStore(store)) throw new Error('decomposition:native-store');
  assertStoryWriter(claim, { worktree: root.projectRoot, sessionId });
  const record = await store.readGeneration();
  const identity = record.generation.identity;
  const issueNumber = identity.issueNumber;
  if (
    store.cachePath !== claim.cachePath ||
    claim.identityKey !== storyIdentityKey(identity) ||
    store.cachePath !== storyCachePath({ projectRoot: root.projectRoot, identity })
  )
    throw new Error('decomposition:native-identity');
  const owner = currentIssueLockOwner(issueNumber);
  if (
    !owner ||
    owner.sessionId !== sessionId ||
    owner.projDir !== root.mainRoot ||
    record.manifest.claimId !== claim.claimId ||
    cfg.repo !== identity.repository ||
    cfg.projectId !== identity.projectId ||
    record.generation.batch ||
    record.generation.conflicts.length
  )
    throw new Error('decomposition:native-owner');
  const baseline = hydrateJournalSnapshot(record.generation.baseSnapshot, record.payloads);
  const issueKey = 'issue:' + identity.issueNodeId;
  const entry = record.generation.working[issueKey];
  let actualBody = entry
    ? String(record.payloads.get(entry.payloadPath))
    : baseline.resources[issueKey].body;
  try {
    const parsed = JSON.parse(actualBody);
    if (parsed.schema === 'aitm.story-issue-update/v1') actualBody = parsed.body;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  if (actualBody !== body) throw new Error('decomposition:native-body');
  const publishedBody = baseline.resources[issueKey].body;
  if (
    Object.keys(record.generation.working).every((key) => key === issueKey) &&
    readCandidateForecastReady(body) === readCandidateForecastReady(publishedBody) &&
    json(parseIssueFieldDb(body)) === json(parseIssueFieldDb(publishedBody))
  )
    return null;
  if (!readDecompositionRecords(baseline.resources[issueKey].body).assessment) return null;
  const actualCfg = loadConfig();
  if (
    actualCfg.repo !== cfg.repo ||
    actualCfg.projectId !== cfg.projectId ||
    ['size', 'estimate'].some((key) => fieldIdFor(actualCfg, key) !== fieldIdFor(cfg, key))
  )
    throw new Error('decomposition:native-configuration');
  const assessment = readDecompositionRecords(publishedBody).assessment;
  const cachedSource = {
    basis: 'cached-baseline',
    input: { subject: assessment.subject },
    sourceObservations: {
      readProject: {
        status: 'projected',
        value: {
          projectId: identity.projectId,
          projectItemId: identity.projectItemId,
          ...(assessment.kind === 'epic'
            ? {
                children: readRetainedNativePlanChildren({
                  inventory: deps.nativeChildInventory,
                  identity,
                  publishedBody,
                }),
              }
            : {}),
        },
      },
      readPolicy: { status: 'observed', value: decompositionPolicyIdentity() },
    },
  };
  const derive = (source, resources, assessedAt) =>
    derivePlanDecompositionProjection({
      source,
      identity,
      cfg,
      projectDir: root.projectRoot,
      ...resources,
      assessedAt,
      deps: { readPlanAtCommit: deps.readPlanAtCommit },
    });
  const source = await derive(
    cachedSource,
    planProjectionResources({ snapshot: baseline, body: publishedBody }),
    assessment.assessedAt
  );
  if (source.projection.status !== 'current' || source.input.availability.status !== 'complete')
    throw new Error('decomposition:cached-baseline-unavailable');
  assertStoryWriter(claim, { worktree: root.projectRoot, sessionId });
  if (
    currentIssueLockOwner(issueNumber) !== owner ||
    (await store.readGeneration()).manifest.payloadDigest !== record.manifest.payloadDigest
  )
    throw new Error('decomposition:native-generation');
  const effects = Object.entries(record.generation.working)
    .filter(([key]) => key !== issueKey)
    .map(([key, entry]) => {
      const raw = String(record.payloads.get(entry.payloadPath));
      return entry.kind === 'project-field'
        ? {
            key,
            kind: 'project-field-update',
            target: { fieldId: JSON.parse(raw).fieldId },
            candidate: JSON.parse(raw),
          }
        : {
            key,
            kind: key.startsWith('comment:new:') ? 'comment-create' : 'comment-update',
            target: { commentNodeId: key.slice(8) },
            candidate: raw,
          };
    });
  const candidate = await derive(
    source,
    planProjectionResources({ snapshot: baseline, body, effects })
  );
  // New business scope still needs its own independent assessment, not approval adoption.
  if (
    candidate.input.scopeDigest !== source.input.scopeDigest ||
    candidate.input.kind !== source.input.kind
  )
    return null;
  if (candidate.inputDigest === source.inputDigest) return null;
  if (
    candidate.input.availability.status !== 'complete' ||
    ['pending', 'indeterminate', 'must-decompose'].includes(candidate.assessment.status)
  )
    throw new Error('decomposition:candidate-assessment-unavailable');
  if (
    candidate.sourceObservations.readForecast.value.proposals.some((proposal) =>
      proposal.proposalId.startsWith('comment:comment:new:')
    )
  )
    throw new Error('decomposition:unbound-proposal');
  return {
    source,
    candidate,
    body,
    record,
    identity,
    owner,
    check: () => {
      assertStoryWriter(claim, { worktree: root.projectRoot, sessionId });
      if (currentIssueLockOwner(issueNumber) !== owner)
        throw new Error('decomposition:native-owner');
    },
  };
}
