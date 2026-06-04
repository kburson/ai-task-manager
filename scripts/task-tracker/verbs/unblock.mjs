// `unblock` verb — clear blocker refs on the active (or specified) issue.
//
// CLI: /task unblock [#N] [--by <M>[,<P>...]]
//   - With --by: drops only the listed refs.
//   - Without --by: drops ALL refs.
//
// Removes refs from the `<!-- aitm-blocked-by: ... -->` marker via
// `removeBlockedBy`, and when the list becomes empty also drops the `BLOCKED`
// label via `blockedLabelRemoveArgs`. Posts an audit comment per cleared ref.
// Idempotent: no-op when no marker is present or the requested refs are
// already absent.
//
// Pure core: `runUnblock({ args, cfg, deps })`. All I/O is injectable.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { loadState } from '../state.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { pushIssueBody } from '../lib/issue-body-push.mjs';
import { removeBlockedBy, parseBlockedBy, blockedLabelRemoveArgs } from '../lib/blocked-marker.mjs';
import { parseByList, resolveTargetIssue } from './block.mjs';

const pexec = promisify(execFile);

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
  const target = resolveTargetIssue({ rest: positional, activeIssue });
  const refs = by === null ? null : parseByList(by);
  return { target, refs, byProvided: by !== null };
}

async function defaultFetchBody({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return stdout;
}

async function defaultRunLabel({ args, repo }) {
  await pexec('gh', [...args, '-R', repo], { timeout: GH_API_TIMEOUT_MS });
}

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

function defaultEditBody({ cfg }) {
  return async ({ issueNumber, body }) => {
    const tmp = path.join(tmpdir(), `aitm-unblock-${issueNumber}-${process.pid}.md`);
    await pushIssueBody({
      issueNumber,
      repo: cfg.repo,
      body,
      scratchPath: tmp,
      timeout: GH_API_TIMEOUT_MS,
      deps: { pexec },
    });
  };
}

/**
 * Core unblock runner. `refs === null` means "drop ALL current refs".
 *
 * @returns {Promise<{status:'removed'|'idempotent', target:number, removed:number[], cleared:boolean}>}
 */
export async function runUnblock({ target, refs, cfg, deps = {} } = {}) {
  if (!Number.isInteger(target) || target <= 0) {
    throw new Error('unblock: no target issue (bind via /task #N or pass a positional)');
  }
  if (!cfg || !cfg.repo) {
    throw new Error('unblock: cfg.repo is required');
  }

  const fetchBody = deps.fetchBody || defaultFetchBody;
  const editBody = deps.editBody || defaultEditBody({ cfg });
  const runLabel = deps.runLabel || defaultRunLabel;
  const postComment = deps.postComment || defaultPostComment;

  const body = await fetchBody({ issueNumber: target, repo: cfg.repo });
  const current = parseBlockedBy(body);
  const toDrop = refs === null ? current : refs.filter((m) => current.includes(m));

  if (toDrop.length === 0) {
    console.log(`[task-tracker] ✓ #${target} has no matching blockers to clear`);
    return { status: 'idempotent', target, removed: [], cleared: false };
  }

  const next = removeBlockedBy(body, toDrop);
  await editBody({ issueNumber: target, repo: cfg.repo, body: next });

  const remaining = parseBlockedBy(next);
  const cleared = remaining.length === 0;
  if (cleared) {
    await runLabel({ args: blockedLabelRemoveArgs(target), repo: cfg.repo });
  }

  // Audit comment(s) — one per cleared ref, or one summary line when all dropped.
  if (refs === null) {
    await postComment({
      issueNumber: target,
      repo: cfg.repo,
      body: `### 🔓 All blockers cleared`,
    });
  } else {
    for (const m of toDrop) {
      await postComment({
        issueNumber: target,
        repo: cfg.repo,
        body: `### 🔓 Blocked by #${m} cleared`,
      });
    }
  }

  console.log(
    `[task-tracker] ✓ #${target} unblocked (cleared ${toDrop.map((n) => `#${n}`).join(', ')}${cleared ? '; BLOCKED label dropped' : ''})`
  );
  return { status: 'removed', target, removed: toDrop, cleared };
}

export async function verbUnblock(ctx) {
  const { cfg, statePath, rest } = ctx;
  const s = loadState(statePath);
  const active = s.active || null;
  const { target, refs, byProvided } = parseArgs(rest, active);
  if (!target) {
    console.error('Usage: /task unblock [#N] [--by <M>[,<P>...]]');
    process.exit(2);
  }
  if (byProvided && (!refs || refs.length === 0)) {
    console.error('unblock: --by requires at least one positive integer issue number');
    process.exit(2);
  }
  try {
    await runUnblock({ target, refs: byProvided ? refs : null, cfg });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
