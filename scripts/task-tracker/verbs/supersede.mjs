// `supersede` verb (#401) — abandon a story whose work was taken over by
// another issue, and close it without verification.
//
// CLI: /task supersede <dead#> --by <superseding#>
//
// The motivating case: a story pivots mid-develop. Real commits land on trunk
// under a different issue, so the original story can never satisfy its own
// verification gates (deep-dive, review-approved, etc.) — yet it must not stay
// OPEN forever. `supersede` marks it inert, records what replaced it, drives it
// straight to Done via the `move-state.mjs --supersede` bypass (which skips the
// matrix + close gates while keeping every done-path side-effect, including
// unparkDependents), then closes the GitHub issue as `not planned` so the close
// reflects abandonment, not delivery.
//
// Steps (AC mapping):
//   1. Verify the superseding issue exists; refuse if not.            (AC6)
//   2. Write `aitm-superseded-by refs="#by" ts="..."` into the dead   (AC1/AC2)
//      story's body.
//   3. move-state <dead> done --supersede — direct jump to Done       (AC3)
//      from any non-done state; unparkDependents releases blocked work. (AC5)
//   4. Post an audit comment on the dead story naming the superseder  (AC4)
//      and stating the verification bypass.
//   5. gh issue close <dead> --reason "not planned".                  (AC7)
//   6. Post a back-reference comment on the superseder.
//
// Pure core: `runSupersede({ deadIssue, byIssue, cfg, deps })`. All I/O is
// injectable for offline tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { loadState } from '../state.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { addSupersededBy } from '../lib/superseded-marker.mjs';
import { writeTerminalDisposition } from '../lib/terminal-disposition.mjs';
import { runMoveStateHost } from '../../gh/move-state.mjs';
import { releaseTerminalIssueBinding } from '../lib/worktree-binding-lifecycle.mjs';

const pexec = promisify(execFile);

function parseIssueArg(tok) {
  const m = String(tok ?? '').match(/^#?(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function parseArgs(rest, activeIssue) {
  let by = null;
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok === '--by') {
      by = rest[++i] ?? '';
    } else {
      positional.push(tok);
    }
  }
  const deadFromPositional = positional.map(parseIssueArg).find((n) => n);
  const deadIssue = deadFromPositional ?? parseIssueArg(activeIssue);
  const byIssue = parseIssueArg(by);
  return { deadIssue, byIssue, byProvided: by !== null };
}

