// `plan-approve` verb — Plan -> Develop human gate.
//
// Records human plan approval on an issue by appending a hidden marker to
// the issue body. `move-state.mjs` reads the marker; without it (and with
// `gatePlanToDevelop=true`), promote from plan to develop refuses.
//
// Idempotent: re-invocation with the marker already present is a no-op.
// Refuses if the issue is not in `plan` state.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { getProjectDir } from '../paths.mjs';
import {
  hasPlanApprovedMarker,
  insertPlanApprovedMarker,
  readPlanApprovedForecastRecordId,
  upsertPlanApprovedMarker,
  wrapDeepDiveInDetails,
} from '../lib/markers.mjs';
import { stampEntryMarker } from '../lib/stage-entry-markers.mjs';
import { lintChecklistCommands } from '../lib/checklist-command-lint.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import {
  ensureFullAutoPlanApprovalAudit,
  readPlanApprovedTimestamp,
} from '../lib/plan-approval-audit.mjs';

// Visit-suffix-aware check for any aitm-entered-plan marker (bare or -N).
// We only backfill the original visit when NO plan entry marker exists at
// all — if `aitm-entered-plan-2` is present (legitimate re-entry), we do
// not synthesize a phantom visit-1 marker. Tolerant of BOTH the legacy
// `:`-delimited form and the new `ts="..."` property grammar (#374) so the
// idempotency check still fires after the writer flip.
const PLAN_ENTRY_RE = /<!--\s*aitm-entered-plan(?:-\d+)?(?::|\s+ts=")/i;
const FORECAST_READY_RE =
  /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/i;

const pexec = promisify(execFile);

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
  const auditDeps = {
    listComments: deps.listComments,
    postComment: deps.postComment,
  };

  const state = await getBoardState({ issueNumber, projectDir });
  if (state !== 'plan') {
    return {
      status: 'wrong-state',
      message: `#${issueNumber} is in '${state ?? 'unknown'}', expected 'plan' — plan-approve only applies to issues in Plan.`,
    };
  }

  const body = await fetchIssueBody({ issueNumber, repo: cfg.repo });
  const forecastRecordId = body.match(FORECAST_READY_RE)?.[1] ?? null;
  const adaptiveConfigured =
    Number.isInteger(cfg.estimationRubricIssue) && cfg.estimationRubricIssue > 0;
  if (adaptiveConfigured && forecastRecordId === null) {
    return {
      status: 'forecast-missing',
      message: `#${issueNumber} has no converged adaptive forecast to freeze at Plan approval.`,
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

  const hasApproval = hasPlanApprovedMarker(body);
  const hasPlanEntry = PLAN_ENTRY_RE.test(body);

  // Both markers present — true no-op. (Diagnostic fast-path; the closure
  // below would re-check the FRESH base anyway. The audit still runs here:
  // this is the repair path when the body write succeeded but the comment post
  // failed on a prior invocation.
  const frozenForecastRecordId = readPlanApprovedForecastRecordId(body);
  const approvalComplete =
    !adaptiveConfigured ||
    (frozenForecastRecordId !== null && frozenForecastRecordId === forecastRecordId);
  if (hasApproval && hasPlanEntry && approvalComplete) {
    await ensureAudit({
      issueNumber,
      repo: cfg.repo,
      ts: readPlanApprovedTimestamp(body),
      env,
      ...auditDeps,
    });
    return { status: 'already-approved' };
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
        n = upsertPlanApprovedMarker(n, ts, { forecastRecordId: freshForecastRecordId });
      } else if (!hasPlanApprovedMarker(n)) {
        n = insertPlanApprovedMarker(n, ts);
      }
      return wrapDeepDiveInDetails(n);
    },
  });
  const persistedBody =
    typeof writeResult?.body === 'string'
      ? writeResult.body
      : await fetchIssueBody({ issueNumber, repo: cfg.repo });

  await ensureAudit({
    issueNumber,
    repo: cfg.repo,
    ts: readPlanApprovedTimestamp(persistedBody),
    env,
    ...auditDeps,
  });

  if (hasApproval && !hasPlanEntry) {
    return { status: 're-stamped-entry', ts };
  }
  if (hasApproval && adaptiveConfigured && !approvalComplete) {
    return { status: 'repaired-approval', ts };
  }
  return { status: 'approved', ts };
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
    case 'approved':
      process.stdout.write(
        `✓ Plan approved for #${issueNumber} at ${result.ts}. \`/task promote #${issueNumber}\` to move to Develop.\n`
      );
      return;
    case 'already-approved':
      process.stdout.write(`#${issueNumber} already has a plan-approval marker — no change.\n`);
      return;
    case 're-stamped-entry':
      process.stdout.write(
        `✓ Re-stamped missing aitm-entered-plan marker for #${issueNumber} at ${result.ts} (approval already present). \`/task promote #${issueNumber}\` to move to Develop.\n`
      );
      return;
    case 'wrong-state':
      process.stderr.write(`⛔ ${result.message}\n`);
      process.exit(3);
    case 'forbidden-command':
      process.stderr.write(`⛔ ${result.message}\n`);
      process.exit(12);
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
