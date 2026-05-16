<!-- aitm-skill-version: 1.0.0 -->

# rules/commit-trail.md

Tier-2. Loaded JIT on the first commit in a session, or for troubleshooting. On first read, emit:

```
aitm-skill-loaded:rules/commit-trail:1.0.0
```

## Purpose

Every successful `git commit` made while an issue is bound (`/task #N`) is captured into a single rolling `### 🔗 Commits` comment on that issue. Closes the traceability gap between "issue is Done" and "which commits implemented it."

## Hook

PostToolUse on `Bash` runs `commit-trail-handler.mjs`. Installed automatically by `bin/cli.mjs install`.

## Behavior

- Fires only on **successful** `git commit` (bash tool exit 0).
- Skips `git commit --amend` (amend rewrites SHA; v1 drops these).
- No active bound issue → silent no-op.
- `gh` failure → one-line stderr warning, hook exits 0; never propagates to the bash tool result.
- Idempotent: hidden `<!-- aitm-commits: SHA1,SHA2,... -->` marker dedups re-fires.

## Comment shape

```
### 🔗 Commits

<!-- aitm-commits: abc1234...,def5678... -->

| SHA | Subject | Author | When |
|---|---|---|---|
| `abc1234` | feat(x): … | kendrick burson | 2026-05-10T14:32:11Z |
```

When a commit happens in a secondary worktree (git-dir ≠ git-common-dir), `Branch` and `Worktree` columns are added. If the existing comment is already 4-col, the 4-col schema is preserved (no mixed column counts).

## Out of scope (v1)

- Boundary-snapshot path at `develop → test` (depends on `/task promote`).
- Squash/rebase reconciliation.
- Amend handling.
