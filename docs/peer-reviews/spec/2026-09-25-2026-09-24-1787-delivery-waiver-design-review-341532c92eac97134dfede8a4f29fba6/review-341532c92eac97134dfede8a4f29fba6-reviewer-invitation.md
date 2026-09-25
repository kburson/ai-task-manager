<!-- ai-peer-review-template version="1" digest="sha256:67647a97b95d0d88ad485fdc636134e56a7bf2688c4aab40d4acdfdcac1a98af" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy83NjU3L2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3NwZWNzLzIwMjYtMDktMjQtMTc4Ny1kZWxpdmVyeS13YWl2ZXItZGVzaWduLm1kIiwKICAicmVzcG9uc2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvNzY1Ny9haS10YXNrLW1hbmFnZXIvZG9jcy9wZWVyLXJldmlld3Mvc3BlYy8yMDI2LTA5LTI1LTIwMjYtMDktMjQtMTc4Ny1kZWxpdmVyeS13YWl2ZXItZGVzaWduLXJldmlldy0zNDE1MzJjOTJlYWM5NzEzNGRmZWRlOGE0ZjI5ZmJhNi9yZXZpZXctMzQxNTMyYzkyZWFjOTcxMzRkZmVkZThhNGYyOWZiYTYtcmV2aWV3ZXItcmVzcG9uc2UtMS5tZCIsCiAgInJldmlld19pZCI6ICJyZXZpZXctMzQxNTMyYzkyZWFjOTcxMzRkZmVkZThhNGYyOWZiYTYiLAogICJzY2hlbWEiOiAiYWktcGVlci1yZXZpZXcuaW52aXRhdGlvbi1yb3V0aW5nL3YxIiwKICAid29ya3NwYWNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzLzc2NTcvYWktdGFzay1tYW5hZ2VyLy5zY3JhdGNoL3BlZXItcmV2aWV3L3Jldmlldy0zNDE1MzJjOTJlYWM5NzEzNGRmZWRlOGE0ZjI5ZmJhNiIKfQo" -->

# Reviewer invitation

Review: `review-341532c92eac97134dfede8a4f29fba6`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/7657/ai-task-manager/docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md`
- Workspace: `/Users/kpburson/.codex/worktrees/7657/ai-task-manager/.scratch/peer-review/review-341532c92eac97134dfede8a4f29fba6`
- Response: `/Users/kpburson/.codex/worktrees/7657/ai-task-manager/docs/peer-reviews/spec/2026-09-25-2026-09-24-1787-delivery-waiver-design-review-341532c92eac97134dfede8a4f29fba6/review-341532c92eac97134dfede8a4f29fba6-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/7657/ai-task-manager/docs/peer-reviews/spec/2026-09-25-2026-09-24-1787-delivery-waiver-design-review-341532c92eac97134dfede8a4f29fba6/review-341532c92eac97134dfede8a4f29fba6-reviewer-invitation.md`

## Communication policy (v1)

Keep all peer-review chat messages terse. Put complete review analysis, findings, dispositions, revised prose, rationale, decisions, and verification evidence in the generated durable review documents.

Chat may contain only:

- a short operational status;
- a pointer to the relevant durable document;
- the exact next action; or
- a concise blocker requiring human action.

Read the relevant durable reviewer or author response document; do not rely on a chat summary. Do not paste findings, dispositions, revised prose, verification output, or other durable document content into chat unless the human explicitly requests it.

“Terse chat” does not mean terse review evidence. Durable reviewer and author response documents remain complete, self-contained, and authoritative.

## Durable coordinator

Phased sessions remain event-authoritative. After a non-final acceptance, the registered author finalizes and advances the exact next artifact; resume only from the generated reviewer response and never infer or skip a phase from chat.

When the host reports that the durable coordinator is active, yield after each handoff. The coordinator sleeps outside participant context and wakes only the exact configured session for an actionable protocol revision; do not poll or repeat wait calls. If durable wake is unavailable, use only the bounded manual fallback `peer-review status <workspace> --next`.

Role: reviewer. Join from a distinct session in the same physical worktree.

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/7657/ai-task-manager/docs/peer-reviews/spec/2026-09-25-2026-09-24-1787-delivery-waiver-design-review-341532c92eac97134dfede8a4f29fba6/review-341532c92eac97134dfede8a4f29fba6-reviewer-invitation.md`

Zero-install join: `npx --yes ai-peer-review@0.2.2 join /Users/kpburson/.codex/worktrees/7657/ai-task-manager/docs/peer-reviews/spec/2026-09-25-2026-09-24-1787-delivery-waiver-design-review-341532c92eac97134dfede8a4f29fba6/review-341532c92eac97134dfede8a4f29fba6-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/7657/ai-task-manager/.scratch/peer-review/review-341532c92eac97134dfede8a4f29fba6`
