<!-- ai-peer-review-template version="1" digest="sha256:064952674640611160aff00e947b64de060d4a4cfe7139019eb0f24ee264aa25" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy9iOTU3L2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3BsYW5zLzIwMjYtMTAtMTItMTkxNS1jb21wbGV0ZWQxNi1vcmlnaW5hbC1zZXNzaW9uLXJlc3VtcHRpb24ubWQiLAogICJyZXNwb25zZSI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy9iOTU3L2FpLXRhc2stbWFuYWdlci9kb2NzL3BlZXItcmV2aWV3cy8xOTE1L3BsYW4vY29tcGxldGVkMTYtc3ByLXJlcmV2aWV3LTIwMjYxMDEyL3BsYW4vMjAyNi0xMC0xMi0yMDI2LTEwLTEyLTE5MTUtY29tcGxldGVkMTYtb3JpZ2luYWwtc2Vzc2lvbi1yZXN1bXB0aW9uLXJldmlldy02ZTRiNTU0MjhkNDcwMWM3NTkxOTQwZDJiNmYyOTZjZS9yZXZpZXctNmU0YjU1NDI4ZDQ3MDFjNzU5MTk0MGQyYjZmMjk2Y2UtcmV2aWV3ZXItcmVzcG9uc2UtMS5tZCIsCiAgInJldmlld19pZCI6ICJyZXZpZXctNmU0YjU1NDI4ZDQ3MDFjNzU5MTk0MGQyYjZmMjk2Y2UiLAogICJzY2hlbWEiOiAiYWktcGVlci1yZXZpZXcuaW52aXRhdGlvbi1yb3V0aW5nL3YxIiwKICAid29ya3NwYWNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzL2I5NTcvYWktdGFzay1tYW5hZ2VyLy5zY3JhdGNoL3BlZXItcmV2aWV3L3Jldmlldy02ZTRiNTU0MjhkNDcwMWM3NTkxOTQwZDJiNmYyOTZjZSIKfQo" -->

# Reviewer invitation

Review: `review-6e4b55428d4701c7591940d2b6f296ce`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/b957/ai-task-manager/docs/superpowers/plans/2026-10-12-1915-completed16-original-session-resumption.md`
- Workspace: `/Users/kpburson/.codex/worktrees/b957/ai-task-manager/.scratch/peer-review/review-6e4b55428d4701c7591940d2b6f296ce`
- Response: `/Users/kpburson/.codex/worktrees/b957/ai-task-manager/docs/peer-reviews/1915/plan/completed16-spr-rereview-20261012/plan/2026-10-12-2026-10-12-1915-completed16-original-session-resumption-review-6e4b55428d4701c7591940d2b6f296ce/review-6e4b55428d4701c7591940d2b6f296ce-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/b957/ai-task-manager/docs/peer-reviews/1915/plan/completed16-spr-rereview-20261012/plan/2026-10-12-2026-10-12-1915-completed16-original-session-resumption-review-6e4b55428d4701c7591940d2b6f296ce/review-6e4b55428d4701c7591940d2b6f296ce-reviewer-invitation.md`
- Reviewer: `gpt-6-astra` (`gpt-6-astra`), effort: `high`
- Runtime: SPR, project-local broker

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

When the project-local broker is active, yield after each handoff; do not poll or repeat wait calls. Inspect `peer-review broker status --json` for authenticated instance state. After a failure, preserve receipts and run `peer-review broker reconcile /Users/kpburson/.codex/worktrees/b957/ai-task-manager/.scratch/peer-review/review-6e4b55428d4701c7591940d2b6f296ce --json` only when the exact recovery evidence calls for it. A broker failure never silently changes the selected reviewer or transport. If the broker is unavailable for an existing manual review, use the bounded `peer-review status /Users/kpburson/.codex/worktrees/b957/ai-task-manager/.scratch/peer-review/review-6e4b55428d4701c7591940d2b6f296ce --next` recovery path.

Role: reviewer. Join from a distinct session in the same physical worktree.

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/b957/ai-task-manager/docs/peer-reviews/1915/plan/completed16-spr-rereview-20261012/plan/2026-10-12-2026-10-12-1915-completed16-original-session-resumption-review-6e4b55428d4701c7591940d2b6f296ce/review-6e4b55428d4701c7591940d2b6f296ce-reviewer-invitation.md`

Installed-package join: `npx --no-install ai-peer-review join /Users/kpburson/.codex/worktrees/b957/ai-task-manager/docs/peer-reviews/1915/plan/completed16-spr-rereview-20261012/plan/2026-10-12-2026-10-12-1915-completed16-original-session-resumption-review-6e4b55428d4701c7591940d2b6f296ce/review-6e4b55428d4701c7591940d2b6f296ce-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/b957/ai-task-manager/.scratch/peer-review/review-6e4b55428d4701c7591940d2b6f296ce`
