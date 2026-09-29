<!-- ai-peer-review-template version="1" digest="sha256:9901816a2120d7bb8c6b3f501e59f03217faec9e5dbafadd145408a1662398b9" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy9iM2YyL2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3NwZWNzLzIwMjYtMDktMjgtMTg0MS13b3JrdHJlZS1ob29rLWJvdW5kYXJ5LWRlc2lnbi5tZCIsCiAgInJlc3BvbnNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzL2IzZjIvYWktdGFzay1tYW5hZ2VyL2RvY3MvcGVlci1yZXZpZXdzL3NwZWMvMjAyNi0wOS0yOC0yMDI2LTA5LTI4LTE4NDEtd29ya3RyZWUtaG9vay1ib3VuZGFyeS1kZXNpZ24tcmV2aWV3LTM0NzY4NGRjYjczODRkMTg5MDM0ODdjODM1ZTAzYzExL3Jldmlldy0wZDdmZGRhZGQwZThiMDEzNThjMTY0NzA5NTU5MmE4Yi1yZXZpZXdlci1yZXNwb25zZS0xLm1kIiwKICAicmV2aWV3X2lkIjogInJldmlldy0wZDdmZGRhZGQwZThiMDEzNThjMTY0NzA5NTU5MmE4YiIsCiAgInNjaGVtYSI6ICJhaS1wZWVyLXJldmlldy5pbnZpdGF0aW9uLXJvdXRpbmcvdjEiLAogICJ3b3Jrc3BhY2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvYjNmMi9haS10YXNrLW1hbmFnZXIvLnNjcmF0Y2gvcGVlci1yZXZpZXcvcmV2aWV3LTBkN2ZkZGFkZDBlOGIwMTM1OGMxNjQ3MDk1NTkyYThiIgp9Cg" -->

# Reviewer invitation

Review: `review-0d7fddadd0e8b01358c1647095592a8b`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md`
- Workspace: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/.scratch/peer-review/review-0d7fddadd0e8b01358c1647095592a8b`
- Response: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/peer-reviews/spec/2026-09-28-2026-09-28-1841-worktree-hook-boundary-design-review-347684dcb7384d18903487c835e03c11/review-0d7fddadd0e8b01358c1647095592a8b-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/peer-reviews/spec/2026-09-28-2026-09-28-1841-worktree-hook-boundary-design-review-347684dcb7384d18903487c835e03c11/review-0d7fddadd0e8b01358c1647095592a8b-reviewer-invitation.md`
- Reviewer: `Claude Opus 5` (`claude-opus-5`), effort: `high`
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

Phased sessions remain event-authoritative. After a non-final acceptance, the registered author finalizes and advances the exact next artifact; resume only from the generated reviewer response and never infer or skip a phase from chat.

When the project-local broker is active, yield after each handoff; do not poll or repeat wait calls. Inspect `peer-review broker status --json` for authenticated instance state. After a failure, preserve receipts and run `peer-review broker reconcile /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/.scratch/peer-review/review-0d7fddadd0e8b01358c1647095592a8b --json` only when the exact recovery evidence calls for it. A broker failure never silently changes the selected reviewer or transport. If the broker is unavailable for an existing manual review, use the bounded `peer-review status /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/.scratch/peer-review/review-0d7fddadd0e8b01358c1647095592a8b --next` recovery path.

Role: reviewer. Join from a distinct session in the same physical worktree.

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/peer-reviews/spec/2026-09-28-2026-09-28-1841-worktree-hook-boundary-design-review-347684dcb7384d18903487c835e03c11/review-0d7fddadd0e8b01358c1647095592a8b-reviewer-invitation.md`

Zero-install join: `npx --yes @kburson/ai-peer-review@0.3.0 join /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/peer-reviews/spec/2026-09-28-2026-09-28-1841-worktree-hook-boundary-design-review-347684dcb7384d18903487c835e03c11/review-0d7fddadd0e8b01358c1647095592a8b-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/.scratch/peer-review/review-0d7fddadd0e8b01358c1647095592a8b`
