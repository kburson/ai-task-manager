---
name: reference-move-state-shim-body-store
description: "slow-lane fake-gh shims for move-state must be a real body store + emulate both gh body-fetch shapes, or they hit JSON.parse/BodyWriteRefusal"
metadata: 
  node_type: memory
  type: reference
  originSessionId: ce4f7882-22ff-4b20-8190-21bbc8cd85b5
---

Any slow-lane test that fakes `gh` to exercise a **move-state** path (e.g. `slow/move-state-gate.test.mjs`, `slow/move-state-approval-gate.test.mjs`) must make its shim a **real body store**, not a constant echo. move-state stamps entry markers via `versionedWriteBody`, which:

1. **fetches `gh issue view N --json body`** (no jq) in `stampEntryMarkers` (github-mutation.mjs) and does `JSON.parse(stdout).body` — a shim that returns raw markdown throws `Unexpected token '#', "## Accepta"...` → `phase-pair emission failed` + `marker stamp failed`.
2. **pushes** the stamped body over `gh issue edit N --body-file -` then **read-back-verifies byte-equality** — a constant-echo shim never matches the stamped push → `BodyWriteRefusalError: refusing after 3 attempts`.

Correct shim shape:
- persist each `issue edit --body-file -` (or `-p`) payload to a sandbox file; serve it back on later `issue view`.
- discriminate gh's two body-fetch shapes: a jq filter (`--jq` OR `-q`) makes gh emit the **raw** body string; `--json body` with **no** jq filter emits `{"body": ...}`. `ghFetchBody` uses `--json body -q .body` (raw); `stampEntryMarkers` uses `--json body` (JSON); body-gates uses `--jq .body` (raw).

These two failures were **pre-existing** (product code byte-identical to trunk) but masked for a long time because a close-repair hang SIGTERM'd `test:all` before the slow lane ran. Fixed in 2ca67dd under [#754]/[#756]. Related: [[project_marker_after_verified_move]], [[feedback_worktree_seed_templates]].
