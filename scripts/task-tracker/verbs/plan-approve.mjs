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
import { tmpdir } from 'node:os';

import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { getProjectDir } from '../paths.mjs';
import {
  hasPlanApprovedMarker,
  insertPlanApprovedMarker,
  wrapDeepDiveInDetails,
} from '../lib/markers.mjs';
import { stampEntryMarker } from '../lib/stage-entry-markers.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { lintChecklistCommands } from '../lib/checklist-command-lint.mjs';
import { pushIssueBody } from '../lib/issue-body-push.mjs';

// Visit-suffix-aware check for any aitm-entered-plan marker (bare or -N).
// We only backfill the original visit when NO plan entry marker exists at
// all — if `aitm-entered-plan-2` is present (legitimate re-entry), we do
// not synthesize a phantom visit-1 marker.
const PLAN_ENTRY_RE = /<!--\s*aitm-entered-plan(?:-\d+)?:/i;

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

async function defaultWriteIssueBody({ issueNumber, repo, body }) {
  const tmp = path.join(tmpdir(), `aitm-plan-approve-${process.pid}-${Date.now()}.md`);
  await pushIssueBody({
    issueNumber,
    repo,
    body,
    scratchPath: tmp,
    timeout: GH_API_TIMEOUT_MS,
    deps: { pexec },
  });
}

async function defaultGetBoardState({ issueNumber, projectDir: _projectDir }) {
  const mod = await import('../task-tracker.mjs');
  return mod.getIssueBoardState(String(issueNumber).replace(/^#/, ''));
}

export async function runPlanApprove({ issueNumber, cfg, projectDir, deps = {} } = {}) {
  if (!issueNumber) throw new Error('plan-approve: issueNumber is required');
  if (!cfg) throw new Error('plan-approve: cfg is required');

  const fetchIssueBody = deps.fetchIssueBody || defaultFetchIssueBody;
  const writeIssueBody = deps.writeIssueBody || defaultWriteIssueBody;
  const getBoardState = deps.getBoardState || defaultGetBoardState;
  const nowIso = deps.nowIso || (() => new Date().toISOString().replace(/\.\d+Z$/, 'Z'));

  const state = await getBoardState({ issueNumber, projectDir });
  if (state !== 'plan') {
    return {
      status: 'wrong-state',
      message: `#${issueNumber} is in '${state ?? 'unknown'}', expected 'plan' — plan-approve only applies to issues in Plan.`,
    };
  }

  const body = await fetchIssueBody({ issueNumber, repo: cfg.repo });

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

  // Both markers present — true no-op.
  if (hasApproval && hasPlanEntry) {
    return { status: 'already-approved' };
  }

  const ts = nowIso();
  let next = body;

  // Defense-in-depth re-stamp: if approval was recorded but the entry
  // marker is missing (typically wiped by an external `gh issue edit
  // --body-file` overwrite outside writeIssueBodyWithRetry), restore the
  // chain anchor so the close-time chain-hole detector doesn't refuse.
  if (!hasPlanEntry) {
    next = stampEntryMarker(next, 'plan', ts);
  }

  if (!hasApproval) {
    next = insertPlanApprovedMarker(next, ts);
  }

  const updated = wrapDeepDiveInDetails(next);
  await writeIssueBody({ issueNumber, repo: cfg.repo, body: updated });

  if (hasApproval && !hasPlanEntry) {
    return { status: 're-stamped-entry', ts };
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

export async function verbPlanApprove(rest, cfg) {
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
    result = await runPlanApprove({ issueNumber, cfg, projectDir });
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
