// `plan-approve` verb — Plan -> Develop approval gate.
//
// Records plan approval and its human/Full-Auto provenance on an issue by
// appending a hidden marker to the issue body. `move-state.mjs` reads the
// marker; without it (and with `gatePlanToDevelop=true`), promote from plan to
// develop refuses.
//
// Idempotent: re-invocation with the marker already present is a no-op.
// Refuses if the issue is not in `plan` state.

import { pexec } from '../../gh/lib/gh-client.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { getProjectDir } from '../paths.mjs';
import {
  hasPlanApprovedMarker,
  insertPlanApprovedMarker,
  parsePlanApprovedMarker,
  readPlanApprovedForecastRecordId,
  readPlanApprovedMode,
  upsertPlanApprovedMarker,
  wrapDeepDiveInDetails,
} from '../lib/markers.mjs';
import { stampEntryMarker } from '../lib/stage-entry-markers.mjs';
import { lintChecklistCommands } from '../lib/checklist-command-lint.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import {
  ensureFullAutoPlanApprovalAudit,
  ensureStoryBindingRepairAudit,
  isExplicitFullAutoPlanApproval,
  readPlanApprovedTimestamp,
} from '../lib/plan-approval-audit.mjs';
import { readDirectoryContract } from '../lib/github-records/contract-write.mjs';
import { parseIssueDirectory } from '../lib/github-records/issue-directory.mjs';
import { resolveStoryIntentSource } from '../lib/story-intent-source.mjs';
import { fetchEpicChildren } from '../lib/epic-children-gate.mjs';
import {
  upsertEpicOrchestrationPlan,
  verifyEpicOrchestrationPlan,
} from '../lib/epic-orchestration-plan.mjs';
import { defaultResolveTrunkSha } from '../lib/plan-approved-guard.mjs';
import { parseEntryMarkers } from '../lib/stage-entry-grammar.mjs';
import {
  formatGovernedPlanPolicyRefusal,
  validateGovernedLinkedPlan,
} from '../lib/governed-plan-policy.mjs';
import {
  collectPlanApprovalRepairEvidence,
  evaluateModernPlanTransitionEvidence,
  evaluatePlanApprovalRepairEvidence,
} from '../lib/plan-approval-evidence-repair.mjs';

// Visit-suffix-aware check for any aitm-entered-plan marker (bare or -N).
// We only backfill the original visit when NO plan entry marker exists at
// all — if `aitm-entered-plan-2` is present (legitimate re-entry), we do
// not synthesize a phantom visit-1 marker. Tolerant of BOTH the legacy
// `:`-delimited form and the new `ts="..."` property grammar (#374) so the
// idempotency check still fires after the writer flip.
const FORECAST_READY_RE =
  /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/i;

function hasEntry(body, state) {
  return parseEntryMarkers(body).some((entry) => entry.state === state);
}

const bindingMatches = (approved, binding) =>
  Object.entries(binding).every(([key, value]) => approved?.[key] === value);
function observationIdentity(result) {
  return JSON.stringify([
    result.binding,
    result.observation?.key ?? null,
    result.observation?.path ?? null,
    result.observation?.contentSha256 ?? null,
    result.source === 'linked-plan-task' ? result.location.heading : null,
  ]);
}
function directoryRefusal(reason, detail = '') {
  return {
    status: 'story-approval-binding-unsupported',
    reason,
    message: `story-approval-binding-unsupported: ${reason}: ${String(detail).slice(0, 240)}`,
  };
}

async function defaultFetchIssueBody({ issueNumber, repo }) {
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) { body }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  return data?.repository?.issue?.body ?? '';
}

// #295 — body writes use the governed writer; the validation hook also runs
// on fresh retry bases when the writer rebases rather than rerunning mutate.
async function defaultMutateIssueBody({ issueNumber, repo, mutate, validateFreshBase }) {
  return mutateIssueBody({ issueNumber, repo, mutate, validateFreshBase, deps: { pexec } });
}

