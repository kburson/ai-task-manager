<!-- ai-peer-review-template version="1" digest="sha256:67647a97b95d0d88ad485fdc636134e56a7bf2688c4aab40d4acdfdcac1a98af" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy8xYzc2L2FpLXBlZXItcmV2aWV3Ly5zY3JhdGNoL3Jldmlldy1yZWNvdmVyeS1jbG9uZS9kb2NzL3BsYW5zLzIwMjYtMDktMTQtcHJvamVjdC1sb2NhbC1zcHIteHByLWJyb2tlci5tZCIsCiAgInJlc3BvbnNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzLzFjNzYvYWktcGVlci1yZXZpZXcvLnNjcmF0Y2gvcmV2aWV3LXJlY292ZXJ5LWNsb25lL2RvY3MvcGVlci1yZXZpZXdzL3BsYW4vMjAyNi0wOS0xNC0yMDI2LTA5LTE0LXByb2plY3QtbG9jYWwtc3ByLXhwci1icm9rZXItcmV2aWV3LWE1MTE2Y2YyYWE2NjhjMzEzMmFlMmIyZWU3MDE2MzY2LXJlY292ZXJ5LTEvcmV2aWV3LTQxZmUwMGJjNjQ0ZDMwZGUyMTA4MTQ1MTRlNzdiOTI0LXJldmlld2VyLXJlc3BvbnNlLTEubWQiLAogICJyZXZpZXdfaWQiOiAicmV2aWV3LTQxZmUwMGJjNjQ0ZDMwZGUyMTA4MTQ1MTRlNzdiOTI0IiwKICAic2NoZW1hIjogImFpLXBlZXItcmV2aWV3Lmludml0YXRpb24tcm91dGluZy92MSIsCiAgIndvcmtzcGFjZSI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy8xYzc2L2FpLXBlZXItcmV2aWV3Ly5zY3JhdGNoL3Jldmlldy1yZWNvdmVyeS1jbG9uZS8uc2NyYXRjaC9wZWVyLXJldmlldy9yZXZpZXctNDFmZTAwYmM2NDRkMzBkZTIxMDgxNDUxNGU3N2I5MjQiCn0K" -->

# Reviewer invitation

Review: `review-41fe00bc644d30de210814514e77b924`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/1c76/ai-peer-review/.scratch/review-recovery-clone/docs/plans/2026-09-14-project-local-spr-xpr-broker.md`
- Workspace: `/Users/kpburson/.codex/worktrees/1c76/ai-peer-review/.scratch/review-recovery-clone/.scratch/peer-review/review-41fe00bc644d30de210814514e77b924`
- Response: `/Users/kpburson/.codex/worktrees/1c76/ai-peer-review/.scratch/review-recovery-clone/docs/peer-reviews/plan/2026-09-14-2026-09-14-project-local-spr-xpr-broker-review-a5116cf2aa668c3132ae2b2ee7016366-recovery-1/review-41fe00bc644d30de210814514e77b924-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/1c76/ai-peer-review/.scratch/review-recovery-clone/docs/peer-reviews/plan/2026-09-14-2026-09-14-project-local-spr-xpr-broker-review-a5116cf2aa668c3132ae2b2ee7016366-recovery-1/review-41fe00bc644d30de210814514e77b924-reviewer-invitation.md`

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

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/1c76/ai-peer-review/.scratch/review-recovery-clone/docs/peer-reviews/plan/2026-09-14-2026-09-14-project-local-spr-xpr-broker-review-a5116cf2aa668c3132ae2b2ee7016366-recovery-1/review-41fe00bc644d30de210814514e77b924-reviewer-invitation.md`

Zero-install join: `npx --yes ai-peer-review@0.2.2 join /Users/kpburson/.codex/worktrees/1c76/ai-peer-review/.scratch/review-recovery-clone/docs/peer-reviews/plan/2026-09-14-2026-09-14-project-local-spr-xpr-broker-review-a5116cf2aa668c3132ae2b2ee7016366-recovery-1/review-41fe00bc644d30de210814514e77b924-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/1c76/ai-peer-review/.scratch/review-recovery-clone/.scratch/peer-review/review-41fe00bc644d30de210814514e77b924`
