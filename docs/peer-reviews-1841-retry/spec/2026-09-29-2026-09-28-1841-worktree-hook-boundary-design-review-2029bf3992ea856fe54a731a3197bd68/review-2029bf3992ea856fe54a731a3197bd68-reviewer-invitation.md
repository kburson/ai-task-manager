<!-- ai-peer-review-template version="1" digest="sha256:064952674640611160aff00e947b64de060d4a4cfe7139019eb0f24ee264aa25" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy9iM2YyL2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3NwZWNzLzIwMjYtMDktMjgtMTg0MS13b3JrdHJlZS1ob29rLWJvdW5kYXJ5LWRlc2lnbi5tZCIsCiAgInJlc3BvbnNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzL2IzZjIvYWktdGFzay1tYW5hZ2VyL2RvY3MvcGVlci1yZXZpZXdzLTE4NDEtcmV0cnkvc3BlYy8yMDI2LTA5LTI5LTIwMjYtMDktMjgtMTg0MS13b3JrdHJlZS1ob29rLWJvdW5kYXJ5LWRlc2lnbi1yZXZpZXctMjAyOWJmMzk5MmVhODU2ZmU1NGE3MzFhMzE5N2JkNjgvcmV2aWV3LTIwMjliZjM5OTJlYTg1NmZlNTRhNzMxYTMxOTdiZDY4LXJldmlld2VyLXJlc3BvbnNlLTEubWQiLAogICJyZXZpZXdfaWQiOiAicmV2aWV3LTIwMjliZjM5OTJlYTg1NmZlNTRhNzMxYTMxOTdiZDY4IiwKICAic2NoZW1hIjogImFpLXBlZXItcmV2aWV3Lmludml0YXRpb24tcm91dGluZy92MSIsCiAgIndvcmtzcGFjZSI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy9iM2YyL2FpLXRhc2stbWFuYWdlci8uc2NyYXRjaC9wZWVyLXJldmlldy9yZXZpZXctMjAyOWJmMzk5MmVhODU2ZmU1NGE3MzFhMzE5N2JkNjgiCn0K" -->

# Reviewer invitation

Review: `review-2029bf3992ea856fe54a731a3197bd68`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md`
- Workspace: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/.scratch/peer-review/review-2029bf3992ea856fe54a731a3197bd68`
- Response: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/peer-reviews-1841-retry/spec/2026-09-29-2026-09-28-1841-worktree-hook-boundary-design-review-2029bf3992ea856fe54a731a3197bd68/review-2029bf3992ea856fe54a731a3197bd68-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/peer-reviews-1841-retry/spec/2026-09-29-2026-09-28-1841-worktree-hook-boundary-design-review-2029bf3992ea856fe54a731a3197bd68/review-2029bf3992ea856fe54a731a3197bd68-reviewer-invitation.md`
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

Phased sessions remain event-authoritative. After a non-final acceptance, the registered author finalizes and advances the exact next artifact; resume only from the generated reviewer response and never infer or skip a phase from chat.

When the project-local broker is active, yield after each handoff; do not poll or repeat wait calls. Inspect `peer-review broker status --json` for authenticated instance state. After a failure, preserve receipts and run `peer-review broker reconcile /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/.scratch/peer-review/review-2029bf3992ea856fe54a731a3197bd68 --json` only when the exact recovery evidence calls for it. A broker failure never silently changes the selected reviewer or transport. If the broker is unavailable for an existing manual review, use the bounded `peer-review status /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/.scratch/peer-review/review-2029bf3992ea856fe54a731a3197bd68 --next` recovery path.

Role: reviewer. Join from a distinct session in the same physical worktree.

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/peer-reviews-1841-retry/spec/2026-09-29-2026-09-28-1841-worktree-hook-boundary-design-review-2029bf3992ea856fe54a731a3197bd68/review-2029bf3992ea856fe54a731a3197bd68-reviewer-invitation.md`

Installed-package join: `npx --no-install ai-peer-review join /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/peer-reviews-1841-retry/spec/2026-09-29-2026-09-28-1841-worktree-hook-boundary-design-review-2029bf3992ea856fe54a731a3197bd68/review-2029bf3992ea856fe54a731a3197bd68-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/.scratch/peer-review/review-2029bf3992ea856fe54a731a3197bd68`
