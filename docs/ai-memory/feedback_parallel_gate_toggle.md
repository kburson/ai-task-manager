---
name: Ask which gates to toggle before parallel sub-agent dispatch
description: Before launching parallel sub-agents on multiple sub-issues, ask the user which human gates to disable; prefer session-scoped `/task auto` over project-config edits.
type: feedback
originSessionId: 4f9af50f-35a1-481b-9eb2-b94cc9f79671
---

Before dispatching a parallel sub-agent batch (one agent per sub-issue), pause and ask the user which human gates to toggle off for the duration of the batch:

- `analyze → development` approve
- `review → done` approve
- Both, or neither

**Why:** In parallel-orchestration mode it is impractical to gather per-issue human feedback at every gate. But silently bypassing also violates the "Drive stories to Review without check-ins" intent — the human is still the approver, the orchestrator just batches the approvals. Surfacing the toggle choice once, up front, restores explicit human control without per-issue interruption.

**How to apply:** When the user asks for parallel sub-agents on a wave/batch, before any Agent tool call:

1. Name the sub-issues to be dispatched and their wave.
2. Ask explicitly which gates to disable for the batch.
3. Apply the choice via `/task auto <both|analyze|review|off>` (session-scoped, per #89). This is preferred over `/task config gateReviewToDone false` because it auto-cleans up at session end / orphan-GC and never leaks into project config or git.
4. For analyze→dev under auto-mode, the resolved gate flows through `runApprove` automatically — no need to pass `--answer yes` to bypass.
5. Record the toggle decision in the orchestrator's status update so the user can audit later.
6. Run `/task auto reset` after the batch lands (or just end the session — the override file is gitignored and GC'd).

Single-agent / sequential-on-main work does NOT trigger this — human gates stay on by default there.

See `docs/guides/workflow.md` → "Session-scoped auto-mode" for the full precedence + prompt-trigger model.
