<!-- ai-peer-review-template version="1" digest="sha256:67647a97b95d0d88ad485fdc636134e56a7bf2688c4aab40d4acdfdcac1a98af" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy83NjU3L2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3BsYW5zLzIwMjYtMDktMjQtMTc4Ny1kZWxpdmVyeS13YWl2ZXIubWQiLAogICJyZXNwb25zZSI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy83NjU3L2FpLXRhc2stbWFuYWdlci9kb2NzL3BlZXItcmV2aWV3cy9wbGFuLzIwMjYtMDktMjUtMjAyNi0wOS0yNC0xNzg3LWRlbGl2ZXJ5LXdhaXZlci1yZXZpZXctNDU0NzQxNmZkYjMxZDUzZDkwYzhjNzdlYTRhOGJhM2EvcmV2aWV3LTQ1NDc0MTZmZGIzMWQ1M2Q5MGM4Yzc3ZWE0YThiYTNhLXJldmlld2VyLXJlc3BvbnNlLTEubWQiLAogICJyZXZpZXdfaWQiOiAicmV2aWV3LTQ1NDc0MTZmZGIzMWQ1M2Q5MGM4Yzc3ZWE0YThiYTNhIiwKICAic2NoZW1hIjogImFpLXBlZXItcmV2aWV3Lmludml0YXRpb24tcm91dGluZy92MSIsCiAgIndvcmtzcGFjZSI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy83NjU3L2FpLXRhc2stbWFuYWdlci8uc2NyYXRjaC9wZWVyLXJldmlldy9yZXZpZXctNDU0NzQxNmZkYjMxZDUzZDkwYzhjNzdlYTRhOGJhM2EiCn0K" -->

# Reviewer invitation

Review: `review-4547416fdb31d53d90c8c77ea4a8ba3a`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/7657/ai-task-manager/docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md`
- Workspace: `/Users/kpburson/.codex/worktrees/7657/ai-task-manager/.scratch/peer-review/review-4547416fdb31d53d90c8c77ea4a8ba3a`
- Response: `/Users/kpburson/.codex/worktrees/7657/ai-task-manager/docs/peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-4547416fdb31d53d90c8c77ea4a8ba3a/review-4547416fdb31d53d90c8c77ea4a8ba3a-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/7657/ai-task-manager/docs/peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-4547416fdb31d53d90c8c77ea4a8ba3a/review-4547416fdb31d53d90c8c77ea4a8ba3a-reviewer-invitation.md`

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

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/7657/ai-task-manager/docs/peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-4547416fdb31d53d90c8c77ea4a8ba3a/review-4547416fdb31d53d90c8c77ea4a8ba3a-reviewer-invitation.md`

Zero-install join: `npx --yes ai-peer-review@0.2.2 join /Users/kpburson/.codex/worktrees/7657/ai-task-manager/docs/peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-4547416fdb31d53d90c8c77ea4a8ba3a/review-4547416fdb31d53d90c8c77ea4a8ba3a-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/7657/ai-task-manager/.scratch/peer-review/review-4547416fdb31d53d90c8c77ea4a8ba3a`
