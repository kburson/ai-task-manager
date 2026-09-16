---
name: Main-thread-only directive overrides feature-branch convention
description: When the user says "main thread only" or "sequential", work directly on trunk — no feature branches, no worktrees
type: feedback
originSessionId: a2956386-6efd-462f-8527-e3f5a578f958
---

**SUPERSEDED as the default (2026-07-07):** The project is moving to a PR-based feature-branch flow — see [[project_pr_based_migration]]. Feature branches + worktrees + push + PRs are now the intended path. Honor "main thread only" ONLY if the user explicitly says it for a given task; otherwise default to the PR-based flow.

When the user issues a "main thread only" / "sequential, one story at a time" directive, work directly on `trunk`. No feature branches. No worktrees. Commit straight to trunk and push to origin/trunk.

**Why:** The user explicitly said worktrees were "corrupting the work" during the Epic #41 replay. Feature branches plus worktrees fragmented state across multiple paths and made the timing-log binding fail silently. The "main thread only" directive is an explicit override of the normal solo-project flow (feature branch → ff-merge → push trunk).

**How to apply:** When this directive is active, skip `git checkout -b`, skip `git worktree add`. Stage and commit on trunk. `git push origin trunk` after each issue's review handoff. The standard `feedback_no_pr_to_origin.md` rule (no PRs) still applies; this just removes the feature-branch step on top of it.
