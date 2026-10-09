<!-- ai-peer-review-template version="1" digest="sha256:064952674640611160aff00e947b64de060d4a4cfe7139019eb0f24ee264aa25" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy8xOTM5LXBsYW5uaW5nLXJlY292ZXJ5L2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3BsYW5zLzIwMjYtMTAtMDktMTkzOS1hcnRpZmFjdC1yZWZlcmVuY2VzLXJldmlldy1yZWNvcmRzLm1kIiwKICAicmVzcG9uc2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvMTkzOS1wbGFubmluZy1yZWNvdmVyeS9haS10YXNrLW1hbmFnZXIvZG9jcy9wZWVyLXJldmlld3MvMTkzOS9wbGFuL3Nwci9wbGFuLzIwMjYtMTAtMDktMjAyNi0xMC0wOS0xOTM5LWFydGlmYWN0LXJlZmVyZW5jZXMtcmV2aWV3LXJlY29yZHMtcmV2aWV3LTlkYmY0Mzk5Mzk4NTc2NGU3ZGVkMjMyYTliZjE5ODA2L3Jldmlldy05ZGJmNDM5OTM5ODU3NjRlN2RlZDIzMmE5YmYxOTgwNi1yZXZpZXdlci1yZXNwb25zZS0xLm1kIiwKICAicmV2aWV3X2lkIjogInJldmlldy05ZGJmNDM5OTM5ODU3NjRlN2RlZDIzMmE5YmYxOTgwNiIsCiAgInNjaGVtYSI6ICJhaS1wZWVyLXJldmlldy5pbnZpdGF0aW9uLXJvdXRpbmcvdjEiLAogICJ3b3Jrc3BhY2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvMTkzOS1wbGFubmluZy1yZWNvdmVyeS9haS10YXNrLW1hbmFnZXIvLnNjcmF0Y2gvcGVlci1yZXZpZXcvcmV2aWV3LTlkYmY0Mzk5Mzk4NTc2NGU3ZGVkMjMyYTliZjE5ODA2Igp9Cg" -->

# Reviewer invitation

Review: `review-9dbf43993985764e7ded232a9bf19806`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/1939-planning-recovery/ai-task-manager/docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md`
- Workspace: `/Users/kpburson/.codex/worktrees/1939-planning-recovery/ai-task-manager/.scratch/peer-review/review-9dbf43993985764e7ded232a9bf19806`
- Response: `/Users/kpburson/.codex/worktrees/1939-planning-recovery/ai-task-manager/docs/peer-reviews/1939/plan/spr/plan/2026-10-09-2026-10-09-1939-artifact-references-review-records-review-9dbf43993985764e7ded232a9bf19806/review-9dbf43993985764e7ded232a9bf19806-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/1939-planning-recovery/ai-task-manager/docs/peer-reviews/1939/plan/spr/plan/2026-10-09-2026-10-09-1939-artifact-references-review-records-review-9dbf43993985764e7ded232a9bf19806/review-9dbf43993985764e7ded232a9bf19806-reviewer-invitation.md`
- Reviewer: `gpt-6-astra` (`gpt-6-astra`), effort: `medium`
- Runtime: SPR, project-local broker

## Communication policy (v1)

Keep all peer-review chat messages terse. Put complete review analysis, findings, dispositions, revised prose, rationale, decisions, and verification evidence in the generated durable review documents.

Chat may contain only:

- a short operational status;
- a pointer to the relevant durable document;
- the exact next action; or
- a concise blocker requiring human action.

Read the relevant durable reviewer or author response document; do not rely on a chat summary. Do not paste findings, dispositions, revised prose, verification output, or other durable document content into chat unless the human explicitly requests it.

“Terse chat” does not mean terse review evidence. Durable reviewer and author response documents remain complete, self-contained, and authoritative.

## Project-local broker and recovery

Phased sessions remain event-authoritative. After a non-final acceptance, the registered author finalizes and advances the exact next artifact; resume only from the generated reviewer response and never infer or skip a phase from chat.

When the project-local broker is active, yield after each handoff; do not poll or repeat wait calls. Inspect `peer-review broker status --json` for authenticated instance state. After a failure, preserve receipts and run `peer-review broker reconcile /Users/kpburson/.codex/worktrees/1939-planning-recovery/ai-task-manager/.scratch/peer-review/review-9dbf43993985764e7ded232a9bf19806 --json` only when the exact recovery evidence calls for it. A broker failure never silently changes the selected reviewer or transport. If the broker is unavailable for an existing manual review, use the bounded `peer-review status /Users/kpburson/.codex/worktrees/1939-planning-recovery/ai-task-manager/.scratch/peer-review/review-9dbf43993985764e7ded232a9bf19806 --next` recovery path.

Role: reviewer. Join from a distinct session in the same physical worktree.

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/1939-planning-recovery/ai-task-manager/docs/peer-reviews/1939/plan/spr/plan/2026-10-09-2026-10-09-1939-artifact-references-review-records-review-9dbf43993985764e7ded232a9bf19806/review-9dbf43993985764e7ded232a9bf19806-reviewer-invitation.md`

Installed-package join: `npx --no-install ai-peer-review join /Users/kpburson/.codex/worktrees/1939-planning-recovery/ai-task-manager/docs/peer-reviews/1939/plan/spr/plan/2026-10-09-2026-10-09-1939-artifact-references-review-records-review-9dbf43993985764e7ded232a9bf19806/review-9dbf43993985764e7ded232a9bf19806-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/1939-planning-recovery/ai-task-manager/.scratch/peer-review/review-9dbf43993985764e7ded232a9bf19806`
