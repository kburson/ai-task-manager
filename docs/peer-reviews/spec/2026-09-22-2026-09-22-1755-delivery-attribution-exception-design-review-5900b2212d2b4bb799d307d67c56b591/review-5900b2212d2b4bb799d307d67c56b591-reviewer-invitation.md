<!-- ai-peer-review-template version="1" digest="sha256:67647a97b95d0d88ad485fdc636134e56a7bf2688c4aab40d4acdfdcac1a98af" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vcHJvamVjdHMvVmliZS1Db2RpbmcvYWktdGFzay1tYW5hZ2VyLy53b3JrdHJlZXMvMTc1NS1kZWxpdmVyeS1hdHRyaWJ1dGlvbi1leGNlcHRpb24vZG9jcy9zdXBlcnBvd2Vycy9zcGVjcy8yMDI2LTA5LTIyLTE3NTUtZGVsaXZlcnktYXR0cmlidXRpb24tZXhjZXB0aW9uLWRlc2lnbi5tZCIsCiAgInJlc3BvbnNlIjogIi9Vc2Vycy9rcGJ1cnNvbi9wcm9qZWN0cy9WaWJlLUNvZGluZy9haS10YXNrLW1hbmFnZXIvLndvcmt0cmVlcy8xNzU1LWRlbGl2ZXJ5LWF0dHJpYnV0aW9uLWV4Y2VwdGlvbi9kb2NzL3BlZXItcmV2aWV3cy9zcGVjLzIwMjYtMDktMjItMjAyNi0wOS0yMi0xNzU1LWRlbGl2ZXJ5LWF0dHJpYnV0aW9uLWV4Y2VwdGlvbi1kZXNpZ24tcmV2aWV3LTU5MDBiMjIxMmQyYjRiYjc5OWQzMDdkNjdjNTZiNTkxL3Jldmlldy01OTAwYjIyMTJkMmI0YmI3OTlkMzA3ZDY3YzU2YjU5MS1yZXZpZXdlci1yZXNwb25zZS0xLm1kIiwKICAicmV2aWV3X2lkIjogInJldmlldy01OTAwYjIyMTJkMmI0YmI3OTlkMzA3ZDY3YzU2YjU5MSIsCiAgInNjaGVtYSI6ICJhaS1wZWVyLXJldmlldy5pbnZpdGF0aW9uLXJvdXRpbmcvdjEiLAogICJ3b3Jrc3BhY2UiOiAiL1VzZXJzL2twYnVyc29uL3Byb2plY3RzL1ZpYmUtQ29kaW5nL2FpLXRhc2stbWFuYWdlci8ud29ya3RyZWVzLzE3NTUtZGVsaXZlcnktYXR0cmlidXRpb24tZXhjZXB0aW9uLy5zY3JhdGNoL3BlZXItcmV2aWV3L3Jldmlldy01OTAwYjIyMTJkMmI0YmI3OTlkMzA3ZDY3YzU2YjU5MSIKfQo" -->

# Reviewer invitation

Review: `review-5900b2212d2b4bb799d307d67c56b591`

Mode: `normal`

- Artifact: `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1755-delivery-attribution-exception/docs/superpowers/specs/2026-09-22-1755-delivery-attribution-exception-design.md`
- Workspace: `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1755-delivery-attribution-exception/.scratch/peer-review/review-5900b2212d2b4bb799d307d67c56b591`
- Response: `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1755-delivery-attribution-exception/docs/peer-reviews/spec/2026-09-22-2026-09-22-1755-delivery-attribution-exception-design-review-5900b2212d2b4bb799d307d67c56b591/review-5900b2212d2b4bb799d307d67c56b591-reviewer-response-1.md`
- Invitation: `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1755-delivery-attribution-exception/docs/peer-reviews/spec/2026-09-22-2026-09-22-1755-delivery-attribution-exception-design-review-5900b2212d2b4bb799d307d67c56b591/review-5900b2212d2b4bb799d307d67c56b591-reviewer-invitation.md`

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

Installed join: `peer-review join /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1755-delivery-attribution-exception/docs/peer-reviews/spec/2026-09-22-2026-09-22-1755-delivery-attribution-exception-design-review-5900b2212d2b4bb799d307d67c56b591/review-5900b2212d2b4bb799d307d67c56b591-reviewer-invitation.md`

Zero-install join: `npx --yes ai-peer-review@0.2.2 join /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1755-delivery-attribution-exception/docs/peer-reviews/spec/2026-09-22-2026-09-22-1755-delivery-attribution-exception-design-review-5900b2212d2b4bb799d307d67c56b591/review-5900b2212d2b4bb799d307d67c56b591-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1755-delivery-attribution-exception/.scratch/peer-review/review-5900b2212d2b4bb799d307d67c56b591`
