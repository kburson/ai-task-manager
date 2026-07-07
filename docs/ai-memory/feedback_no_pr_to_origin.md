---
name: Solo project — local-only commits to trunk, no push, no PRs
description: This is a single-developer repo; workflow is purely local — commit/merge to trunk and stop there. Do not push to origin. Do not open PRs.
type: feedback
originSessionId: a2956386-6efd-462f-8527-e3f5a578f958
---
This is a solo project — no other developers. Workflow is purely local:
1. Work on trunk directly (when "main thread only" is in effect — see feedback_main_thread_only.md), or merge feature branches into trunk via `--ff-only`.
2. **Stop at trunk.** Do not `git push`. Do not `gh pr create`. Origin is a manual backup the user controls; the assistant must not touch it.

**Why:** The user explicitly said on 2026-05-10: "there should be no force push as there should be no push. We only work locally. commit/merge to trunk. that is far as you go." Earlier guidance to push trunk to origin was wrong — the user manages origin themselves. Pushing (especially force-push) without explicit per-task authorization risks rewriting their published history.

**How to apply:**
- Never run `git push` (any flavor — including `--force-with-lease`) without explicit per-task authorization in the current conversation.
- Never run `gh pr create`.
- After committing to trunk, the work is done from your perspective. Report status; do not sync to origin.
- If origin is ahead/behind, surface the divergence to the user — let them decide whether to push.
- If a PR exists on origin (anomaly), tell the user; do not close or merge it yourself.
