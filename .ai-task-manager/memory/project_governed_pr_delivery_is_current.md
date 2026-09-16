---
name: project_governed_pr_delivery_is_current
description: 'Governed PR delivery (Review -> deliver -> receipt -> close) is the current, mandatory delivery model — supersedes the older PR-based-migration and local-trunk-merge notes.'
metadata:
  node_type: memory
  type: project
---

The terminal sequence for landing any issue is **Review → `/task deliver` → receipt → close**. Review accepts one immutable commit identity (the accepted SHA); `deliver` validates it, appends an intent, and emits exactly one `AITM_PROVIDER_ACTION_REQUIRED` envelope naming the expected head SHA and merge bytes — the host executes only that sanctioned action, then `deliver` reruns to independently verify and record the receipt. `close` never performs the PR mutation itself and always freshly re-verifies the receipt.

The earlier `gh-auto-merge` mechanism and manual "merge locally, `git update-ref` trunk, push FF" workarounds are **retired** — `deliver` refuses `gh pr merge --auto` translation. An operator who genuinely wants a no-PR batch must explicitly pass `operatorAuthorized: true` for the separate local-trunk lane; that lane is not provider delivery.

A root epic is a no-commit coordination kind during Develop/Test, but at Close its aggregate child history is commit-bearing delivery: `deliver` must produce a real merged-PR receipt for trunk, and `close` re-verifies both that receipt and the derived child trail on trunk. An `aitm-deliverable-posted` marker or Full-Auto approval alone is never sufficient for a root epic (see [[project_root_epic_no_commit_false_done]] for the #1624 incident this was hardened against).

**Why:** replaces [[project_pr_based_migration]] (2026-07-07 direction, now the baseline rather than a new direction) and the local-trunk-sync workarounds in the old Full-Auto merge-gap note — both predate the `deliver` verb and provider-action mechanism. **How to apply:** never hand-merge a branch to trunk or manually fast-forward local `trunk` to land work; always go through `/task deliver`. `close`'s attribution query targets `origin/trunk` (a remote-tracking ref), not local `trunk`, so a linked worktree never needs manual trunk sync. Full contract: `docs/guides/workflow.md` → "Governed delivery convergence".
