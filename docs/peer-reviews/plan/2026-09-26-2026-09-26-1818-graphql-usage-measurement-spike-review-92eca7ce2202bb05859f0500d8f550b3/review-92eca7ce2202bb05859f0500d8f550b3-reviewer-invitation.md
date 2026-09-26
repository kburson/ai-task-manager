<!-- ai-peer-review-template version="1" digest="sha256:67647a97b95d0d88ad485fdc636134e56a7bf2688c4aab40d4acdfdcac1a98af" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy85ZjQ1L2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3BsYW5zLzIwMjYtMDktMjYtMTgxOC1ncmFwaHFsLXVzYWdlLW1lYXN1cmVtZW50LXNwaWtlLm1kIiwKICAicmVzcG9uc2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvOWY0NS9haS10YXNrLW1hbmFnZXIvZG9jcy9wZWVyLXJldmlld3MvcGxhbi8yMDI2LTA5LTI2LTIwMjYtMDktMjYtMTgxOC1ncmFwaHFsLXVzYWdlLW1lYXN1cmVtZW50LXNwaWtlLXJldmlldy05MmVjYTdjZTIyMDJiYjA1ODU5ZjA1MDBkOGY1NTBiMy9yZXZpZXctOTJlY2E3Y2UyMjAyYmIwNTg1OWYwNTAwZDhmNTUwYjMtcmV2aWV3ZXItcmVzcG9uc2UtMS5tZCIsCiAgInJldmlld19pZCI6ICJyZXZpZXctOTJlY2E3Y2UyMjAyYmIwNTg1OWYwNTAwZDhmNTUwYjMiLAogICJzY2hlbWEiOiAiYWktcGVlci1yZXZpZXcuaW52aXRhdGlvbi1yb3V0aW5nL3YxIiwKICAid29ya3NwYWNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzLzlmNDUvYWktdGFzay1tYW5hZ2VyLy5zY3JhdGNoL3BlZXItcmV2aWV3L3Jldmlldy05MmVjYTdjZTIyMDJiYjA1ODU5ZjA1MDBkOGY1NTBiMyIKfQo" -->

# Reviewer invitation

Review: `review-92eca7ce2202bb05859f0500d8f550b3`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/9f45/ai-task-manager/docs/superpowers/plans/2026-09-26-1818-graphql-usage-measurement-spike.md`
- Workspace: `/Users/kpburson/.codex/worktrees/9f45/ai-task-manager/.scratch/peer-review/review-92eca7ce2202bb05859f0500d8f550b3`
- Response: `/Users/kpburson/.codex/worktrees/9f45/ai-task-manager/docs/peer-reviews/plan/2026-09-26-2026-09-26-1818-graphql-usage-measurement-spike-review-92eca7ce2202bb05859f0500d8f550b3/review-92eca7ce2202bb05859f0500d8f550b3-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/9f45/ai-task-manager/docs/peer-reviews/plan/2026-09-26-2026-09-26-1818-graphql-usage-measurement-spike-review-92eca7ce2202bb05859f0500d8f550b3/review-92eca7ce2202bb05859f0500d8f550b3-reviewer-invitation.md`

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

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/9f45/ai-task-manager/docs/peer-reviews/plan/2026-09-26-2026-09-26-1818-graphql-usage-measurement-spike-review-92eca7ce2202bb05859f0500d8f550b3/review-92eca7ce2202bb05859f0500d8f550b3-reviewer-invitation.md`

Zero-install join: `npx --yes ai-peer-review@0.2.2 join /Users/kpburson/.codex/worktrees/9f45/ai-task-manager/docs/peer-reviews/plan/2026-09-26-2026-09-26-1818-graphql-usage-measurement-spike-review-92eca7ce2202bb05859f0500d8f550b3/review-92eca7ce2202bb05859f0500d8f550b3-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/9f45/ai-task-manager/.scratch/peer-review/review-92eca7ce2202bb05859f0500d8f550b3`
