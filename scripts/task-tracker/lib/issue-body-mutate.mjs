// Canonical high-level helper for issue-body writes (#293).
//
// `mutateIssueBody` is a thin pass-through to `versionedWriteBody` whose
// signature DELIBERATELY OMITS a `body:` parameter. The omission is the
// point: it forces callers to express their write as a `mutate(base) →
// newBody` closure that derives its result from the freshly-fetched remote
// base, rather than a pre-computed snapshot that may have grown stale while
// the caller did other work.
//
// This closes the structural gap that broke #292: a `pushIssueBody({ body:
// <captured-snapshot> })` invocation reduces internally to `versionedWriteBody({
// mutate: () => body })` — an arrow function that ignores its `base` argument
// and clobbers every marker the live body acquired since the snapshot was
// captured. There is no equivalent escape hatch here.
//
// Counterpart enforcement lives at the `versionedWriteBody` layer
// (`checkStaleInput` in `versioned-issue-write.mjs`): if a caller's mutate
// returns a body still carrying an `aitm-body-version: N` marker AND
// `N < remoteVersion`, the write is refused with `reason: 'stale-input'`.
// That gate catches the snapshot pattern even when callers go around this
// wrapper directly.
//
// Returns the same shape as `versionedWriteBody`:
//   { status: 'ok' | 'no-op', attempts, version }
//
// Throws `BodyWriteRefusalError` on stale-input, overlapping-diff, or
// max-retries-exceeded.

import { versionedWriteBody } from './versioned-issue-write.mjs';

export async function mutateIssueBody({ issueNumber, repo, mutate, deps = {}, maxRetries } = {}) {
  if (issueNumber == null) throw new Error('mutateIssueBody: issueNumber is required');
  if (!repo) throw new Error('mutateIssueBody: repo is required');
  if (typeof mutate !== 'function') {
    throw new TypeError('mutateIssueBody: mutate must be a function (baseBody) => newBody');
  }
  return versionedWriteBody({ issueNumber, repo, mutate, deps, maxRetries });
}
