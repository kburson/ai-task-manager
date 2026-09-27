<!-- ai-peer-review-template version="1" digest="sha256:67647a97b95d0d88ad485fdc636134e56a7bf2688c4aab40d4acdfdcac1a98af" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy81NWVmL2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3BsYW5zLzIwMjYtMDktMjctMTgzMC1tdXRhdGlvbi1ndWFyZC1jb250ZXh0Lm1kIiwKICAicmVzcG9uc2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvNTVlZi9haS10YXNrLW1hbmFnZXIvZG9jcy9wZWVyLXJldmlld3MvcGxhbi8yMDI2LTA5LTI3LTIwMjYtMDktMjctMTgzMC1tdXRhdGlvbi1ndWFyZC1jb250ZXh0LXJldmlldy05ZGI5NGEyOTQxNjc5NTY5OWRiNTM2MDE0Mjk5YTlhNi9yZXZpZXctOWRiOTRhMjk0MTY3OTU2OTlkYjUzNjAxNDI5OWE5YTYtcmV2aWV3ZXItcmVzcG9uc2UtMS5tZCIsCiAgInJldmlld19pZCI6ICJyZXZpZXctOWRiOTRhMjk0MTY3OTU2OTlkYjUzNjAxNDI5OWE5YTYiLAogICJzY2hlbWEiOiAiYWktcGVlci1yZXZpZXcuaW52aXRhdGlvbi1yb3V0aW5nL3YxIiwKICAid29ya3NwYWNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzLzU1ZWYvYWktdGFzay1tYW5hZ2VyLy5zY3JhdGNoL3BlZXItcmV2aWV3L3Jldmlldy05ZGI5NGEyOTQxNjc5NTY5OWRiNTM2MDE0Mjk5YTlhNiIKfQo" -->

# Reviewer invitation

Review: `review-9db94a29416795699db536014299a9a6`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/55ef/ai-task-manager/docs/superpowers/plans/2026-09-27-1830-mutation-guard-context.md`
- Workspace: `/Users/kpburson/.codex/worktrees/55ef/ai-task-manager/.scratch/peer-review/review-9db94a29416795699db536014299a9a6`
- Response: `/Users/kpburson/.codex/worktrees/55ef/ai-task-manager/docs/peer-reviews/plan/2026-09-27-2026-09-27-1830-mutation-guard-context-review-9db94a29416795699db536014299a9a6/review-9db94a29416795699db536014299a9a6-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/55ef/ai-task-manager/docs/peer-reviews/plan/2026-09-27-2026-09-27-1830-mutation-guard-context-review-9db94a29416795699db536014299a9a6/review-9db94a29416795699db536014299a9a6-reviewer-invitation.md`

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

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/55ef/ai-task-manager/docs/peer-reviews/plan/2026-09-27-2026-09-27-1830-mutation-guard-context-review-9db94a29416795699db536014299a9a6/review-9db94a29416795699db536014299a9a6-reviewer-invitation.md`

Zero-install join: `npx --yes ai-peer-review@0.2.2 join /Users/kpburson/.codex/worktrees/55ef/ai-task-manager/docs/peer-reviews/plan/2026-09-27-2026-09-27-1830-mutation-guard-context-review-9db94a29416795699db536014299a9a6/review-9db94a29416795699db536014299a9a6-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/55ef/ai-task-manager/.scratch/peer-review/review-9db94a29416795699db536014299a9a6`
