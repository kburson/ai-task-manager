<!-- ai-peer-review-template version="1" digest="sha256:67647a97b95d0d88ad485fdc636134e56a7bf2688c4aab40d4acdfdcac1a98af" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy9haXRtLXhwci1maXJzdC1mcmVzaC9haS10YXNrLW1hbmFnZXIvZG9jcy9zdXBlcnBvd2Vycy9zcGVjcy8yMDI2LTA5LTIwLWFpdG0tbWNwLWFkYXB0ZXItYXJjaGl0ZWN0dXJlLWRlc2lnbi5tZCIsCiAgInJlc3BvbnNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzL2FpdG0teHByLWZpcnN0LWZyZXNoL2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3Jldmlld3MvYWl0bS1tY3AtYWRhcHRlci1hcmNoaXRlY3R1cmUvWFBSLWZpcnN0L1hQUi9zcGVjLzIwMjYtMDktMjAtMjAyNi0wOS0yMC1haXRtLW1jcC1hZGFwdGVyLWFyY2hpdGVjdHVyZS1kZXNpZ24tcmV2aWV3LWJmMzM5ZTc0ZjQ2Njk3YjRkYTVkMmQxOWNiM2M4MjJlL3Jldmlldy1iZjMzOWU3NGY0NjY5N2I0ZGE1ZDJkMTljYjNjODIyZS1yZXZpZXdlci1yZXNwb25zZS0xLm1kIiwKICAicmV2aWV3X2lkIjogInJldmlldy1iZjMzOWU3NGY0NjY5N2I0ZGE1ZDJkMTljYjNjODIyZSIsCiAgInNjaGVtYSI6ICJhaS1wZWVyLXJldmlldy5pbnZpdGF0aW9uLXJvdXRpbmcvdjEiLAogICJ3b3Jrc3BhY2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvYWl0bS14cHItZmlyc3QtZnJlc2gvYWktdGFzay1tYW5hZ2VyLy5zY3JhdGNoL3BlZXItcmV2aWV3L3Jldmlldy1iZjMzOWU3NGY0NjY5N2I0ZGE1ZDJkMTljYjNjODIyZSIKfQo" -->

# Reviewer invitation

Review: `review-bf339e74f46697b4da5d2d19cb3c822e`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/aitm-xpr-first-fresh/ai-task-manager/docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md`
- Workspace: `/Users/kpburson/.codex/worktrees/aitm-xpr-first-fresh/ai-task-manager/.scratch/peer-review/review-bf339e74f46697b4da5d2d19cb3c822e`
- Response: `/Users/kpburson/.codex/worktrees/aitm-xpr-first-fresh/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/XPR/spec/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-bf339e74f46697b4da5d2d19cb3c822e/review-bf339e74f46697b4da5d2d19cb3c822e-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/aitm-xpr-first-fresh/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/XPR/spec/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-bf339e74f46697b4da5d2d19cb3c822e/review-bf339e74f46697b4da5d2d19cb3c822e-reviewer-invitation.md`

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

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/aitm-xpr-first-fresh/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/XPR/spec/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-bf339e74f46697b4da5d2d19cb3c822e/review-bf339e74f46697b4da5d2d19cb3c822e-reviewer-invitation.md`

Zero-install join: `npx --yes ai-peer-review@0.2.2 join /Users/kpburson/.codex/worktrees/aitm-xpr-first-fresh/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/XPR/spec/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-bf339e74f46697b4da5d2d19cb3c822e/review-bf339e74f46697b4da5d2d19cb3c822e-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/aitm-xpr-first-fresh/ai-task-manager/.scratch/peer-review/review-bf339e74f46697b4da5d2d19cb3c822e`
