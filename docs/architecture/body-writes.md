# Issue-Body Writes

All writes to a GitHub issue body in this repo MUST go through
`versionedWriteBody` (`scripts/task-tracker/lib/versioned-issue-write.mjs`),
either directly or — preferred — via the high-level
`mutateIssueBody({ issueNumber, repo, mutate })` wrapper
(`scripts/task-tracker/lib/issue-body-mutate.mjs`).

This document describes the contract, the failure modes, and why the API
shape is what it is.

## The marker

Every aitm-authored body carries an HTML comment marker:

```
<!-- aitm-body-version: N -->
```

`N` is monotonically incremented on every successful write. Absence of the
marker is treated as `N = 0` for backwards compatibility with legacy bodies.

The marker is the optimistic-concurrency token. `versionedWriteBody`:

1. Fetches the remote body.
2. Strips the marker.
3. Applies the caller's `mutate(base) → newBody` against the stripped base.
4. Stamps `N+1` onto the result.
5. Pushes via `gh issue edit --body-file`.
6. Re-fetches and byte-compares to verify the exact body landed
   (modulo trailing whitespace `gh` appends).

On a verification mismatch (concurrent writer raced in), the helper computes
both sides' edits relative to the previous base. If they touch disjoint line
ranges, it rebases ours onto the new remote and retries. If they overlap, it
refuses with `BodyWriteRefusalError reason='overlapping-diff'`. After
`maxRetries` (default 3) consecutive race-losses it refuses with
`reason='max-retries-exceeded'`.

## Why `mutate(base) → newBody` and not `body`

The API shape is the safety mechanism, not just an ergonomic choice. A
function that derives its result from a freshly-fetched `base` cannot leak
stale state: every retry sees the current remote. A pre-computed `body`
parameter can — and did — silently clobber every marker added between
snapshot capture and push (see #292 / #257 for the original drift incident).

`mutateIssueBody` deliberately omits any `body:` parameter. The omission is
the point.

## The stale-input gate (#293)

`pushIssueBody({body})` remains in the codebase but is soft-deprecated. It
reduces internally to `versionedWriteBody({ mutate: () => body })` — an
arrow function that ignores `base` and returns a captured snapshot. To catch
that pattern even when callers go around the wrapper:

`versionedWriteBody` inspects `mutate`'s output. If the returned body still
carries an `aitm-body-version: N` marker AND `N < remoteVersion`, the write
is refused with:

```
BodyWriteRefusalError {
  reason: 'stale-input',
  message: "...caller's mutate returned a body at aitm-body-version=N, ...
            but remote is at version=M. ...Use mutateIssueBody({ mutate }) ..."
}
```

A correctly-written `mutate` operates on the already-stripped `base` and
returns a stripped result, so the marker is absent and the gate is a no-op.
The gate only fires on the snapshot anti-pattern.

## Which API to use

| Situation                                                              | API                                             |
| ---------------------------------------------------------------------- | ----------------------------------------------- |
| New code, any single-shot body edit                                    | `mutateIssueBody({ mutate })`                   |
| Existing `pushIssueBody({body})` caller                                | Migrate to `mutateIssueBody` opportunistically. |
| Caller genuinely needs to commit a pre-computed body (rare)            | `pushIssueBody({body})` + `// keep: <reason>`   |
| Multi-step transaction across reads + writes with side effects between | `versionedWriteBody` directly                   |

`pushIssueBody` emits a one-time `console.warn` deprecation notice per
process the first time it's called.

## GitHub-native record boundary

`versionedWriteBody` remains the only issue-body write path, but a
directory-governed issue intentionally uses it rarely. The body owns stable story
intent and the singleton directory. Routine Develop, Test, Review, approval, and
integration state is written append-first to immutable GitHub record comments and
then projected into identified singleton comments.

Use the body writer only for a body-owned operation such as initial directory
publication, validated directory repair, stable story metadata, or legacy-body
compatibility. Record and singleton writes use the GitHub comment store with
node-ID correlation, content read-back, schema/hash validation, and idempotent
projection convergence. Do not route comment payloads through
`mutateIssueBody`, and do not treat a singleton edit as authoritative without its
accepted predecessor record.

Directory publication is last during adoption: create and validate every
self-identifying singleton first, then add their opaque node IDs to the body in
one versioned write. Recovery discovers those identities before creating a
replacement. See [GitHub-Native Coordination](../guides/github-native-coordination.md)
for the complete mutation and repair sequence.

## Errors

All three refusal modes throw `BodyWriteRefusalError` (exported from
`versioned-issue-write.mjs`) with a `reason` field:

- `stale-input` — caller's mutate returned an older versioned body
  (snapshot pattern). Pre-flight; no push happened.
- `overlapping-diff` — concurrent writer touched the same line range we
  did. Caller must re-read and re-mutate at a higher layer (this helper
  cannot decide intent).
- `max-retries-exceeded` — every attempt lost the race on a non-overlapping
  bump. Usually indicates a hot-spot issue under heavy concurrent writes;
  raise `maxRetries` or back off and retry.

Successful writes return `{ status: 'ok' | 'no-op', attempts, version }`.

## See also

- Epic #288 — body-versioning rollout.
- #292 — the original snapshot-clobber drift incident.
- #293 — stale-input gate + `mutateIssueBody` wrapper.
