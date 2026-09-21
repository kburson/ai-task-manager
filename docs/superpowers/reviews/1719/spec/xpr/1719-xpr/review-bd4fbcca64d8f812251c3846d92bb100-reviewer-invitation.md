<!-- ai-peer-review-template version="1" digest="sha256:67647a97b95d0d88ad485fdc636134e56a7bf2688c4aab40d4acdfdcac1a98af" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy9kZjg4L2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3NwZWNzLzIwMjYtMDktMjAtMTcxOS1zdG9yeS10b2tlbi1jb3N0LWRlc2lnbi5tZCIsCiAgInJlc3BvbnNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzL2RmODgvYWktdGFzay1tYW5hZ2VyL2RvY3Mvc3VwZXJwb3dlcnMvcmV2aWV3cy8xNzE5L3NwZWMveHByLzE3MTkteHByL3Jldmlldy1iZDRmYmNjYTY0ZDhmODEyMjUxYzM4NDZkOTJiYjEwMC1yZXZpZXdlci1yZXNwb25zZS0xLm1kIiwKICAicmV2aWV3X2lkIjogInJldmlldy1iZDRmYmNjYTY0ZDhmODEyMjUxYzM4NDZkOTJiYjEwMCIsCiAgInNjaGVtYSI6ICJhaS1wZWVyLXJldmlldy5pbnZpdGF0aW9uLXJvdXRpbmcvdjEiLAogICJ3b3Jrc3BhY2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvZGY4OC9haS10YXNrLW1hbmFnZXIvLnNjcmF0Y2gvcGVlci1yZXZpZXcvcmV2aWV3LWJkNGZiY2NhNjRkOGY4MTIyNTFjMzg0NmQ5MmJiMTAwIgp9Cg" -->

# Reviewer invitation

Review: `review-bd4fbcca64d8f812251c3846d92bb100`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/df88/ai-task-manager/docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md`
- Workspace: `/Users/kpburson/.codex/worktrees/df88/ai-task-manager/.scratch/peer-review/review-bd4fbcca64d8f812251c3846d92bb100`
- Response: `/Users/kpburson/.codex/worktrees/df88/ai-task-manager/docs/superpowers/reviews/1719/spec/xpr/1719-xpr/review-bd4fbcca64d8f812251c3846d92bb100-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/df88/ai-task-manager/docs/superpowers/reviews/1719/spec/xpr/1719-xpr/review-bd4fbcca64d8f812251c3846d92bb100-reviewer-invitation.md`

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

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/df88/ai-task-manager/docs/superpowers/reviews/1719/spec/xpr/1719-xpr/review-bd4fbcca64d8f812251c3846d92bb100-reviewer-invitation.md`

Zero-install join: `npx --yes ai-peer-review@0.2.2 join /Users/kpburson/.codex/worktrees/df88/ai-task-manager/docs/superpowers/reviews/1719/spec/xpr/1719-xpr/review-bd4fbcca64d8f812251c3846d92bb100-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/df88/ai-task-manager/.scratch/peer-review/review-bd4fbcca64d8f812251c3846d92bb100`
