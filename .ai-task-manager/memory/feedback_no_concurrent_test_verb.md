---
name: feedback_no_concurrent_test_verb
description: 'Never run the `/task test` sandbox verb concurrently — the per-issue mutator lock can falsely reclaim a live long-running holder (defect #656), so two promote runs collide; duplicate board moves/timing rows, not worktree deletion.'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 329e0bc7-06bd-462e-813c-912115881d14
---

Never launch a second `promote <N>` (develop→test) while one is already running for the same issue. The per-issue mutator lock (`withIssueLock`) is supposed to serialize them but currently does **not** reliably do so — see defect **#656**: `tryReclaimStale` decides staleness from mtime age vs `ISSUE_LOCK_STALE_MS = 30s` with no heartbeat, so a multi-minute Test sandbox holder ages past 30s and a peer falsely reclaims its live lock and runs concurrently.

**Why:** Two concurrent runs no longer corrupt each other's _worktree_ — since **#563** the sandbox path carries a per-run token (`.tmp/.task-test-<N>-<sha8>-<pid>-<rand>`, `verbs/test.mjs:86-88`), so each run gets its own isolated worktree. The residual damage from a concurrent run is at the _issue_ level: duplicate Test re-entry (visit 2), duplicate timing rows, and redundant board moves — the lock failing its one job (mutual exclusion). The old `MODULE_NOT_FOUND` / `ENOENT` worktree-deletion signature described here previously is now obsolete (pre-#563).

**How to apply:** Drive develop→test with a single `npx aitm promote <N>` and read its result; never fire a second while one is active (check the task list for a live `promote` of the same issue first — operator-level defense-in-depth until #656 lands the PID-liveness fix). The full test:all sandbox takes minutes. If a race already happened, the board stays on `develop`/lands once on `test` (gate-first), so there's usually no state to repair — annotate any duplicate timing/re-entry artifacts. Relates to [[feedback_full_auto_review_audit]].
