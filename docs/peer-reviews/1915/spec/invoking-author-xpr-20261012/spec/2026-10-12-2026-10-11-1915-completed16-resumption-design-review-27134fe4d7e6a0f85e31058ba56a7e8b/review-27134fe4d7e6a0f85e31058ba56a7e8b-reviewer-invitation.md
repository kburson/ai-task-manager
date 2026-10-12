<!-- ai-peer-review-template version="1" digest="sha256:064952674640611160aff00e947b64de060d4a4cfe7139019eb0f24ee264aa25" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy9iOTU3L2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3NwZWNzLzIwMjYtMTAtMTEtMTkxNS1jb21wbGV0ZWQxNi1yZXN1bXB0aW9uLWRlc2lnbi5tZCIsCiAgInJlc3BvbnNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzL2I5NTcvYWktdGFzay1tYW5hZ2VyL2RvY3MvcGVlci1yZXZpZXdzLzE5MTUvc3BlYy9pbnZva2luZy1hdXRob3IteHByLTIwMjYxMDEyL3NwZWMvMjAyNi0xMC0xMi0yMDI2LTEwLTExLTE5MTUtY29tcGxldGVkMTYtcmVzdW1wdGlvbi1kZXNpZ24tcmV2aWV3LTI3MTM0ZmU0ZDdlNmEwZjg1ZTMxMDU4YmE1NmE3ZThiL3Jldmlldy0yNzEzNGZlNGQ3ZTZhMGY4NWUzMTA1OGJhNTZhN2U4Yi1yZXZpZXdlci1yZXNwb25zZS0xLm1kIiwKICAicmV2aWV3X2lkIjogInJldmlldy0yNzEzNGZlNGQ3ZTZhMGY4NWUzMTA1OGJhNTZhN2U4YiIsCiAgInNjaGVtYSI6ICJhaS1wZWVyLXJldmlldy5pbnZpdGF0aW9uLXJvdXRpbmcvdjEiLAogICJ3b3Jrc3BhY2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvYjk1Ny9haS10YXNrLW1hbmFnZXIvLnNjcmF0Y2gvcGVlci1yZXZpZXcvcmV2aWV3LTI3MTM0ZmU0ZDdlNmEwZjg1ZTMxMDU4YmE1NmE3ZThiIgp9Cg" -->

# Reviewer invitation

Review: `review-27134fe4d7e6a0f85e31058ba56a7e8b`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/b957/ai-task-manager/docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md`
- Workspace: `/Users/kpburson/.codex/worktrees/b957/ai-task-manager/.scratch/peer-review/review-27134fe4d7e6a0f85e31058ba56a7e8b`
- Response: `/Users/kpburson/.codex/worktrees/b957/ai-task-manager/docs/peer-reviews/1915/spec/invoking-author-xpr-20261012/spec/2026-10-12-2026-10-11-1915-completed16-resumption-design-review-27134fe4d7e6a0f85e31058ba56a7e8b/review-27134fe4d7e6a0f85e31058ba56a7e8b-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/b957/ai-task-manager/docs/peer-reviews/1915/spec/invoking-author-xpr-20261012/spec/2026-10-12-2026-10-11-1915-completed16-resumption-design-review-27134fe4d7e6a0f85e31058ba56a7e8b/review-27134fe4d7e6a0f85e31058ba56a7e8b-reviewer-invitation.md`
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

When the project-local broker is active, yield after each handoff; do not poll or repeat wait calls. Inspect `peer-review broker status --json` for authenticated instance state. After a failure, preserve receipts and run `peer-review broker reconcile /Users/kpburson/.codex/worktrees/b957/ai-task-manager/.scratch/peer-review/review-27134fe4d7e6a0f85e31058ba56a7e8b --json` only when the exact recovery evidence calls for it. A broker failure never silently changes the selected reviewer or transport. If the broker is unavailable for an existing manual review, use the bounded `peer-review status /Users/kpburson/.codex/worktrees/b957/ai-task-manager/.scratch/peer-review/review-27134fe4d7e6a0f85e31058ba56a7e8b --next` recovery path.

Role: reviewer. Join from a distinct session in the same physical worktree.

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/b957/ai-task-manager/docs/peer-reviews/1915/spec/invoking-author-xpr-20261012/spec/2026-10-12-2026-10-11-1915-completed16-resumption-design-review-27134fe4d7e6a0f85e31058ba56a7e8b/review-27134fe4d7e6a0f85e31058ba56a7e8b-reviewer-invitation.md`

Installed-package join: `npx --no-install ai-peer-review join /Users/kpburson/.codex/worktrees/b957/ai-task-manager/docs/peer-reviews/1915/spec/invoking-author-xpr-20261012/spec/2026-10-12-2026-10-11-1915-completed16-resumption-design-review-27134fe4d7e6a0f85e31058ba56a7e8b/review-27134fe4d7e6a0f85e31058ba56a7e8b-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/b957/ai-task-manager/.scratch/peer-review/review-27134fe4d7e6a0f85e31058ba56a7e8b`
