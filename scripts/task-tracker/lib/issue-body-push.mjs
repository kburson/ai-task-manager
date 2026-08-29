// Single-use issue-body push helper (#258).
//
// ⚠️ SOFT-DEPRECATED (#293). Prefer `mutateIssueBody({ mutate })` from
// `./issue-body-mutate.mjs`. The `body:` snapshot signature here is fragile:
// callers that compute the body once and pass it through will silently
// clobber any markers added to the live body between capture and push. The
// underlying `versionedWriteBody` now version-checks the input and refuses
// with `reason: 'stale-input'` when this pattern is detected, but the
// structural fix is to migrate to a `mutate(base) → newBody` closure.
// Remaining call sites should carry a `// keep: <reason>` justification or
// migrate as part of routine maintenance. See #293 for migration guidance.
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
import { pexec as defaultPexec } from '../../gh/lib/gh-client.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { versionedWriteBody } from './versioned-issue-write.mjs';

// Module-scoped flag — emit the deprecation warning at most once per process
// (per #293). Tests reset this via the `deps.resetDeprecationWarning` knob.
let _deprecationWarned = false;
export function _resetDeprecationWarningForTest() {
  _deprecationWarned = false;
}

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
  quiet = false,
  deps = {},
} = {}) {
  if (issueNumber == null) throw new Error('pushIssueBody: issueNumber is required');
  if (!repo) throw new Error('pushIssueBody: repo is required');
  if (!scratchPath) throw new Error('pushIssueBody: scratchPath is required');

  const writeFileSync = deps.writeFileSync || fsWriteFileSync;
  const unlinkSync = deps.unlinkSync || fsUnlinkSync;
  const pexec = deps.pexec || defaultPexec;
  const warn = deps.warn || ((msg) => console.warn(msg));

  // One-time deprecation notice per process (#293). The `quiet` opt-out
  // (#435) suppresses it for known-internal, deliberately-retained call sites
  // (e.g. reconcile's recovery-snapshot write) whose `// keep:` justification
  // documents why they stay on pushIssueBody — so routine operator-facing
  // close/reconcile flows do not leak a maintainer-targeted warning. Any NEW
  // (accidental) caller omits `quiet` and still gets the nudge.
  if (!quiet && !_deprecationWarned) {
    _deprecationWarned = true;
    warn(
      '[pushIssueBody] DEPRECATED: the snapshot-body signature is fragile under ' +
        'in-flight markers. Use mutateIssueBody({ mutate }) from ' +
        'lib/issue-body-mutate.mjs. See #293 for migration guidance.'
    );
  }

  // Route through versionedWriteBody (epic #288): every body write stamps an
  // optimistic-concurrency `aitm-body-version` marker, and a concurrent
  // non-overlapping bump is rebased rather than clobbered. Callers continue
  // to pass a full body — we model that as `mutate: () => body` (caller's
  // value is authoritative; remote base only matters for conflict detection).
  //
  // The scratch file is still written before the push for crash-recovery
  // inspection, then deleted on success — preserving the existing contract.
  const fetchBody = async () => {
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '-q', '.body'],
      { timeout }
    );
    return stdout;
  };

  const pushBody = async (_repo, _issue, finalBody) => {
    writeFileSync(scratchPath, finalBody, 'utf8');
    // No try/finally: on a rejected push we must NOT delete the scratch.
    await pexec(
      'gh',
      ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', scratchPath],
      { timeout }
    );
  };

  await versionedWriteBody({
    issueNumber,
    repo,
    mutate: () => body,
    deps: { fetchBody, pushBody },
  });

  // Push succeeded — the scratch is now stale by definition; delete it. A
  // failed delete (e.g. already gone) is non-fatal.
  try {
    unlinkSync(scratchPath);
  } catch {
    /* best-effort: cleanup; failure is non-fatal */
  }

  return { status: 'ok', scratchPath };
}
