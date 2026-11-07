// @story #2153
import { pexec } from '../../gh/lib/gh-client.mjs';
import {
  parsePlanApprovedMarker,
  PLAN_APPROVED_RE,
  stripFencedCodeBlocks,
  buildPlanApprovedMarker,
} from './markers.mjs';
import { parseEntryMarkers } from './stage-entry-grammar.mjs';
import { readDirectoryContract } from './github-records/contract-write.mjs';
import { parseIssueDirectory } from './github-records/issue-directory.mjs';
import { fetchEpicChildren } from './epic-children-gate.mjs';
import { validateGovernedLinkedPlan } from './governed-plan-policy.mjs';
import { resolveStoryIntentSource } from './story-intent-source.mjs';
import { lintChecklistCommands } from './checklist-command-lint.mjs';
import { computeScopeIdentity } from './workflow-policy/scope-identity.mjs';
import {
  evaluateCurrentScopeAdmission,
  currentPlanApprovalDigest,
} from './plan-approval-current-scope.mjs';
import { observeCurrentPlanSource } from './plan-approval-current-source.mjs';
import { ensureFullAutoPlanApprovalAudit } from './plan-approval-audit.mjs';

import {
  isCanonicalCurrentApprovalMarker,
  validateCurrentScopeApproval,
} from './plan-approval-current-review.mjs';