// AC6 — confirm the superseding issue exists. Resolves to true/false; never
// throws on a missing issue (gh exits non-zero → false).
async function defaultIssueExists({ issueNumber, repo }) {
  try {
    await pexec('gh', ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'number'], {
      timeout: GH_API_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

async function defaultMutateBody({ issueNumber, repo, mutate }) {
  return mutateIssueBody({ issueNumber, repo, mutate, deps: { pexec } });
}

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

async function defaultCloseNotPlanned({ issueNumber, repo }) {
  await pexec(
    'gh',
    ['issue', 'close', String(issueNumber), '-R', repo, '--reason', 'not planned'],
    { timeout: GH_API_TIMEOUT_MS }
  );
}

// #764 — drive the dead story to Done through the supersede bypass in-process
// (was: spawn `node scripts/gh/move-state.mjs … --supersede`). Mirrors demote's
// migrated helper: runMoveStateHost returns the same numeric exit code the child
// exit code used to give us, so runSupersede's exitCode branch is unchanged. The
// synthetic argv preserves the `--supersede` flag so the host's parse/matrix path
// is identical to the old CLI invocation. host is injectable for tests.
export function defaultRunMoveState({ issueNumber }, { host = runMoveStateHost } = {}) {
  return host({
    argv: [process.execPath, 'move-state.mjs', String(issueNumber), 'done', '--supersede'],
    env: { ...process.env, AITM_INTERNAL: '1', AITM_VERB_CONTEXT: 'supersede' },
  });
}

function nowIso(deps) {
  return deps.now ? deps.now() : new Date().toISOString();
}

export async function runSupersede({ deadIssue, byIssue, cfg, deps = {} } = {}) {
  if (!Number.isInteger(deadIssue) || deadIssue <= 0) {
    throw new Error('supersede: no dead issue (bind via /task #N or pass a positional)');
  }
  if (!Number.isInteger(byIssue) || byIssue <= 0) {
    throw new Error('supersede: --by <superseding#> is required and must be a positive integer');
  }
  if (deadIssue === byIssue) {
    throw new Error('supersede: a story cannot supersede itself');
  }
  if (!cfg || !cfg.repo) {
    throw new Error('supersede: cfg.repo is required');
  }

  const issueExists = deps.issueExists || defaultIssueExists;
  const mutateBody = deps.mutateIssueBody || defaultMutateBody;
  const postComment = deps.postComment || defaultPostComment;
  const closeNotPlanned = deps.closeNotPlanned || defaultCloseNotPlanned;
  const runMoveState = deps.runMoveState || defaultRunMoveState;
  const writeDisposition = deps.writeDisposition || writeTerminalDisposition;

  // AC6 — refuse before any write if the superseding issue does not exist.
  const exists = await issueExists({ issueNumber: byIssue, repo: cfg.repo });
  if (!exists) {
    return {
      status: 'superseder-missing',
      deadIssue,
      byIssue,
      message: `supersede: superseding issue #${byIssue} does not exist — refusing to mark #${deadIssue} inert`,
    };
  }

  const ts = nowIso(deps);

  // #1035 — resolve and write Replaced before any marker/Done/close mutation.
  // Missing field, item, or option is fail-closed and leaves the story active.
  await writeDisposition({
    cfg,
    issueNumber: deadIssue,
    disposition: 'Replaced',
  });

  // AC1/AC2 — stamp the marker on the dead story.
  await mutateBody({
    issueNumber: deadIssue,
    repo: cfg.repo,
    mutate: (base) => addSupersededBy(base, { ref: byIssue, ts }),
  });

  // AC3/AC5 — direct move to Done via the bypass; done-path unparkDependents
  // releases anything #deadIssue was blocking.
  const exitCode = await runMoveState({ issueNumber: deadIssue, cfg });
  if (exitCode !== 0) {
    return {
      status: 'transition-failed',
      deadIssue,
      byIssue,
      exitCode,
      message: `supersede: move-state.mjs ${deadIssue} done --supersede exited ${exitCode}`,
    };
  }

  // AC4 — audit comment on the dead story.
  await postComment({
    issueNumber: deadIssue,
    repo: cfg.repo,
    body:
      `### ⛔ Superseded by #${byIssue}\n\n` +
      `This story was abandoned: its work was taken over by #${byIssue}. ` +
      `It was moved directly to Done via the supersede bypass, which **skips the ` +
      `normal verification gates** (deep-dive, review-approved, close gates) ` +
      `because the work was never delivered under this issue. Closed as *not planned*.\n\n` +
      `Recorded at ${ts}.`,
  });

  // AC7 — close reflecting abandonment, not delivery.
  await closeNotPlanned({ issueNumber: deadIssue, repo: cfg.repo });

  // Back-reference comment on the superseder so the link is visible both ways.
  try {
    await postComment({
      issueNumber: byIssue,
      repo: cfg.repo,
      body: `### ↩ Superseded #${deadIssue}\n\nThis issue took over the work of #${deadIssue}, which has been marked inert and closed as *not planned*.`,
    });
  } catch (err) {
    console.error(
      `[task-tracker] warn: back-reference comment on #${byIssue} failed: ${err.message}`
    );
  }

  console.log(
    `[task-tracker] ✓ #${deadIssue} superseded by #${byIssue} — moved to Done and closed (not planned)`
  );
  return { status: 'superseded', deadIssue, byIssue, ts };
}

export function finalizeSupersededBinding({ result, projectDir, deps = {} }) {
  if (result?.status !== 'superseded') return result;
  (deps.releaseTerminalIssueBinding || releaseTerminalIssueBinding)({
    projectDir,
    issue: `#${result.deadIssue}`,
  });
  return result;
}

export async function verbSupersede(ctx, deps = {}) {
  const { cfg, statePath, rest, projectDir } = ctx;
  const s = loadState(statePath);
  const active = s.active || null;
  const { deadIssue, byIssue, byProvided } = parseArgs(rest, active);
  if (!deadIssue) {
    console.error('Usage: /task supersede <dead#> --by <superseding#>');
    process.exit(2);
  }
  if (!byProvided || !byIssue) {
    console.error('supersede: --by <superseding#> is required');
    process.exit(2);
  }
  try {
    // `deps` defaults to `{}` on the real CLI path, so live behaviour is
    // unchanged; tests forward mocked I/O seams to drive every CLI arm offline.
    const result = await runSupersede({ deadIssue, byIssue, cfg, deps });
    if (result.status !== 'superseded') {
      console.error(result.message || `supersede: ${result.status}`);
      process.exit(1);
    }
    finalizeSupersededBinding({ result, projectDir, deps });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
