# Test Auto-Tick Branch Provenance Design

**Story:** #1344
**Status:** Approved by Full-Auto authority
**Blocks:** #1343, transitively #1263
**Delivered:** PR #1345, trunk `082286e709065f402b7704f00a309d1c60515fc0`

## Problem

The Test verb verifies an exact commit in an isolated worktree and then uses `autoTickVerified` to attach green run properties to command-backed checkboxes. `autoTickVerified` always writes `sha="sandbox"`.

That sentinel is valid for legacy proof with no branch provenance. It becomes invalid when the line was previously stamped by `ac-stamp`: `upsertProofMarker` preserves `worktree`, `branch`, and `bound-issue`, but replaces the real commit SHA with `sandbox`. The read-side branch-reachability guard sees provenance-bearing evidence and correctly refuses it as incomplete because `sandbox` is not a commit.

## Goals

- Preserve complete branch provenance through Test auto-ticking.
- Bind Test-authored proof to the exact commit already verified in the sandbox.
- Keep legacy sentinel behavior for callers without an explicit tested commit.
- Preserve branch-reachability enforcement unchanged.
- Recover #1343 through normal retry, without marker surgery.

## Non-Goals

- No weakening of ancestry checks.
- No stripping of branch/worktree/bound-issue attributes.
- No change to sandbox isolation, SHA-drift detection, or verification receipts.
- No change to Review-stage proof semantics.

## Considered Designs

### Teach branch reachability that `sandbox` means the current commit

Rejected. The sentinel deliberately does not identify a Git object and cannot be used for ancestry.

### Remove provenance when auto-ticking

Rejected. This discards useful authenticated context and turns a stronger proof into a legacy-compatible weaker one.

### Pass the exact tested SHA into auto-tick

Recommended. The Test verb already resolves the outer HEAD, checks out that exact SHA, and refuses if sandbox HEAD differs. Passing that value to the evidence writer records what actually ran and satisfies branch reachability.

## Detailed Design

Extend `autoTickVerified(body, results, now, options)` with an optional `sha`. When omitted, behavior remains `sha="sandbox"`. When present, it must match the existing commit-shaped 7–40 hexadecimal grammar; invalid values refuse rather than silently falling back.

Use the selected SHA for every run-property upsert: Verification Commands, Functional DoD, and Acceptance Criteria. The Test verb passes its already verified `sha` into both the first in-memory fold and the fresh-base mutation fold.

The writer does not infer a SHA from marker provenance and does not inspect Git. The caller that owns sandbox verification supplies the authority.

## Safety Invariants

- Existing direct callers without `sha` still produce the `sandbox` sentinel.
- A supplied malformed SHA fails before changing evidence.
- Test passes the same SHA used by sandbox path construction and drift comparison.
- Existing provenance attributes survive the upsert and now pair with a real reachable commit.
- The branch-reachability guard requires the same fields and ancestry as before.

## Live Recovery

After #1344 merges, rebind #1343 and rerun each AC stamp or the governed Test workflow against its existing verified receipt. Its proof markers must carry commit `4524510e` (or the then-current exact head), pass reachability, and complete Develop to Test without editing markers directly.
