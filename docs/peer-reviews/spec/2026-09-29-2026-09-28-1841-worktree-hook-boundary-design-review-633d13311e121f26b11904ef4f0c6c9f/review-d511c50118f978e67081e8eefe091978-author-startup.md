<!-- ai-peer-review-template version="1" digest="sha256:407c0183bbb626968282060157995fdb989c70593266bae91803b66facb669e2" -->

# Author startup

Review: `review-d511c50118f978e67081e8eefe091978`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md`
- Workspace: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/.scratch/peer-review/review-d511c50118f978e67081e8eefe091978`
- Response: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/peer-reviews/spec/2026-09-29-2026-09-28-1841-worktree-hook-boundary-design-review-633d13311e121f26b11904ef4f0c6c9f/review-d511c50118f978e67081e8eefe091978-reviewer-response-1.md`
- Reviewer invitation: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/peer-reviews/spec/2026-09-29-2026-09-28-1841-worktree-hook-boundary-design-review-633d13311e121f26b11904ef4f0c6c9f/review-d511c50118f978e67081e8eefe091978-reviewer-invitation.md`
- Reviewer: `claude-opus-5-5` (`claude-opus-5-5`), effort: `high`
- Runtime: XPR, project-local broker

## Communication policy (v1)

Keep all peer-review chat messages terse. Put complete review analysis, findings, dispositions, revised prose, rationale, decisions, and verification evidence in the generated durable review documents.

Chat may contain only:

- a short operational status;
- a pointer to the relevant durable document;
- the exact next action; or
- a concise blocker requiring human action.

Read the relevant durable reviewer or author response document; do not rely on a chat summary. Do not paste findings, dispositions, revised prose, verification output, or other durable document content into chat unless the human explicitly requests it.

“Terse chat” does not mean terse review evidence. Durable reviewer and author response documents remain complete, self-contained, and authoritative.

## Project-local broker and recovery

Phased sessions remain event-authoritative. After a non-final acceptance, finalize the current artifact and follow the single `peer-review advance <workspace> <artifact>` action emitted by `status --next`; never infer or skip a phase from chat.

When the project-local broker is active, yield after each handoff; do not poll or repeat wait calls. Inspect `peer-review broker status --json` for authenticated instance state. After a failure, preserve receipts and run `peer-review broker reconcile /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/.scratch/peer-review/review-d511c50118f978e67081e8eefe091978 --json` only when the exact recovery evidence calls for it. A broker failure never silently changes the selected reviewer or transport. If the broker is unavailable for an existing manual review, use the bounded `peer-review status /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/.scratch/peer-review/review-d511c50118f978e67081e8eefe091978 --next` recovery path.

Installed help: `peer-review status --help`

Zero-install help: `npx --yes @kburson/ai-peer-review@0.3.0 status --help`
