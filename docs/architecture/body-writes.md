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

## The marker-loss invariant — `MarkerLossError` (#361)

Winning the concurrency race is not enough: a `mutate` can return a body that
lands cleanly and still silently destroy the hidden markers the workflow depends
on. `mutateIssueBody` therefore diffs the caller's output against the
freshly-fetched base with `findLostMarkers(base, next)`
(`scripts/task-tracker/lib/body-invariants.mjs`) and throws `MarkerLossError`
listing every marker that disappeared. The check runs **before** the push, so a
refusal means nothing was written.

`INVARIANT_MARKER_PATTERNS` in that module is the authoritative list. Each entry
declares a `kind` that decides how loss is measured:

| `kind`   | Invariant                                                              | Members                                                                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `single` | Matched `base` and no longer matches `next`                            | `aitm-fields`, `aitm-body-version`, `aitm-stage-rollup`, `aitm-refine-complete`, `aitm-plan-approved`, `aitm-epic-ac-reconciled`, `aitm-unauthorized-close`, `aitm-deep-dive-posted`, `aitm-deep-dive-complete`, `aitm-last-known-state`, `aitm-last-known-state-ts` |
| `multi`  | Every parameter value present in `base` must survive, reported by name | `aitm-entered-<stage>` — one occurrence per stage visited                                                                                                                                                                                                            |
| `count`  | Occurrence count must never decrease (append-only)                     | `aitm-session-ref` (#476), `aitm-ac-struck` (#888)                                                                                                                                                                                                                   |

Several patterns are deliberately widened to match both the legacy colon grammar
(`<!-- aitm-refine-complete: ... -->`) and the newer property grammar
(`<!-- aitm-refine-complete ts="..." -->`), so a writer that migrates a marker to
the new spelling is not falsely reported as having dropped it.

Adding a new invariant marker means appending a `{name, re, kind}` entry, adding
a custom `findLostMarkers` branch if it is parameterized like the
`aitm-entered-<stage>` family, and mirroring the entry into
`gh-edit-guard.MARKER_PATTERNS` (see below).

### The `allowMarkerLoss` escape hatch

`mutateIssueBody({ ..., allowMarkerLoss: true })` skips the invariant. It is
legitimate only when the removal is the intended outcome — correcting a typo'd
marker, or an intentional reset. The flag is explicit and grep-able precisely so
the rare use is auditable. It is not a way past a refusal you do not understand:
if you cannot name the marker you mean to remove and why, the refusal is correct.

`allowMarkerLoss` additionally relaxes the unbounded-deletion guardrail for
writes that erase whole sections carrying no tracked marker.

Adjacent but distinct: `mutateIssueBody` also enforces the #362 checkbox-proof
invariant, throwing `CheckboxProofMissingError` when a newly-ticked checkbox
carries no same-line evidence marker. Its hatch is `allowUnverifiedTicks: true`.
The two hatches are separate and must not be conflated.

## The Bash-level refusal — `gh-edit-guard` (#361)

The invariant above only protects callers who go through the helper. A hand-rolled
`gh` command from agent Bash bypasses it entirely, so a second layer refuses that
transport outright.

`evaluateGhEdit({command})` in
[`scripts/task-tracker/lib/gh-edit-guard.mjs`](../../scripts/task-tracker/lib/gh-edit-guard.mjs),
wired into the PreToolUse hook through
[`scripts/task-tracker/bash-guard.mjs`](../../scripts/task-tracker/bash-guard.mjs),
parses the command. When the body source is `file` or `inline` — that is,
`gh issue edit <N> --body-file <path>` or `gh issue edit <N> --body "<text>"` —
it returns `{block: true}` **unconditionally**, regardless of what the diff would
have done.

The reason it is a hard refusal and not a diff check: the diff guard catches most
clobbers, but a wholesale body rewrite that happens to preserve every guarded
marker still slips through — a stale-but-marker-complete snapshot, an
`[object Object]` serialization, a script that hand-rolls the body. Every
legitimate body write in this repo goes through `mutateIssueBody`, which fetches
the live body inside the same transaction and runs the marker-loss invariant, so
a direct `gh issue edit --body*` from Bash is always the wrong contract.

What the guard does **not** block:

- Any `gh issue edit` carrying no body source. Label, title, milestone, and
  assignee edits parse to source `none` and pass.
- Issue _comments_. They are a different command and a different store; see the
  record boundary below.

Sibling guards in the same module mark the rest of the boundary.
`evaluateGhCreate` inspects `gh issue create` bodies for deprecated visible
checkbox lines — the retired `Plan approved by human` and `Deep dive complete`
lines, both now hidden markers managed by their verbs. The `gh api` interceptors
(#659) refuse the low-level equivalents that would otherwise slip past
`gh issue create`: the REST `repos/<owner>/<repo>/issues` POST and the GraphQL
`createIssue` mutation, either of which would produce an issue with no tether or
template enforcement.

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

Two classes of refusal exist, thrown from two different modules.

`versioned-issue-write.mjs` throws `BodyWriteRefusalError` with a `reason`
field. All three of its refusal modes are concurrency-contract failures:

- `stale-input` — caller's mutate returned an older versioned body
  (snapshot pattern). Pre-flight; no push happened.
- `overlapping-diff` — concurrent writer touched the same line range we
  did. Caller must re-read and re-mutate at a higher layer (this helper
  cannot decide intent).
- `max-retries-exceeded` — every attempt lost the race on a non-overlapping
  bump. Usually indicates a hot-spot issue under heavy concurrent writes;
  raise `maxRetries` or back off and retry.

`issue-body-mutate.mjs` throws its own content-invariant errors, which are
**not** `BodyWriteRefusalError` reasons — catch them by class:

- `MarkerLossError` — the mutate dropped one or more invariant markers. The
  message names each one. Hatch: `allowMarkerLoss: true`.
- `CheckboxProofMissingError` — a newly-ticked checkbox carries no same-line
  evidence marker (#362). Hatch: `allowUnverifiedTicks: true`.

Both are pre-flight; no push happened.

Successful writes return `{ status: 'ok' | 'no-op', attempts, version }`.

## See also

- Epic #288 — body-versioning rollout.
- #292 — the original snapshot-clobber drift incident.
- #293 — stale-input gate + `mutateIssueBody` wrapper.
- #361 — marker-loss invariant + Bash-level `gh issue edit --body*` refusal.
- #362 — checkbox proof-marker invariant.
