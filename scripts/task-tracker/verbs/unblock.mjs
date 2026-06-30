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

import { loadState } from '../state.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { removeBlockedBy, parseBlockedBy, blockedLabelRemoveArgs } from '../lib/blocked-marker.mjs';
import { writeBlockedByField } from '../lib/blocked-by-field.mjs';
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

async function defaultRunLabel({ args, repo }) {
  await pexec('gh', [...args, '-R', repo], { timeout: GH_API_TIMEOUT_MS });
}

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

// #295 — body writes go through `mutateIssueBody({ mutate })`.
async function defaultMutateIssueBody({ issueNumber, repo, mutate }) {
  return mutateIssueBody({ issueNumber, repo, mutate, deps: { pexec } });
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

  const mutateBody = deps.mutateIssueBody || defaultMutateIssueBody;
  const runLabel = deps.runLabel || defaultRunLabel;
  const postComment = deps.postComment || defaultPostComment;

  // #295 — closure runs on FRESH base each push attempt. `toDrop` is
  // recomputed from the live base inside; outer captures expose what
  // actually landed so audit + label logic stays consistent with the write.
  let toDrop = [];
  let remaining = [];
  const writeRes = await mutateBody({
    issueNumber: target,
    repo: cfg.repo,
    mutate: (base) => {
      const current = parseBlockedBy(base);
      toDrop = refs === null ? current : refs.filter((m) => current.includes(m));
      if (toDrop.length === 0) return base;
      const next = removeBlockedBy(base, toDrop);
      remaining = parseBlockedBy(next);
      return next;
    },
  });

  if (writeRes?.status === 'no-op' || toDrop.length === 0) {
    console.log(`[task-tracker] ✓ #${target} has no matching blockers to clear`);
    return { status: 'idempotent', target, removed: [], cleared: false };
  }

  const cleared = remaining.length === 0;
  if (cleared) {
    await runLabel({ args: blockedLabelRemoveArgs(target), repo: cfg.repo });
  }

  // Mirror the post-removal marker into the `Blocked By` Project field.
  // Writes empty string when fully cleared. Best-effort; never throws.
  const mirrorDeps = deps.writeFieldValue ? { writeFieldValue: deps.writeFieldValue } : {};
  try {
    await writeBlockedByField({
      issueNumber: target,
      refs: remaining,
      cfg,
      deps: mirrorDeps,
    });
  } catch (err) {
    console.error(`[task-tracker] warn: writeBlockedByField failed for #${target}: ${err.message}`);
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
    // ctx.deps is undefined on the real CLI path (runUnblock defaults to {});
    // tests inject a stubbed side-effect surface to drive the wrapper offline.
    await runUnblock({ target, refs: byProvided ? refs : null, cfg, deps: ctx.deps });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
