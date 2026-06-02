// Single-use issue-body push helper (#258).
//
// The clobber fixed here: a body scratch file frozen at one point in time, then
// re-pushed after a state mutator has written authoritative markers into the
// LIVE body, reverts those markers (the #257 drift). The structural fix is to
// treat every scratch as single-use: write a fresh scratch, push it, and delete
// it ONLY on a successful push. On failure the scratch is preserved so the edit
// can be inspected or retried — never silently deleted in a `finally`.
//
// This replaces the `writeFileSync(tmp); try { push } finally { unlinkSync }`
// pattern duplicated across ~16 call sites with one audited implementation.
//
// All I/O is injectable for offline unit tests.

import { writeFileSync as fsWriteFileSync, unlinkSync as fsUnlinkSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

const defaultPexec = promisify(execFile);

// Push `body` to issue #`issueNumber` via `gh issue edit --body-file`, staging
// through `scratchPath`. The scratch is deleted only after the push resolves;
// if the push rejects, the scratch is left in place and the error is rethrown.
//
// deps: { writeFileSync, unlinkSync, pexec } — all optional, injected for tests.
export async function pushIssueBody({
  issueNumber,
  repo,
  body,
  scratchPath,
  timeout = GH_API_TIMEOUT_MS,
  deps = {},
} = {}) {
  if (issueNumber == null) throw new Error('pushIssueBody: issueNumber is required');
  if (!repo) throw new Error('pushIssueBody: repo is required');
  if (!scratchPath) throw new Error('pushIssueBody: scratchPath is required');

  const writeFileSync = deps.writeFileSync || fsWriteFileSync;
  const unlinkSync = deps.unlinkSync || fsUnlinkSync;
  const pexec = deps.pexec || defaultPexec;

  writeFileSync(scratchPath, body, 'utf8');

  // No try/finally: on a rejected push we must NOT delete the scratch.
  await pexec(
    'gh',
    ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', scratchPath],
    { timeout }
  );

  // Push succeeded — the scratch is now stale by definition; delete it. A
  // failed delete (e.g. already gone) is non-fatal.
  try {
    unlinkSync(scratchPath);
  } catch {}

  return { status: 'ok', scratchPath };
}