const refused = (...blockers) => ({
  status: 'current-scope-refused',
  blockers,
  message: `Current-scope Plan approval refused: ${blockers.join('; ')}`,
});
const markerText = (body) => stripFencedCodeBlocks(body).match(PLAN_APPROVED_RE)?.[0] ?? null;
async function listCompleteComments({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['api', '--paginate', '--slurp', `repos/${repo}/issues/${issueNumber}/comments`],
    { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
  );
  const pages = JSON.parse(stdout);
  if (!Array.isArray(pages)) throw Error('current-scope-comments-unavailable');
  const comments = pages.flat();
  if (comments.some((c) => !c || typeof c.body !== 'string'))
    throw Error('current-scope-comments-invalid');
  return comments;
}
function compatibleMarker(body) {
  const visible = stripFencedCodeBlocks(body);
  const markers = [...visible.matchAll(new RegExp(PLAN_APPROVED_RE.source, 'gi'))];
  const claims = visible.match(/<!--\s*aitm-plan-approved\b/gi) ?? [];
  if (claims.length !== markers.length || markers.length > 1)
    throw Error('current-scope-approval-ambiguous');
  const prior = parsePlanApprovedMarker(body);
  if (!markers.length) return null;
  if (!prior || prior.mode !== 'full-auto' || prior.repairRecordId || !prior.currentApprovalDigest)
    throw Error('current-scope-existing-approval-provenance');
  if (!isCanonicalCurrentApprovalMarker(body)) throw Error('current-scope-approval-malformed');
  if ((markers[0][0].match(/\bcurrent-approval-digest=/g) || []).length !== 1)
    throw Error('current-scope-approval-digest-invalid');
  return prior;
}
export async function runCurrentScopePlanApprove({
  issueNumber,
  cfg,
  projectDir,
  state,
  repairFromEvidence,
  deps = {},
}) {
  if (repairFromEvidence) return refused('current-scope-flags-conflict');
  if (deps.env?.TT_FULL_AUTO !== '1') return refused('current-scope-full-auto-required');
  if (!['develop', 'test', 'review'].includes(state))
    return refused('current-scope-unsupported-state');
  const read = deps.fetchIssueBody;
  const mutateBody = deps.mutateIssueBody;
  const list = deps.listEvidenceComments ?? listCompleteComments;
  const validatePlan = deps.validateGovernedPlan ?? validateGovernedLinkedPlan;
  const resolveIntent = deps.resolveStoryIntent ?? resolveStoryIntentSource;
  const source = deps.observeCurrentPlanSource ?? observeCurrentPlanSource;
  const target = { issueNumber, repo: cfg.repo };
  try {
    const body = await read(target);
    const prior = compatibleMarker(body);
    const originalMarker = markerText(body);
    const directory = await (deps.readDirectoryContract ?? readDirectoryContract)({
      repository: cfg.repo,
      issue: Number(issueNumber),
      issueBody: body,
      readContractRecord: deps.contractWrite?.readContractRecord,
    });
    if (directory !== null || parseIssueDirectory({ issueBody: body }) !== null)
      return refused('current-scope-directory-unsupported');
    if (
      (
        await (deps.fetchEpicChildren ?? fetchEpicChildren)({
          cfg,
          parentEpicNumber: issueNumber,
          deps: deps.epicChildren,
        })
      ).length
    )
      return refused('current-scope-epic-unsupported');
    async function observe(base) {
      if (
        (
          await (deps.fetchEpicChildren ?? fetchEpicChildren)({
            cfg,
            parentEpicNumber: issueNumber,
            deps: deps.epicChildren,
          })
        ).length
      )
        throw Error('current-scope-epic-unsupported');
      if ((await deps.getBoardState({ issueNumber, projectDir })) !== state)
        throw Error('current-scope-state-changed');
      const visible = stripFencedCodeBlocks(base);
      if (parseIssueDirectory({ issueBody: base }) !== null)
        throw Error('current-scope-directory-unsupported');
      if (
        !parseEntryMarkers(visible).some((e) => e.state === 'plan') ||
        !/^##\s+Deep[- ]Dive Analysis\b/im.test(base) ||
        !/<!--\s*aitm-deep-dive-complete\b/.test(visible) ||
        /<!--\s*aitm-plan-(?:cancelled|rejected)\b/.test(visible)
      )
        throw Error('current-scope-planning-evidence');
      const lint = lintChecklistCommands(base);
      if (lint.violations.some((v) => v.severity === 'error'))
        throw Error('current-scope-forbidden-command');
      const governedPlan = await validatePlan({
        body: base,
        projectDir,
        deps: deps.governedPlanPolicy,
      });
      if (!governedPlan.ok || governedPlan.status !== 'valid' || !governedPlan.observation)
        throw Error('current-scope-governed-plan-invalid');
      const intent = resolveIntent({
        body: base,
        projectDir,
        governedPlan,
        deps: deps.governedPlanPolicy,
      });
      if (
        !intent?.ok ||
        !['linked-plan', 'linked-plan-task'].includes(intent.binding?.storyIntentSource)
      )
        throw Error('current-scope-story-invalid');
      const comments = await list(target);
      const admitted = evaluateCurrentScopeAdmission({
        body: base,
        comments,
        repository: cfg.repo,
        issue: Number(issueNumber),
      });
      if (admitted.status !== 'available') throw Error(admitted.blockers.join('; '));
      const evidence = await source({
        projectDir,
        cfg,
        body: base,
        governedPlan,
        storyBinding: intent.binding,
        admission: admitted.admission,
        issueNumber,
        deps,
      });
      return { evidence, comments };
    }
    const initial = await observe(body);
    const evidence = initial.evidence;
    const digest = currentPlanApprovalDigest(evidence);
    const same = prior?.currentApprovalDigest === digest;
    let ts = same ? prior.ts : (deps.nowIso ?? (() => new Date().toISOString()))();
    if (!same && prior?.ts === ts) ts = new Date(Date.parse(ts) + 1).toISOString();
    let expected = null;
    const bodyIdentity = (base) => {
      if (
        computeScopeIdentity({ repository: cfg.repo, issue: Number(issueNumber), body: base }) !==
        evidence.scopeIdentity
      )
        throw Error('current-scope-body-changed');
      if (markerText(base) !== originalMarker) throw Error('current-scope-approval-changed');
      compatibleMarker(base);
    };
    async function fresh(base) {
      bodyIdentity(base);
      if (currentPlanApprovalDigest((await observe(base)).evidence) !== digest)
        throw Error('current-scope-evidence-changed');
    }
    await fresh(await read(target));
    await mutateBody({
      ...target,
      validateFreshBase: bodyIdentity,
      validateFreshBaseAsync: fresh,
      mutate: (base) => {
        bodyIdentity(base);
        const marker = buildPlanApprovedMarker(ts, {
          ...evidence.storyBinding,
          mode: 'full-auto',
          trunkSha: evidence.trunkSha,
          forecastRecordId: evidence.forecastRecordId,
          currentApprovalDigest: digest,
        });
        const next = originalMarker
          ? base.replace(originalMarker, () => marker)
          : `${base}\n${marker}\n`;
        expected = parsePlanApprovedMarker(next);
        return next;
      },
    });
    const persisted = await read(target);
    compatibleMarker(persisted);
    const approved = parsePlanApprovedMarker(persisted);
    if (
      !expected ||
      JSON.stringify(approved) !== JSON.stringify(expected) ||
      currentPlanApprovalDigest((await observe(persisted)).evidence) !== digest
    )
      return refused('current-scope-persistence-mismatch');
    const audit = await (deps.ensureFullAutoPlanApprovalAudit ?? ensureFullAutoPlanApprovalAudit)({
      ...target,
      ts: approved.ts,
      mode: 'full-auto',
      env: deps.env,
      currentEvidence: evidence,
      listComments: () => list(target),
      postComment: deps.postComment,
    });
    const finalBody = await read(target);
    compatibleMarker(finalBody);
    const finalObservation = await observe(finalBody);
    if (
      !validateCurrentScopeApproval({
        body: finalBody,
        comments: finalObservation.comments,
        repository: cfg.repo,
        issue: issueNumber,
        acceptedSourceHead: evidence.sourceHead,
      }).pass ||
      JSON.stringify(parsePlanApprovedMarker(finalBody)) !== JSON.stringify(expected) ||
      currentPlanApprovalDigest(finalObservation.evidence) !== digest
    )
      return refused('current-scope-post-audit-mismatch');
    return {
      status: same ? 'already-approved-current-scope' : 'approved-current-scope',
      ts: approved.ts,
      mode: 'full-auto',
      audit,
      currentEvidence: evidence,
    };
  } catch (error) {
    return refused(error.message);
  }
}
