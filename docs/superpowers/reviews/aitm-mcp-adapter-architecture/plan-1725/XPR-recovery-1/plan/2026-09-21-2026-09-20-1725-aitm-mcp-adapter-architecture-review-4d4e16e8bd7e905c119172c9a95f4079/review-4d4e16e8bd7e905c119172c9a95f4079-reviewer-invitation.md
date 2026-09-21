<!-- ai-peer-review-template version="1" digest="sha256:67647a97b95d0d88ad485fdc636134e56a7bf2688c4aab40d4acdfdcac1a98af" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy9haXRtLXBsYW4tMTcyNS14cHIvYWktdGFzay1tYW5hZ2VyL2RvY3Mvc3VwZXJwb3dlcnMvcGxhbnMvMjAyNi0wOS0yMC0xNzI1LWFpdG0tbWNwLWFkYXB0ZXItYXJjaGl0ZWN0dXJlLm1kIiwKICAicmVzcG9uc2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvYWl0bS1wbGFuLTE3MjUteHByL2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3Jldmlld3MvYWl0bS1tY3AtYWRhcHRlci1hcmNoaXRlY3R1cmUvcGxhbi0xNzI1L1hQUi1yZWNvdmVyeS0xL3BsYW4vMjAyNi0wOS0yMS0yMDI2LTA5LTIwLTE3MjUtYWl0bS1tY3AtYWRhcHRlci1hcmNoaXRlY3R1cmUtcmV2aWV3LTRkNGUxNmU4YmQ3ZTkwNWMxMTkxNzJjOWE5NWY0MDc5L3Jldmlldy00ZDRlMTZlOGJkN2U5MDVjMTE5MTcyYzlhOTVmNDA3OS1yZXZpZXdlci1yZXNwb25zZS0xLm1kIiwKICAicmV2aWV3X2lkIjogInJldmlldy00ZDRlMTZlOGJkN2U5MDVjMTE5MTcyYzlhOTVmNDA3OSIsCiAgInNjaGVtYSI6ICJhaS1wZWVyLXJldmlldy5pbnZpdGF0aW9uLXJvdXRpbmcvdjEiLAogICJ3b3Jrc3BhY2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvYWl0bS1wbGFuLTE3MjUteHByL2FpLXRhc2stbWFuYWdlci8uc2NyYXRjaC9wZWVyLXJldmlldy9yZXZpZXctNGQ0ZTE2ZThiZDdlOTA1YzExOTE3MmM5YTk1ZjQwNzkiCn0K" -->

# Reviewer invitation

Review: `review-4d4e16e8bd7e905c119172c9a95f4079`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/aitm-plan-1725-xpr/ai-task-manager/docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md`
- Workspace: `/Users/kpburson/.codex/worktrees/aitm-plan-1725-xpr/ai-task-manager/.scratch/peer-review/review-4d4e16e8bd7e905c119172c9a95f4079`
- Response: `/Users/kpburson/.codex/worktrees/aitm-plan-1725-xpr/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/plan-1725/XPR-recovery-1/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-review-4d4e16e8bd7e905c119172c9a95f4079/review-4d4e16e8bd7e905c119172c9a95f4079-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/aitm-plan-1725-xpr/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/plan-1725/XPR-recovery-1/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-review-4d4e16e8bd7e905c119172c9a95f4079/review-4d4e16e8bd7e905c119172c9a95f4079-reviewer-invitation.md`

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

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/aitm-plan-1725-xpr/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/plan-1725/XPR-recovery-1/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-review-4d4e16e8bd7e905c119172c9a95f4079/review-4d4e16e8bd7e905c119172c9a95f4079-reviewer-invitation.md`

Zero-install join: `npx --yes ai-peer-review@0.2.2 join /Users/kpburson/.codex/worktrees/aitm-plan-1725-xpr/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/plan-1725/XPR-recovery-1/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-review-4d4e16e8bd7e905c119172c9a95f4079/review-4d4e16e8bd7e905c119172c9a95f4079-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/aitm-plan-1725-xpr/ai-task-manager/.scratch/peer-review/review-4d4e16e8bd7e905c119172c9a95f4079`
