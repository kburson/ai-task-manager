<!-- ai-peer-review-template version="1" digest="sha256:064952674640611160aff00e947b64de060d4a4cfe7139019eb0f24ee264aa25" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy8xODU3LWFydGlmYWN0LXdyaXRlcy9haS10YXNrLW1hbmFnZXIvZG9jcy9zdXBlcnBvd2Vycy9wbGFucy8yMDI2LTEwLTAxLTE4NTctcmVtYWluaW5nLXdvcmstZGVjb21wb3NpdGlvbi5tZCIsCiAgInJlc3BvbnNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzLzE4NTctYXJ0aWZhY3Qtd3JpdGVzL2FpLXRhc2stbWFuYWdlci9kb2NzL3Jldmlld3MvMTg1Ny1yZW1haW5pbmctd29yay14cHItcmV0cnkvcGxhbi8yMDI2LTEwLTAyLTIwMjYtMTAtMDEtMTg1Ny1yZW1haW5pbmctd29yay1kZWNvbXBvc2l0aW9uLXJldmlldy0zYjUyZDc1OTU1M2E5ZThmZjYwZjcwNWZiODkxMTAyZC9yZXZpZXctM2I1MmQ3NTk1NTNhOWU4ZmY2MGY3MDVmYjg5MTEwMmQtcmV2aWV3ZXItcmVzcG9uc2UtMS5tZCIsCiAgInJldmlld19pZCI6ICJyZXZpZXctM2I1MmQ3NTk1NTNhOWU4ZmY2MGY3MDVmYjg5MTEwMmQiLAogICJzY2hlbWEiOiAiYWktcGVlci1yZXZpZXcuaW52aXRhdGlvbi1yb3V0aW5nL3YxIiwKICAid29ya3NwYWNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzLzE4NTctYXJ0aWZhY3Qtd3JpdGVzL2FpLXRhc2stbWFuYWdlci8uc2NyYXRjaC9wZWVyLXJldmlldy9yZXZpZXctM2I1MmQ3NTk1NTNhOWU4ZmY2MGY3MDVmYjg5MTEwMmQiCn0K" -->

# Reviewer invitation

Review: `review-3b52d759553a9e8ff60f705fb891102d`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/docs/superpowers/plans/2026-10-01-1857-remaining-work-decomposition.md`
- Workspace: `/Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/.scratch/peer-review/review-3b52d759553a9e8ff60f705fb891102d`
- Response: `/Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/docs/reviews/1857-remaining-work-xpr-retry/plan/2026-10-02-2026-10-01-1857-remaining-work-decomposition-review-3b52d759553a9e8ff60f705fb891102d/review-3b52d759553a9e8ff60f705fb891102d-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/docs/reviews/1857-remaining-work-xpr-retry/plan/2026-10-02-2026-10-01-1857-remaining-work-decomposition-review-3b52d759553a9e8ff60f705fb891102d/review-3b52d759553a9e8ff60f705fb891102d-reviewer-invitation.md`
- Reviewer: `claude-opus-5-5` (`claude-opus-5-5`), effort: `medium`
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

When the project-local broker is active, yield after each handoff; do not poll or repeat wait calls. Inspect `peer-review broker status --json` for authenticated instance state. After a failure, preserve receipts and run `peer-review broker reconcile /Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/.scratch/peer-review/review-3b52d759553a9e8ff60f705fb891102d --json` only when the exact recovery evidence calls for it. A broker failure never silently changes the selected reviewer or transport. If the broker is unavailable for an existing manual review, use the bounded `peer-review status /Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/.scratch/peer-review/review-3b52d759553a9e8ff60f705fb891102d --next` recovery path.

Role: reviewer. Join from a distinct session in the same physical worktree.

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/docs/reviews/1857-remaining-work-xpr-retry/plan/2026-10-02-2026-10-01-1857-remaining-work-decomposition-review-3b52d759553a9e8ff60f705fb891102d/review-3b52d759553a9e8ff60f705fb891102d-reviewer-invitation.md`

Installed-package join: `npx --no-install ai-peer-review join /Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/docs/reviews/1857-remaining-work-xpr-retry/plan/2026-10-02-2026-10-01-1857-remaining-work-decomposition-review-3b52d759553a9e8ff60f705fb891102d/review-3b52d759553a9e8ff60f705fb891102d-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/.scratch/peer-review/review-3b52d759553a9e8ff60f705fb891102d`
