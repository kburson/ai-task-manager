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
  isExplicitFullAutoPlanApproval,
  readPlanApprovedTimestamp,
} from '../lib/plan-approval-audit.mjs';
import { writeDirectoryContractOperation } from '../lib/github-records/contract-write.mjs';
import { fetchEpicChildren } from '../lib/epic-children-gate.mjs';
import {
  upsertEpicOrchestrationPlan,
  verifyEpicOrchestrationPlan,
} from '../lib/epic-orchestration-plan.mjs';
import { defaultResolveTrunkSha } from '../lib/plan-approved-guard.mjs';

// Visit-suffix-aware check for any aitm-entered-plan marker (bare or -N).
// We only backfill the original visit when NO plan entry marker exists at
// all — if `aitm-entered-plan-2` is present (legitimate re-entry), we do
// not synthesize a phantom visit-1 marker. Tolerant of BOTH the legacy
// `:`-delimited form and the new `ts="..."` property grammar (#374) so the
// idempotency check still fires after the writer flip.
const PLAN_ENTRY_RE = /<!--\s*aitm-entered-plan(?:-\d+)?(?::|\s+ts=")/i;
const FORECAST_READY_RE =
  /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/i;
const R4P_ENTRY_RE = /<!--\s*aitm-entered-ready-for-plan(?:-\d+)?(?:\s+|:)/i;

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

// #295 — body writes go through `mutateIssueBody({ mutate })`; the closure
// runs on the FRESH base each push attempt.
async function defaultMutateIssueBody({ issueNumber, repo, mutate }) {
  return mutateIssueBody({ issueNumber, repo, mutate, deps: { pexec } });
}

async function defaultGetBoardState({ issueNumber, projectDir: _projectDir }) {
  const mod = await import('../task-tracker.mjs');
  return mod.getIssueBoardState(String(issueNumber).replace(/^#/, ''));
}

export async function runPlanApprove({ issueNumber, cfg, projectDir, deps = {} } = {}) {
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
  if (state !== 'plan' && !adaptiveConfigured) {
    return {
      status: 'wrong-state',
      message: `#${issueNumber} is in '${state ?? 'unknown'}', expected 'plan' — plan-approve only applies to issues in Plan.`,
    };
  }

  const body = await fetchIssueBody({ issueNumber, repo: cfg.repo });
  const requiresTrunkProvenance = R4P_ENTRY_RE.test(body);
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

  const directoryWrite = await writeDirectoryContractOperation({
    repository: cfg.repo,
    issue: Number(issueNumber),
    issueBody: body,
    action: 'seal',
    pexec,
    deps: deps.contractWrite,
  });
  if (directoryWrite.status === 'directory-written') {
    const ts = nowIso();
    const audit = await ensureAudit({
      issueNumber,
      repo: cfg.repo,
      ts,
      mode: requestedMode,
      env,
      ...auditDeps,
    });
    return { status: 'directory-approved', ts, mode: requestedMode, audit };
  }

  const hasPlanEntry = PLAN_ENTRY_RE.test(body);

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
    trunkComplete &&
    epicPlanComplete &&
    (!adaptiveConfigured ||
      (frozenForecastRecordId !== null && frozenForecastRecordId === forecastRecordId));
  if (hasApproval && hasPlanEntry && approvalComplete) {
    const audit = await ensureAudit({
      issueNumber,
      repo: cfg.repo,
      ts: readPlanApprovedTimestamp(body),
      mode: readPlanApprovedMode(body),
      env,
      ...auditDeps,
    });
    return {
      status: 'already-approved',
      mode: readPlanApprovedMode(body),
      audit,
    };
  }

  const ts = nowIso();
  // #295 — closure re-derives the next body from the FRESH base on every
  // push attempt. The diagnostic flags above set the return shape; the
  // closure independently checks markers so a concurrent writer that
  // landed approval / entry between our pre-fetch and the push is
  // honored (returns base unchanged → no-op).
  const writeResult = await mutateBody({
    issueNumber,
    repo: cfg.repo,
    mutate: (base) => {
      let n = base;
      if (!PLAN_ENTRY_RE.test(n)) {
        n = stampEntryMarker(n, 'plan', ts);
      }
      const freshForecastRecordId = n.match(FORECAST_READY_RE)?.[1] ?? null;
      if (adaptiveConfigured && freshForecastRecordId === null) {
        throw new Error('plan-approve: adaptive forecast marker disappeared before approval');
      }
      if (adaptiveConfigured) {
        const freshHasApproval = hasPlanApprovedMarker(n);
        const existingMode = readPlanApprovedMode(n);
        n = upsertPlanApprovedMarker(n, ts, {
          forecastRecordId: freshForecastRecordId,
          mode: freshHasApproval
            ? existingMode === 'unknown'
              ? null
              : existingMode
            : requestedMode,
          trunkSha,
        });
      } else if (!hasPlanApprovedMarker(n)) {
        n = insertPlanApprovedMarker(n, ts, { mode: requestedMode, trunkSha });
      } else if (requiresTrunkProvenance) {
        const existingMode = readPlanApprovedMode(n);
        n = upsertPlanApprovedMarker(n, ts, {
          mode: existingMode === 'unknown' ? null : existingMode,
          trunkSha,
        });
      }
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

  const audit = await ensureAudit({
    issueNumber,
    repo: cfg.repo,
    ts: readPlanApprovedTimestamp(persistedBody),
    mode: readPlanApprovedMode(persistedBody),
    env,
    ...auditDeps,
  });

  if (hasApproval && !hasPlanEntry) {
    return { status: 're-stamped-entry', ts, mode: readPlanApprovedMode(persistedBody), audit };
  }
  if (hasApproval && adaptiveConfigured && !approvalComplete) {
    return { status: 'repaired-approval', ts, mode: readPlanApprovedMode(persistedBody), audit };
  }
  return { status: 'approved', ts, mode: readPlanApprovedMode(persistedBody), audit };
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
    default:
      return null;
  }
}

function parseArgs(rest) {
  const out = { issueNumber: null };
  for (const a of rest) {
    const m = String(a).match(/^#?(\d+)$/);
    if (m && out.issueNumber === null) out.issueNumber = Number(m[1]);
  }
  return out;
}

export async function verbPlanApprove(rest, cfg, deps = {}) {
  const { issueNumber } = parseArgs(rest);
  if (!issueNumber) {
    process.stderr.write('Usage: /task plan-approve #N\n');
    process.exit(1);
  }
  if (process.env.TT_SKIP_NETWORK === '1') {
    process.stderr.write('plan-approve: TT_SKIP_NETWORK set — refusing to run gate offline\n');
    process.exit(1);
  }
  const projectDir = getProjectDir();
  let result;
  try {
    result = await runPlanApprove({ issueNumber, cfg, projectDir, deps });
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
