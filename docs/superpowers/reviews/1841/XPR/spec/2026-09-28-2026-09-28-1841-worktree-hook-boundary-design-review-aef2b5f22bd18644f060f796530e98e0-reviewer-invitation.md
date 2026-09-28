<!-- ai-peer-review-template version="1" digest="sha256:67647a97b95d0d88ad485fdc636134e56a7bf2688c4aab40d4acdfdcac1a98af" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy9iM2YyL2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3NwZWNzLzIwMjYtMDktMjgtMTg0MS13b3JrdHJlZS1ob29rLWJvdW5kYXJ5LWRlc2lnbi5tZCIsCiAgInJlc3BvbnNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzL2IzZjIvYWktdGFzay1tYW5hZ2VyL2RvY3Mvc3VwZXJwb3dlcnMvcmV2aWV3cy8xODQxL1hQUi9zcGVjLzIwMjYtMDktMjgtMjAyNi0wOS0yOC0xODQxLXdvcmt0cmVlLWhvb2stYm91bmRhcnktZGVzaWduLXJldmlldy1hZWYyYjVmMjJiZDE4NjQ0ZjA2MGY3OTY1MzBlOThlMC1yZXZpZXdlci1yZXNwb25zZS0xLm1kIiwKICAicmV2aWV3X2lkIjogInJldmlldy1hZWYyYjVmMjJiZDE4NjQ0ZjA2MGY3OTY1MzBlOThlMCIsCiAgInNjaGVtYSI6ICJhaS1wZWVyLXJldmlldy5pbnZpdGF0aW9uLXJvdXRpbmcvdjEiLAogICJ3b3Jrc3BhY2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvYjNmMi9haS10YXNrLW1hbmFnZXIvLnNjcmF0Y2gvcGVlci1yZXZpZXcvcmV2aWV3LWFlZjJiNWYyMmJkMTg2NDRmMDYwZjc5NjUzMGU5OGUwIgp9Cg" -->

# Reviewer invitation

Review: `review-aef2b5f22bd18644f060f796530e98e0`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md`
- Workspace: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/.scratch/peer-review/review-aef2b5f22bd18644f060f796530e98e0`
- Response: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/superpowers/reviews/1841/XPR/spec/2026-09-28-2026-09-28-1841-worktree-hook-boundary-design-review-aef2b5f22bd18644f060f796530e98e0-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/superpowers/reviews/1841/XPR/spec/2026-09-28-2026-09-28-1841-worktree-hook-boundary-design-review-aef2b5f22bd18644f060f796530e98e0-reviewer-invitation.md`

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

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/superpowers/reviews/1841/XPR/spec/2026-09-28-2026-09-28-1841-worktree-hook-boundary-design-review-aef2b5f22bd18644f060f796530e98e0-reviewer-invitation.md`

Zero-install join: `npx --yes ai-peer-review@0.2.2 join /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/docs/superpowers/reviews/1841/XPR/spec/2026-09-28-2026-09-28-1841-worktree-hook-boundary-design-review-aef2b5f22bd18644f060f796530e98e0-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/b3f2/ai-task-manager/.scratch/peer-review/review-aef2b5f22bd18644f060f796530e98e0`
