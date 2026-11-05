<!-- ai-peer-review-template version="1" digest="sha256:67647a97b95d0d88ad485fdc636134e56a7bf2688c4aab40d4acdfdcac1a98af" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vcHJvamVjdHMvVmliZS1Db2RpbmcvYWktcGVlci1yZXZpZXctd29ya3RyZWVzLzU2LW1hY29zLWJyb2tlci1lbmRwb2ludC9kb2NzL2Rlc2lnbi8yMDI2LTA5LTE0LTU2LW1hY29zLWJyb2tlci1lbmRwb2ludC1kZXNpZ24ubWQiLAogICJyZXNwb25zZSI6ICIvVXNlcnMva3BidXJzb24vcHJvamVjdHMvVmliZS1Db2RpbmcvYWktcGVlci1yZXZpZXctd29ya3RyZWVzLzU2LW1hY29zLWJyb2tlci1lbmRwb2ludC9kb2NzL3BlZXItcmV2aWV3cy9zcGVjLzIwMjYtMDktMTktMjAyNi0wOS0xNC01Ni1tYWNvcy1icm9rZXItZW5kcG9pbnQtZGVzaWduLXJldmlldy1hYzNlMzVjMzJiMDJjYzM2ZGJiZjViZWJiMjBjMGE3MC9yZXZpZXctYWMzZTM1YzMyYjAyY2MzNmRiYmY1YmViYjIwYzBhNzAtcmV2aWV3ZXItcmVzcG9uc2UtMS5tZCIsCiAgInJldmlld19pZCI6ICJyZXZpZXctYWMzZTM1YzMyYjAyY2MzNmRiYmY1YmViYjIwYzBhNzAiLAogICJzY2hlbWEiOiAiYWktcGVlci1yZXZpZXcuaW52aXRhdGlvbi1yb3V0aW5nL3YxIiwKICAid29ya3NwYWNlIjogIi9Vc2Vycy9rcGJ1cnNvbi9wcm9qZWN0cy9WaWJlLUNvZGluZy9haS1wZWVyLXJldmlldy13b3JrdHJlZXMvNTYtbWFjb3MtYnJva2VyLWVuZHBvaW50Ly5zY3JhdGNoL3BlZXItcmV2aWV3L3Jldmlldy1hYzNlMzVjMzJiMDJjYzM2ZGJiZjViZWJiMjBjMGE3MCIKfQo" -->

# Reviewer invitation

Review: `review-ac3e35c32b02cc36dbbf5bebb20c0a70`

Mode: `normal`

- Artifact: `/Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/56-macos-broker-endpoint/docs/design/2026-09-14-56-macos-broker-endpoint-design.md`
- Workspace: `/Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/56-macos-broker-endpoint/.scratch/peer-review/review-ac3e35c32b02cc36dbbf5bebb20c0a70`
- Response: `/Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/56-macos-broker-endpoint/docs/peer-reviews/spec/2026-09-19-2026-09-14-56-macos-broker-endpoint-design-review-ac3e35c32b02cc36dbbf5bebb20c0a70/review-ac3e35c32b02cc36dbbf5bebb20c0a70-reviewer-response-1.md`
- Invitation: `/Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/56-macos-broker-endpoint/docs/peer-reviews/spec/2026-09-19-2026-09-14-56-macos-broker-endpoint-design-review-ac3e35c32b02cc36dbbf5bebb20c0a70/review-ac3e35c32b02cc36dbbf5bebb20c0a70-reviewer-invitation.md`

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

Installed join: `peer-review join /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/56-macos-broker-endpoint/docs/peer-reviews/spec/2026-09-19-2026-09-14-56-macos-broker-endpoint-design-review-ac3e35c32b02cc36dbbf5bebb20c0a70/review-ac3e35c32b02cc36dbbf5bebb20c0a70-reviewer-invitation.md`

Zero-install join: `npx --yes @kburson/ai-peer-review@0.2.2 join /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/56-macos-broker-endpoint/docs/peer-reviews/spec/2026-09-19-2026-09-14-56-macos-broker-endpoint-design-review-ac3e35c32b02cc36dbbf5bebb20c0a70/review-ac3e35c32b02cc36dbbf5bebb20c0a70-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/56-macos-broker-endpoint/.scratch/peer-review/review-ac3e35c32b02cc36dbbf5bebb20c0a70`
