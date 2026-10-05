<!-- ai-peer-review-template version="1" digest="sha256:064952674640611160aff00e947b64de060d4a4cfe7139019eb0f24ee264aa25" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy9kZWZlY3QtMTg1OS1zcGVjL2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3BsYW5zLzIwMjYtMTAtMDEtMTg1OS1yZXZpZXdlZC1zY29wZS1ldmlkZW5jZS5tZCIsCiAgInJlc3BvbnNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzL2RlZmVjdC0xODU5LXNwZWMvYWktdGFzay1tYW5hZ2VyL2RvY3Mvc3VwZXJwb3dlcnMvcmV2aWV3cy8xODU5L3BsYW4vWFBSL3BsYW4vMjAyNi0xMC0wMS0yMDI2LTEwLTAxLTE4NTktcmV2aWV3ZWQtc2NvcGUtZXZpZGVuY2UtcmV2aWV3LWUyNDFmNmNhMDJhYmYxMzE0MjU0YzYzNDkxMDQ5ZTI0L3Jldmlldy1lMjQxZjZjYTAyYWJmMTMxNDI1NGM2MzQ5MTA0OWUyNC1yZXZpZXdlci1yZXNwb25zZS0xLm1kIiwKICAicmV2aWV3X2lkIjogInJldmlldy1lMjQxZjZjYTAyYWJmMTMxNDI1NGM2MzQ5MTA0OWUyNCIsCiAgInNjaGVtYSI6ICJhaS1wZWVyLXJldmlldy5pbnZpdGF0aW9uLXJvdXRpbmcvdjEiLAogICJ3b3Jrc3BhY2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvZGVmZWN0LTE4NTktc3BlYy9haS10YXNrLW1hbmFnZXIvLnNjcmF0Y2gvcGVlci1yZXZpZXcvcmV2aWV3LWUyNDFmNmNhMDJhYmYxMzE0MjU0YzYzNDkxMDQ5ZTI0Igp9Cg" -->

# Reviewer invitation

Review: `review-e241f6ca02abf1314254c63491049e24`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/defect-1859-spec/ai-task-manager/docs/superpowers/plans/2026-10-01-1859-reviewed-scope-evidence.md`
- Workspace: `/Users/kpburson/.codex/worktrees/defect-1859-spec/ai-task-manager/.scratch/peer-review/review-e241f6ca02abf1314254c63491049e24`
- Response: `/Users/kpburson/.codex/worktrees/defect-1859-spec/ai-task-manager/docs/superpowers/reviews/1859/plan/XPR/plan/2026-10-01-2026-10-01-1859-reviewed-scope-evidence-review-e241f6ca02abf1314254c63491049e24/review-e241f6ca02abf1314254c63491049e24-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/defect-1859-spec/ai-task-manager/docs/superpowers/reviews/1859/plan/XPR/plan/2026-10-01-2026-10-01-1859-reviewed-scope-evidence-review-e241f6ca02abf1314254c63491049e24/review-e241f6ca02abf1314254c63491049e24-reviewer-invitation.md`
- Reviewer: `claude-opus-5-5` (`claude-opus-5-5`), effort: `medium`
- Runtime: XPR, project-local broker

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

When the project-local broker is active, yield after each handoff; do not poll or repeat wait calls. Inspect `peer-review broker status --json` for authenticated instance state. After a failure, preserve receipts and run `peer-review broker reconcile /Users/kpburson/.codex/worktrees/defect-1859-spec/ai-task-manager/.scratch/peer-review/review-e241f6ca02abf1314254c63491049e24 --json` only when the exact recovery evidence calls for it. A broker failure never silently changes the selected reviewer or transport. If the broker is unavailable for an existing manual review, use the bounded `peer-review status /Users/kpburson/.codex/worktrees/defect-1859-spec/ai-task-manager/.scratch/peer-review/review-e241f6ca02abf1314254c63491049e24 --next` recovery path.

Role: reviewer. Join from a distinct session in the same physical worktree.

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/defect-1859-spec/ai-task-manager/docs/superpowers/reviews/1859/plan/XPR/plan/2026-10-01-2026-10-01-1859-reviewed-scope-evidence-review-e241f6ca02abf1314254c63491049e24/review-e241f6ca02abf1314254c63491049e24-reviewer-invitation.md`

Installed-package join: `npx --no-install ai-peer-review join /Users/kpburson/.codex/worktrees/defect-1859-spec/ai-task-manager/docs/superpowers/reviews/1859/plan/XPR/plan/2026-10-01-2026-10-01-1859-reviewed-scope-evidence-review-e241f6ca02abf1314254c63491049e24/review-e241f6ca02abf1314254c63491049e24-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/defect-1859-spec/ai-task-manager/.scratch/peer-review/review-e241f6ca02abf1314254c63491049e24`
