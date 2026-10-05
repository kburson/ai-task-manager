<!-- ai-peer-review-template version="1" digest="sha256:064952674640611160aff00e947b64de060d4a4cfe7139019eb0f24ee264aa25" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy8xODU3LWFydGlmYWN0LXdyaXRlcy9haS10YXNrLW1hbmFnZXIvZG9jcy9zdXBlcnBvd2Vycy9zcGVjcy8yMDI2LTA5LTMwLTE4NTctZHVyYWJsZS1ydW50aW1lLWNsZWFudXAtZGVzaWduLm1kIiwKICAicmVzcG9uc2UiOiAiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvMTg1Ny1hcnRpZmFjdC13cml0ZXMvYWktdGFzay1tYW5hZ2VyL2RvY3MvcmV2aWV3cy8xODU3LWV4cGFuZGVkL3NwZWMvMjAyNi0wOS0zMC0yMDI2LTA5LTMwLTE4NTctZHVyYWJsZS1ydW50aW1lLWNsZWFudXAtZGVzaWduLXJldmlldy1hNTdmYjU2NzI4MjgxZjYyMTMxODViYmZiZjdmNDk2NC9yZXZpZXctYTU3ZmI1NjcyODI4MWY2MjEzMTg1YmJmYmY3ZjQ5NjQtcmV2aWV3ZXItcmVzcG9uc2UtMS5tZCIsCiAgInJldmlld19pZCI6ICJyZXZpZXctYTU3ZmI1NjcyODI4MWY2MjEzMTg1YmJmYmY3ZjQ5NjQiLAogICJzY2hlbWEiOiAiYWktcGVlci1yZXZpZXcuaW52aXRhdGlvbi1yb3V0aW5nL3YxIiwKICAid29ya3NwYWNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzLzE4NTctYXJ0aWZhY3Qtd3JpdGVzL2FpLXRhc2stbWFuYWdlci8uc2NyYXRjaC9wZWVyLXJldmlldy9yZXZpZXctYTU3ZmI1NjcyODI4MWY2MjEzMTg1YmJmYmY3ZjQ5NjQiCn0K" -->

# Reviewer invitation

Review: `review-a57fb56728281f6213185bbfbf7f4964`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md`
- Workspace: `/Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/.scratch/peer-review/review-a57fb56728281f6213185bbfbf7f4964`
- Response: `/Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/docs/reviews/1857-expanded/spec/2026-09-30-2026-09-30-1857-durable-runtime-cleanup-design-review-a57fb56728281f6213185bbfbf7f4964/review-a57fb56728281f6213185bbfbf7f4964-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/docs/reviews/1857-expanded/spec/2026-09-30-2026-09-30-1857-durable-runtime-cleanup-design-review-a57fb56728281f6213185bbfbf7f4964/review-a57fb56728281f6213185bbfbf7f4964-reviewer-invitation.md`
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

When the project-local broker is active, yield after each handoff; do not poll or repeat wait calls. Inspect `peer-review broker status --json` for authenticated instance state. After a failure, preserve receipts and run `peer-review broker reconcile /Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/.scratch/peer-review/review-a57fb56728281f6213185bbfbf7f4964 --json` only when the exact recovery evidence calls for it. A broker failure never silently changes the selected reviewer or transport. If the broker is unavailable for an existing manual review, use the bounded `peer-review status /Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/.scratch/peer-review/review-a57fb56728281f6213185bbfbf7f4964 --next` recovery path.

Role: reviewer. Join from a distinct session in the same physical worktree.

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/docs/reviews/1857-expanded/spec/2026-09-30-2026-09-30-1857-durable-runtime-cleanup-design-review-a57fb56728281f6213185bbfbf7f4964/review-a57fb56728281f6213185bbfbf7f4964-reviewer-invitation.md`

Installed-package join: `npx --no-install ai-peer-review join /Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/docs/reviews/1857-expanded/spec/2026-09-30-2026-09-30-1857-durable-runtime-cleanup-design-review-a57fb56728281f6213185bbfbf7f4964/review-a57fb56728281f6213185bbfbf7f4964-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/1857-artifact-writes/ai-task-manager/.scratch/peer-review/review-a57fb56728281f6213185bbfbf7f4964`
