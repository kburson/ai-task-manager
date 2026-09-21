<!-- ai-peer-review-template version="1" digest="sha256:67647a97b95d0d88ad485fdc636134e56a7bf2688c4aab40d4acdfdcac1a98af" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy85ZGI1L2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3BsYW5zLzIwMjYtMDktMjAtMTcyNS1haXRtLW1jcC1hZGFwdGVyLWFyY2hpdGVjdHVyZS5tZCIsCiAgInJlc3BvbnNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzLzlkYjUvYWktdGFzay1tYW5hZ2VyL2RvY3Mvc3VwZXJwb3dlcnMvcmV2aWV3cy9haXRtLW1jcC1hZGFwdGVyLWFyY2hpdGVjdHVyZS9wbGFuLTE3MjUvWFBSL3BsYW4vMjAyNi0wOS0yMS0yMDI2LTA5LTIwLTE3MjUtYWl0bS1tY3AtYWRhcHRlci1hcmNoaXRlY3R1cmUtcmV2aWV3LWQ1YzRiZjI2MjAyYjgwNjliMmRiZGUxMWU0NDJiZTI3L3Jldmlldy1kNWM0YmYyNjIwMmI4MDY5YjJkYmRlMTFlNDQyYmUyNy1yZXZpZXdlci1yZXNwb25zZS0xLm1kIiwKICAicmV2aWV3X2lkIjogInJldmlldy1kNWM0YmYyNjIwMmI4MDY5YjJkYmRlMTFlNDQyYmUyNyIsCiAgInNjaGVtYSI6ICJhaS1wZWVyLXJldmlldy5pbnZpdGF0aW9uLXJvdXRpbmcvdjEiLAogICJ3b3Jrc3BhY2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvOWRiNS9haS10YXNrLW1hbmFnZXIvLnNjcmF0Y2gvcGVlci1yZXZpZXcvcmV2aWV3LWQ1YzRiZjI2MjAyYjgwNjliMmRiZGUxMWU0NDJiZTI3Igp9Cg" -->

# Reviewer invitation

Review: `review-d5c4bf26202b8069b2dbde11e442be27`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/9db5/ai-task-manager/docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md`
- Workspace: `/Users/kpburson/.codex/worktrees/9db5/ai-task-manager/.scratch/peer-review/review-d5c4bf26202b8069b2dbde11e442be27`
- Response: `/Users/kpburson/.codex/worktrees/9db5/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/plan-1725/XPR/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-review-d5c4bf26202b8069b2dbde11e442be27/review-d5c4bf26202b8069b2dbde11e442be27-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/9db5/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/plan-1725/XPR/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-review-d5c4bf26202b8069b2dbde11e442be27/review-d5c4bf26202b8069b2dbde11e442be27-reviewer-invitation.md`

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

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/9db5/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/plan-1725/XPR/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-review-d5c4bf26202b8069b2dbde11e442be27/review-d5c4bf26202b8069b2dbde11e442be27-reviewer-invitation.md`

Zero-install join: `npx --yes ai-peer-review@0.2.2 join /Users/kpburson/.codex/worktrees/9db5/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/plan-1725/XPR/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-review-d5c4bf26202b8069b2dbde11e442be27/review-d5c4bf26202b8069b2dbde11e442be27-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/9db5/ai-task-manager/.scratch/peer-review/review-d5c4bf26202b8069b2dbde11e442be27`