async function defaultGetBoardState({ issueNumber, projectDir: _projectDir }) {
  const mod = await import('../task-tracker.mjs');
  return mod.getIssueBoardState(String(issueNumber).replace(/^#/, ''));
}

export async function runPlanApprove({
  issueNumber,
  cfg,
  projectDir,
  repairFromEvidence = false,
  deps = {},
} = {}) {
  if (!issueNumber) throw new Error('plan-approve: issueNumber is required');
  if (!cfg) throw new Error('plan-approve: cfg is required');

  const fetchIssueBody = deps.fetchIssueBody || defaultFetchIssueBody;
  const mutateBody = deps.mutateIssueBody || defaultMutateIssueBody;
  const getBoardState = deps.getBoardState || defaultGetBoardState;
  const nowIso = deps.nowIso || (() => new Date().toISOString().replace(/\.\d+Z$/, 'Z'));
  const ensureAudit = deps.ensureFullAutoPlanApprovalAudit || ensureFullAutoPlanApprovalAudit;
  const env = deps.env ?? process.env;
  const requestedMode = isExplicitFullAutoPlanApproval(env) ? 'full-auto' : 'human';
  const auditDeps = {
    listComments: deps.listComments,
    postComment: deps.postComment,
  };
  const adaptiveConfigured =
    Number.isInteger(cfg.estimationRubricIssue) && cfg.estimationRubricIssue > 0;

  const state = await getBoardState({ issueNumber, projectDir });
  const laterRepairState = ['develop', 'test', 'review'].includes(state);
  const automaticModernEligible =
    !repairFromEvidence && requestedMode === 'full-auto' && laterRepairState;
  if (state !== 'plan' && !adaptiveConfigured && !repairFromEvidence && !automaticModernEligible) {
    return {
      status: 'wrong-state',
      message: `#${issueNumber} is in '${state ?? 'unknown'}', expected 'plan' — plan-approve only applies to issues in Plan.`,
    };
  }

  const body = await fetchIssueBody({ issueNumber, repo: cfg.repo });
  if (state === 'plan') {
    try {
      const directory = await (deps.readDirectoryContract || readDirectoryContract)({
        repository: cfg.repo,
        issue: Number(issueNumber),
        issueBody: body,
        readContractRecord: deps.contractWrite?.readContractRecord,
      });
      if (directory !== null || parseIssueDirectory({ issueBody: body }) !== null)
        return directoryRefusal(
          'directory-authority-unsupported',
          'Story approval binding is not supported for directory authority'
        );
    } catch (error) {
      return directoryRefusal('directory-inspection-failed', error.message);
    }
  }
  const validateGovernedPlan = deps.validateGovernedPlan || validateGovernedLinkedPlan;
  const governedPlan = await validateGovernedPlan({
    body,
    projectDir: projectDir || getProjectDir(),
    deps: deps.governedPlanPolicy,
  });
  if (!governedPlan.ok) {
    return {
      status: 'governed-plan-policy',
      message:
        `#${issueNumber} linked plan violates governed plan policy — refusing to approve.\n` +
        formatGovernedPlanPolicyRefusal(governedPlan),
      violations: governedPlan.violations,
    };
  }
  let collectedRepairEvidence = null;
  let automaticTransitionEvidence = null;
  if (automaticModernEligible) {
    try {
      collectedRepairEvidence = await collectPlanApprovalRepairEvidence({
        issueNumber,
        repo: cfg.repo,
        deps,
      });
    } catch (error) {
      return {
        status: 'evidence-repair-refused',
        message: `#${issueNumber} evidence repair could not read complete durable evidence: ${error.message}`,
        blockers: ['evidence-read-failed'],
      };
    }
    automaticTransitionEvidence = evaluateModernPlanTransitionEvidence({
      body,
      authorityRecords: collectedRepairEvidence.authorityRecords,
      authorityDiagnostics: collectedRepairEvidence.authorityDiagnostics,
      authenticatedLogin: collectedRepairEvidence.authenticatedLogin,
      repository: cfg.repo,
      issue: issueNumber,
    });
    if (
      automaticTransitionEvidence.status !== 'available' &&
      (collectedRepairEvidence.authorityRecords.length > 0 ||
        collectedRepairEvidence.authorityDiagnostics.length > 0)
    ) {
      return {
        status: 'evidence-repair-refused',
        message: `#${issueNumber} transition-authority repair refused: ${automaticTransitionEvidence.blockers.join('; ')}`,
        blockers: automaticTransitionEvidence.blockers,
      };
    }
    if (automaticTransitionEvidence.status !== 'available') {
      automaticTransitionEvidence = null;
    }
  }
  if (repairFromEvidence || automaticTransitionEvidence) {
    if (!['develop', 'test', 'review'].includes(state)) {
      return {
        status: 'evidence-repair-refused',
        message: `#${issueNumber} is in '${state ?? 'unknown'}'; evidence repair requires Develop, Test, or Review.`,
        blockers: ['unsupported-state'],
      };
    }
    if (requestedMode !== 'full-auto') {
      return {
        status: 'evidence-repair-refused',
        message: `#${issueNumber} evidence repair requires explicit TT_FULL_AUTO=1 authority.`,
        blockers: ['full-auto-authority-missing'],
      };
    }
    const existingApproval = parsePlanApprovedMarker(body);
    const existingMode = existingApproval?.mode ?? readPlanApprovedMode(body);
    if (existingApproval && existingMode !== 'full-auto') {
      return {
        status: 'evidence-repair-refused',
        message: `#${issueNumber} already has '${existingMode}' Plan-approval provenance; evidence repair cannot replace it.`,
        blockers: ['existing-approval-not-full-auto'],
      };
    }
    if (existingApproval && !existingApproval.repairRecordId) {
      return {
        status: 'evidence-repair-refused',
        message: `#${issueNumber} already has ordinary Full-Auto Plan approval; evidence repair cannot relabel it as reconstructed.`,
        blockers: ['existing-approval-not-evidence-repair'],
      };
    }
    let repairEvidence = collectedRepairEvidence;
    if (repairEvidence === null) {
      try {
        repairEvidence = await collectPlanApprovalRepairEvidence({
          issueNumber,
          repo: cfg.repo,
          deps,
        });
      } catch (error) {
        return {
          status: 'evidence-repair-refused',
          message: `#${issueNumber} evidence repair could not read complete durable evidence: ${error.message}`,
          blockers: ['evidence-read-failed'],
        };
      }
    }
    // The approval time follows the complete evidence snapshot. Later comments
    // or exception revisions are subsequent lifecycle events, not a race that
    // can retroactively change what was approved at this instant.
    const repairTs = existingApproval?.ts || nowIso();
    const {
      comments,
      records,
      issueBodyHistory,
      authorityRecords,
      authorityDiagnostics,
      authenticatedLogin,
    } = repairEvidence;
    const evidence = evaluatePlanApprovalRepairEvidence({
      body,
      comments,
      records,
      issueBodyHistory,
      issueNumber,
      repo: cfg.repo,
      now: new Date(repairTs).toISOString(),
    });
    const evidenceBlockers = [...evidence.blockers];
    if (automaticTransitionEvidence) {
      const authorityLineageRecord = (records || []).find(
        ({ envelope }) =>
          envelope?.recordId === automaticTransitionEvidence.authorityRecordId &&
          envelope?.payload?.revision === automaticTransitionEvidence.authorityRevision &&
          envelope?.payload?.requirementIds?.includes('approval.plan')
      );
      if (!authorityLineageRecord) {
        evidenceBlockers.push('plan-transition-authority-lineage');
      }
    }
    if (
      evidenceBlockers.length > 0 ||
      !evidence.approvalPlanRecordId ||
      !evidence.revokedRecordId
    ) {
      return {
        status: 'evidence-repair-refused',
        message: `#${issueNumber} evidence repair refused: ${evidenceBlockers.join('; ')}`,
        blockers: evidenceBlockers,
      };
    }
    if (
      existingApproval?.repairRecordId &&
      existingApproval.repairRecordId !== evidence.revokedRecordId
    ) {
      return {
        status: 'evidence-repair-refused',
        message: `#${issueNumber} existing evidence-repair marker names a different revoked record.`,
        blockers: ['existing-repair-record-mismatch'],
      };
    }
    const resolveTrunkSha = deps.resolveTrunkSha || defaultResolveTrunkSha;
    const trunkSha = hasEntry(body, 'ready-for-plan')
      ? await resolveTrunkSha({ cfg, projectDir: projectDir || getProjectDir() })
      : null;
    const writeResult = await mutateBody({
      issueNumber,
      repo: cfg.repo,
      mutate: (base) => {
        const freshEvidence = evaluatePlanApprovalRepairEvidence({
          body: base,
          comments,
          records,
          issueBodyHistory,
          issueNumber,
          repo: cfg.repo,
          now: new Date(repairTs).toISOString(),
        });
        if (freshEvidence.blockers.length > 0) {
          throw new Error(
            `plan-approve: evidence changed before repair: ${freshEvidence.blockers.join('; ')}`
          );
        }
        if (automaticTransitionEvidence) {
          const freshTransitionEvidence = evaluateModernPlanTransitionEvidence({
            body: base,
            authorityRecords,
            authorityDiagnostics,
            authenticatedLogin,
            repository: cfg.repo,
            issue: issueNumber,
          });
          if (
            freshTransitionEvidence.status !== 'available' ||
            freshTransitionEvidence.transitionId !== automaticTransitionEvidence.transitionId ||
            freshTransitionEvidence.authorityRecordId !==
              automaticTransitionEvidence.authorityRecordId
          ) {
            throw new Error('plan-approve: transition authority changed before repair');
          }
        }
        const freshApproval = parsePlanApprovedMarker(base);
        if (freshApproval) {
          if (
            freshApproval.mode !== 'full-auto' ||
            freshApproval.repairRecordId !== evidence.revokedRecordId
          ) {
            throw new Error('plan-approve: incompatible approval appeared during evidence repair');
          }
          return base;
        }
        return insertPlanApprovedMarker(base, repairTs, {
          mode: 'full-auto',
          repairRecordId: evidence.revokedRecordId,
          trunkSha,
        });
      },
    });
    const persistedBody =
      typeof writeResult?.body === 'string'
        ? writeResult.body
        : await fetchIssueBody({ issueNumber, repo: cfg.repo });
    const audit = await ensureAudit({
      issueNumber,
      repo: cfg.repo,
      ts: readPlanApprovedTimestamp(persistedBody),
      mode: readPlanApprovedMode(persistedBody),
      env,
      repairEvidence: {
        ...(automaticTransitionEvidence || {}),
        approvalPlanRecordId:
          automaticTransitionEvidence?.authorityRecordId ?? evidence.approvalPlanRecordId,
        revokedRecordId: evidence.revokedRecordId,
      },
      ...auditDeps,
    });
    return {
      ...(automaticTransitionEvidence || {}),
      status: automaticTransitionEvidence
        ? 'repaired-from-transition-authority'
        : 'repaired-from-evidence',
      ts: repairTs,
      mode: readPlanApprovedMode(persistedBody),
      audit,
      approvalPlanRecordId:
        automaticTransitionEvidence?.authorityRecordId ?? evidence.approvalPlanRecordId,
      revokedRecordId: evidence.revokedRecordId,
    };
  }
  const requiresTrunkProvenance = hasEntry(body, 'ready-for-plan');
  const fetchChildren = deps.fetchEpicChildren || fetchEpicChildren;
  const epicChildren = await fetchChildren({
    cfg,
    parentEpicNumber: issueNumber,
    deps: deps.epicChildren,
  });
  const resolveTrunkSha = deps.resolveTrunkSha || defaultResolveTrunkSha;
  const trunkSha =
    requiresTrunkProvenance || epicChildren.length > 0
      ? await resolveTrunkSha({ cfg, projectDir: projectDir || getProjectDir() })
      : null;
  const forecastRecordId = body.match(FORECAST_READY_RE)?.[1] ?? null;
  const hasApproval = hasPlanApprovedMarker(body);
  const frozenForecastRecordId = readPlanApprovedForecastRecordId(body);
  const lateRepair =
    state !== 'plan' && hasApproval && frozenForecastRecordId === null && forecastRecordId !== null;
  if (state !== 'plan' && !lateRepair) {
    return {
      status: 'wrong-state',
      message: `#${issueNumber} is in '${state ?? 'unknown'}', expected 'plan' — plan-approve only applies to issues in Plan.`,
    };
  }
  if (adaptiveConfigured && forecastRecordId === null) {
    return {
      status: 'forecast-missing',
      message: `#${issueNumber} has no converged adaptive forecast to freeze at Plan approval.`,
    };
  }

  if (lateRepair) {
    const approvalTs = readPlanApprovedTimestamp(body);
    const writeResult = await mutateBody({
      issueNumber,
      repo: cfg.repo,
      mutate: (base) => {
        const freshReady = base.match(FORECAST_READY_RE)?.[1] ?? null;
        const freshFrozen = readPlanApprovedForecastRecordId(base);
        if (freshFrozen !== null) return base;
        if (!hasPlanApprovedMarker(base) || freshReady === null) {
          throw new Error('plan-approve: adaptive approval repair evidence disappeared');
        }
        const existingMode = readPlanApprovedMode(base);
        let next = upsertPlanApprovedMarker(base, approvalTs, {
          storyDigest: parsePlanApprovedMarker(base)?.storyDigest ?? null,
          storyIntentDigest: parsePlanApprovedMarker(base)?.storyIntentDigest ?? null,
          storyIntentSource: parsePlanApprovedMarker(base)?.storyIntentSource ?? null,
          repairRecordId: parsePlanApprovedMarker(base)?.repairRecordId ?? null,
          forecastRecordId: freshReady,
          mode: existingMode === 'unknown' ? null : existingMode,
          trunkSha,
        });
        if (epicChildren.length > 0) {
          next = upsertEpicOrchestrationPlan(next, { children: epicChildren, trunkSha });
        }
        return next;
      },
    });
    const persistedBody =
      typeof writeResult?.body === 'string'
        ? writeResult.body
        : await fetchIssueBody({ issueNumber, repo: cfg.repo });
    const audit = await ensureAudit({
      issueNumber,
      repo: cfg.repo,
      ts: readPlanApprovedTimestamp(persistedBody),
      mode: readPlanApprovedMode(persistedBody),
      env,
      ...auditDeps,
    });
    return {
      status: 'repaired-approval',
      ts: approvalTs,
      mode: readPlanApprovedMode(persistedBody),
      audit,
    };
  }

  // #236 — refuse plan→develop approval if the body's AC/VC checklists contain
  // compound CLI commands that the /task test sandbox will later reject.
  const lint = lintChecklistCommands(body);
  const lintErrors = lint.violations.filter((v) => v.severity === 'error');
  if (lintErrors.length > 0) {
    return {
      status: 'forbidden-command',
      message:
        `#${issueNumber} body contains forbidden compound commands in checklists — refusing to approve.\n` +
        lintErrors
          .map(
            (v) =>
              `  plan-exit-forbidden-command: ${v.section}:${v.lineIndex + 1}: \`${v.command}\` — forbidden ${v.rule}`
          )
          .join('\n'),
      violations: lintErrors,
    };
  }

  const resolveIntent = deps.resolveStoryIntent || resolveStoryIntentSource;
  const resolved = resolveIntent({
    body,
    projectDir: projectDir || getProjectDir(),
    governedPlan,
    deps: deps.governedPlanPolicy,
  });
  if (!resolved?.ok)
    return {
      status: 'story-approval-binding-invalid',
      violations: resolved?.violations ?? [],
      message: `#${issueNumber}: ${(resolved?.violations ?? []).map((v) => `${v.code}: ${v.message}`).join('; ')}; repair/review the source, then npx aitm plan-approve #${issueNumber}.`,
    };
  const binding = resolved.binding;
  function observeFresh(base) {
    try {
      if (parseIssueDirectory({ issueBody: base }) !== null)
        throw new Error('directory authority appeared');
    } catch (error) {
      throw new Error(directoryRefusal('directory-inspection-failed', error.message).message);
    }
    const policy = validateGovernedPlan({
      body: base,
      projectDir: projectDir || getProjectDir(),
      deps: deps.governedPlanPolicy,
    });
    if (policy?.then)
      throw new Error(
        'story-approval-binding-changed: fresh policy observation must be synchronous'
      );
    const current = resolveIntent({
      body: base,
      projectDir: projectDir || getProjectDir(),
      governedPlan: policy,
      deps: deps.governedPlanPolicy,
    });
    if (!current?.ok || observationIdentity(current) !== observationIdentity(resolved))
      throw new Error(
        'story-approval-binding-changed: source observation or story changed; repair/review the source, then rerun plan-approve'
      );
    return current;
  }

  const hasPlanEntry = hasEntry(body, 'plan');

  // Both markers present — true no-op. (Diagnostic fast-path; the closure
  // below would re-check the FRESH base anyway. The audit still runs here:
  // this is the repair path when the body write succeeded but the comment post
  // failed on a prior invocation.
  const parsedApproval = parsePlanApprovedMarker(body);
  const trunkComplete = !requiresTrunkProvenance || parsedApproval?.trunkSha === trunkSha;
  const epicPlanComplete =
    epicChildren.length === 0 ||
    verifyEpicOrchestrationPlan(body, { children: epicChildren, trunkSha }).ok;
  const approvalComplete =
    bindingMatches(parsedApproval, binding) &&
    trunkComplete &&
    epicPlanComplete &&
    (!adaptiveConfigured ||
      (frozenForecastRecordId !== null && frozenForecastRecordId === forecastRecordId));
  if (hasApproval && hasPlanEntry && approvalComplete) {
    const persistedBody = await fetchIssueBody({ issueNumber, repo: cfg.repo });
    try {
      observeFresh(persistedBody);
    } catch (error) {
      return { status: 'story-approval-binding-persistence-mismatch', message: error.message };
    }
    const persisted = parsePlanApprovedMarker(persistedBody);
    if (
      !bindingMatches(persisted, binding) ||
      JSON.stringify(persisted) !== JSON.stringify(parsedApproval) ||
      !hasEntry(persistedBody, 'plan')
    )
      return {
        status: 'story-approval-binding-persistence-mismatch',
        message:
          'Persisted approval differs from the observed approval; rerun plan-approve after review.',
      };
    const audit = await ensureAudit({
      issueNumber,
      repo: cfg.repo,
      ts: readPlanApprovedTimestamp(body),
      mode: readPlanApprovedMode(body),
      env,
      ...auditDeps,
    });
    const repairAudit = deps.previousApproval
      ? await (deps.ensureStoryBindingRepairAudit || ensureStoryBindingRepairAudit)({
          issueNumber,
          repo: cfg.repo,
          approved: persisted,
          previousApproval: deps.previousApproval,
          ...auditDeps,
        })
      : null;
    return {
      status: 'already-approved',
      mode: readPlanApprovedMode(body),
      audit,
      repairAudit,
    };
  }

  const ts = nowIso();
  let previousApproval = parsedApproval;
  let expectedApproval = null;
  let repairedBinding = false;
  // The first mutation derives the next body from the fresh base and honors
  // concurrent approval/entry markers. Retry rebases are checked separately
  // by validateFreshBase before the governed writer pushes.
  const writeResult = await mutateBody({
    issueNumber,
    repo: cfg.repo,
    // The versioned writer rebases edits on retry without rerunning mutate.
    // Its validation hook must therefore certify every fresh base before push.
    validateFreshBase: observeFresh,
    mutate: (base) => {
      let n = base;
      if (!hasEntry(n, 'plan')) {
        n = stampEntryMarker(n, 'plan', ts);
      }
      const freshForecastRecordId = n.match(FORECAST_READY_RE)?.[1] ?? null;
      if (adaptiveConfigured && freshForecastRecordId === null) {
        throw new Error('plan-approve: adaptive forecast marker disappeared before approval');
      }
      const freshApproval = parsePlanApprovedMarker(n);
      const freshBindingComplete = bindingMatches(freshApproval, binding);
      const freshComplete =
        freshBindingComplete &&
        (!requiresTrunkProvenance || freshApproval.trunkSha === trunkSha) &&
        (!adaptiveConfigured || freshApproval.forecastRecordId === freshForecastRecordId);
      previousApproval = freshApproval;
      repairedBinding = Boolean(freshApproval) && !freshBindingComplete;
      const approvalTs =
        repairedBinding && freshApproval.ts === ts
          ? new Date(Date.parse(ts) + 1).toISOString()
          : ts;
      if (!freshComplete)
        n = upsertPlanApprovedMarker(n, approvalTs, {
          ...binding,
          forecastRecordId: adaptiveConfigured
            ? freshForecastRecordId
            : (freshApproval?.forecastRecordId ?? null),
          mode: freshBindingComplete
            ? freshApproval.mode === 'unknown'
              ? null
              : freshApproval.mode
            : requestedMode,
          trunkSha,
        });
      expectedApproval = parsePlanApprovedMarker(n);
      if (epicChildren.length > 0) {
        n = upsertEpicOrchestrationPlan(n, { children: epicChildren, trunkSha });
      }
      return wrapDeepDiveInDetails(n);
    },
  });
  const persistedBody =
    typeof writeResult?.body === 'string'
      ? writeResult.body
      : await fetchIssueBody({ issueNumber, repo: cfg.repo });

  try {
    observeFresh(persistedBody);
  } catch (error) {
    return { status: 'story-approval-binding-persistence-mismatch', message: error.message };
  }
  const approved = parsePlanApprovedMarker(persistedBody);
  if (
    !expectedApproval ||
    !bindingMatches(approved, binding) ||
    JSON.stringify(approved) !== JSON.stringify(expectedApproval) ||
    !hasEntry(persistedBody, 'plan')
  )
    return {
      status: 'story-approval-binding-persistence-mismatch',
      message:
        'Persisted approval does not match the complete approval binding; repair/review the source, then rerun plan-approve.',
    };

  let audit;
  try {
    audit = await ensureAudit({
      issueNumber,
      repo: cfg.repo,
      ts: approved.ts,
      mode: approved.mode,
      env,
      ...auditDeps,
    });
  } catch (error) {
    if (repairedBinding) error.storyBindingRepair = { issueNumber, previousApproval, approved };
    throw error;
  }

  const repairAudit = repairedBinding
    ? await (deps.ensureStoryBindingRepairAudit || ensureStoryBindingRepairAudit)({
        issueNumber,
        repo: cfg.repo,
        previousApproval,
        approved,
        ...auditDeps,
      })
    : null;
  if (repairedBinding)
    return {
      status: 'repaired-story-binding',
      ts: approved.ts,
      mode: approved.mode,
      previousApproval,
      approved,
      audit,
      repairAudit,
    };

  if (hasApproval && !hasPlanEntry) {
    return { status: 're-stamped-entry', ts: approved.ts, mode: approved.mode, audit };
  }
  if (hasApproval && adaptiveConfigured && !approvalComplete) {
    return { status: 'repaired-approval', ts: approved.ts, mode: approved.mode, audit };
  }
  return { status: 'approved', ts: approved.ts, mode: approved.mode, audit };
}

function auditDisposition(audit) {
  if (audit?.mode === 'human') return 'not-applicable';
  if (audit?.auditPosted) return 'posted';
  if (audit?.alreadyPresent) return 'already-present';
  return 'not-posted';
}

export function formatPlanApproveOutcome(issueNumber, result) {
  const provenance = result?.mode || 'unknown';
  const audit = auditDisposition(result?.audit);
  const detail = `provenance=${provenance}; Full-Auto audit=${audit}`;
  switch (result?.status) {
    case 'directory-approved':
      return `✓ Plan approved for #${issueNumber} at ${result.ts} via sealed Delivery Contract (${detail}). \`/task promote #${issueNumber}\` to move to Develop.`;
    case 'approved':
      return `✓ Plan approved for #${issueNumber} at ${result.ts} (${detail}). \`/task promote #${issueNumber}\` to move to Develop.`;
    case 'already-approved':
      return `#${issueNumber} already has a plan-approval marker — no change (${detail}).`;
    case 're-stamped-entry':
      return `✓ Re-stamped missing aitm-entered-plan marker for #${issueNumber} at ${result.ts} (approval already present; ${detail}). \`/task promote #${issueNumber}\` to move to Develop.`;
    case 'repaired-approval':
      return `✓ Repaired adaptive Plan approval lineage for #${issueNumber} at ${result.ts}; the existing approval now freezes its forecast record (${detail}).`;
    case 'repaired-story-binding':
      return `Plan approval story binding renewed for #${issueNumber} at ${result.ts} (${detail}).`;
    case 'repaired-from-evidence':
      return `✓ Reconstructed Full-Auto Plan approval for #${issueNumber} at ${result.ts} from durable evidence (revoked exception ${result.revokedRecordId}; ${detail}).`;
    case 'repaired-from-transition-authority':
      return `✓ Converged Full-Auto Plan approval for #${issueNumber} at ${result.ts} from completed transition authority ${result.transitionId} (historical outcome=${result.historicalOutcome}; revoked exception ${result.revokedRecordId}; ${detail}).`;
    default:
      return null;
  }
}

function parseArgs(rest) {
  const out = { issueNumber: null, repairFromEvidence: false };
  for (const a of rest) {
    if (a === '--repair-from-evidence') {
      out.repairFromEvidence = true;
      continue;
    }
    const m = String(a).match(/^#?(\d+)$/);
    if (m && out.issueNumber === null) out.issueNumber = Number(m[1]);
  }
  return out;
}

export async function verbPlanApprove(rest, cfg, deps = {}) {
  const { issueNumber, repairFromEvidence } = parseArgs(rest);
  if (!issueNumber) {
    process.stderr.write('Usage: /task plan-approve #N [--repair-from-evidence]\n');
    process.exit(1);
  }
  if (process.env.TT_SKIP_NETWORK === '1') {
    process.stderr.write('plan-approve: TT_SKIP_NETWORK set — refusing to run gate offline\n');
    process.exit(1);
  }
  const projectDir = getProjectDir();
  let result;
  try {
    result = await runPlanApprove({ issueNumber, cfg, projectDir, repairFromEvidence, deps });
  } catch (err) {
    process.stderr.write(`plan-approve: ${err.message}\n`);
    process.exit(1);
  }
  switch (result.status) {
    case 'directory-approved':
    case 'approved':
    case 'already-approved':
    case 're-stamped-entry':
    case 'repaired-approval':
    case 'repaired-story-binding':
    case 'repaired-from-evidence':
    case 'repaired-from-transition-authority':
      process.stdout.write(`${formatPlanApproveOutcome(issueNumber, result)}\n`);
      return;
    case 'wrong-state':
      process.stderr.write(`⛔ ${result.message}\n`);
      process.exit(3);
    case 'forbidden-command':
      process.stderr.write(`⛔ ${result.message}\n`);
      process.exit(12);
    case 'forecast-missing':
      process.stderr.write(`⛔ ${result.message}\n`);
      process.exit(13);
    case 'governed-plan-policy':
      process.stderr.write(`⛔ ${result.message}\n`);
      process.exit(14);
    case 'story-approval-binding-unsupported':
    case 'story-approval-binding-invalid':
    case 'story-approval-binding-persistence-mismatch':
      process.stderr.write(`${result.status}: ${result.message}\n`);
      process.exit(15);
    case 'evidence-repair-refused':
      process.stderr.write(`⛔ ${result.message}\n`);
      process.exit(15);
    default:
      process.stderr.write(`plan-approve: unknown result: ${result.status}\n`);
      process.exit(1);
  }
}

const _isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (_isMain) {
  const { loadConfig } = await import('../config.mjs');
  const cfg = loadConfig();
  await verbPlanApprove(process.argv.slice(2), cfg);
}
