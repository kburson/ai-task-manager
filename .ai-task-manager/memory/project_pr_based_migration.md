---
name: migrating-to-pr-based-ci-validation-merge-to-trunk
description: Deliberate direction change (stated 2026-07-07) away from local-only trunk toward a remote CI/PR-based validate-and-merge process; supersedes local-only/no-PR and main-thread-only defaults.
metadata:
  node_type: memory
  type: project
  originSessionId: 8d64a736-5d25-4357-9eeb-d152f1663035
---

The user is migrating the repo's git process away from "commit locally to trunk and stop" toward a **remote CI / PR-based validation and merge-to-trunk** flow. Rationale (verbatim, 2026-07-07): "I am trying to migrate away from local trunk to a remote CI / PR based validation and merge to trunk... this is better for GitFlow and TBD processes."

**Why:** Local-only trunk commits give no CI gate and no review surface. A PR-based flow (feature branch → push origin → CI → PR review → merge to origin trunk → pull) works for both GitFlow and trunk-based development and is where the user wants the project to land. This is a standing direction, not a one-off exercise — the #734 drive is the first real rehearsal of it.

**How to apply:**

- Treat [[feedback_no_pr_to_origin]] (solo local-only, no push, no PRs) and [[feedback_main_thread_only]] as SUPERSEDED for the new flow. Do not blindly re-apply "never push / never open a PR." The user now WANTS push + PRs as the default path.
- The exercised sequence: create feature branch off trunk (isolated worktree) → drive the story through the aitm state chain → push branch to origin → open Draft PR (base trunk) → mark ready → wait for CI → merge PR to origin trunk → `git pull` trunk → THEN aitm `close` (the trunk-scoped `close` gate from #733 requires the `[#N]` commit reachable on local trunk, which only happens after merge+pull).
- Still confirm before each outward-facing step (push, PR open, PR merge) until the process is proven and the user says to stop confirming — this is a migration in progress, not yet settled muscle memory.
- The migration itself may warrant its own issue/docs; #735 covers docs + durable-memory reconciliation for topology-agnostic attribution and is a natural place to also capture process docs.

**Docs landed (2026-07-10, #735):** `docs/guides/workflow.md` now carries a `## Commit Attribution` section documenting the topology-agnostic, message-based `[#N]` model and the push → PR → merge → `git pull` → `/task close` ordering (the trunk-scoped close gate from #733 is why close comes last). `CLAUDE.md` carries a matching Commit Attribution note. This memory + [[feedback_no_pr_to_origin]] + [[feedback_main_thread_only]] are the durable-memory side of that reconciliation; the two superseded rules stay archived with SUPERSEDED pointers here. Reconciliation complete — the PR-based flow is the documented default.
