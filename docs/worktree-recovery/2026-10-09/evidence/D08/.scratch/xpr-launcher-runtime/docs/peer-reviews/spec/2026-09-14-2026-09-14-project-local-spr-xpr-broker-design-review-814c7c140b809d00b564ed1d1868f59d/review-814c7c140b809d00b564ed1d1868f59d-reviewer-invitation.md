<!-- ai-peer-review-template version="1" digest="sha256:67647a97b95d0d88ad485fdc636134e56a7bf2688c4aab40d4acdfdcac1a98af" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vcHJvamVjdHMvVmliZS1Db2RpbmcvYWktcGVlci1yZXZpZXcvZG9jcy9kZXNpZ24vMjAyNi0wOS0xNC1wcm9qZWN0LWxvY2FsLXNwci14cHItYnJva2VyLWRlc2lnbi5tZCIsCiAgInJlc3BvbnNlIjogIi9Vc2Vycy9rcGJ1cnNvbi9wcm9qZWN0cy9WaWJlLUNvZGluZy9haS1wZWVyLXJldmlldy9kb2NzL3BlZXItcmV2aWV3cy9zcGVjLzIwMjYtMDktMTQtMjAyNi0wOS0xNC1wcm9qZWN0LWxvY2FsLXNwci14cHItYnJva2VyLWRlc2lnbi1yZXZpZXctODE0YzdjMTQwYjgwOWQwMGI1NjRlZDFkMTg2OGY1OWQvcmV2aWV3LTgxNGM3YzE0MGI4MDlkMDBiNTY0ZWQxZDE4NjhmNTlkLXJldmlld2VyLXJlc3BvbnNlLTEubWQiLAogICJyZXZpZXdfaWQiOiAicmV2aWV3LTgxNGM3YzE0MGI4MDlkMDBiNTY0ZWQxZDE4NjhmNTlkIiwKICAic2NoZW1hIjogImFpLXBlZXItcmV2aWV3Lmludml0YXRpb24tcm91dGluZy92MSIsCiAgIndvcmtzcGFjZSI6ICIvVXNlcnMva3BidXJzb24vcHJvamVjdHMvVmliZS1Db2RpbmcvYWktcGVlci1yZXZpZXcvLnNjcmF0Y2gvcGVlci1yZXZpZXcvcmV2aWV3LTgxNGM3YzE0MGI4MDlkMDBiNTY0ZWQxZDE4NjhmNTlkIgp9Cg" -->

# Reviewer invitation

Review: `review-814c7c140b809d00b564ed1d1868f59d`

Mode: `normal`

- Artifact: `/Users/kpburson/projects/Vibe-Coding/ai-peer-review/docs/design/2026-09-14-project-local-spr-xpr-broker-design.md`
- Workspace: `/Users/kpburson/projects/Vibe-Coding/ai-peer-review/.scratch/peer-review/review-814c7c140b809d00b564ed1d1868f59d`
- Response: `/Users/kpburson/projects/Vibe-Coding/ai-peer-review/docs/peer-reviews/spec/2026-09-14-2026-09-14-project-local-spr-xpr-broker-design-review-814c7c140b809d00b564ed1d1868f59d/review-814c7c140b809d00b564ed1d1868f59d-reviewer-response-1.md`
- Invitation: `/Users/kpburson/projects/Vibe-Coding/ai-peer-review/docs/peer-reviews/spec/2026-09-14-2026-09-14-project-local-spr-xpr-broker-design-review-814c7c140b809d00b564ed1d1868f59d/review-814c7c140b809d00b564ed1d1868f59d-reviewer-invitation.md`

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

Installed join: `peer-review join /Users/kpburson/projects/Vibe-Coding/ai-peer-review/docs/peer-reviews/spec/2026-09-14-2026-09-14-project-local-spr-xpr-broker-design-review-814c7c140b809d00b564ed1d1868f59d/review-814c7c140b809d00b564ed1d1868f59d-reviewer-invitation.md`

Zero-install join: `npx --yes ai-peer-review@0.2.2 join /Users/kpburson/projects/Vibe-Coding/ai-peer-review/docs/peer-reviews/spec/2026-09-14-2026-09-14-project-local-spr-xpr-broker-design-review-814c7c140b809d00b564ed1d1868f59d/review-814c7c140b809d00b564ed1d1868f59d-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/projects/Vibe-Coding/ai-peer-review/.scratch/peer-review/review-814c7c140b809d00b564ed1d1868f59d`
