<!-- ai-peer-review-template version="1" digest="sha256:064952674640611160aff00e947b64de060d4a4cfe7139019eb0f24ee264aa25" -->
<!-- ai-peer-review-invitation data="ewogICJhcnRpZmFjdCI6ICIvVXNlcnMva3BidXJzb24vLmNvZGV4L3dvcmt0cmVlcy84ZGFlL2FpLXRhc2stbWFuYWdlci9kb2NzL3N1cGVycG93ZXJzL3NwZWNzLzIwMjYtMTAtMDItMTg2MS1leHBsaWNpdC1lbXB0eS1ydW50aW1lLWRlc2lnbi5tZCIsCiAgInJlc3BvbnNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzLzhkYWUvYWktdGFzay1tYW5hZ2VyL2RvY3Mvc3VwZXJwb3dlcnMvcmV2aWV3cy8xODYxLWVtcHR5LXJ1bnRpbWUtYW1lbmRtZW50LXhwci9zcGVjLzIwMjYtMTAtMDMtMjAyNi0xMC0wMi0xODYxLWV4cGxpY2l0LWVtcHR5LXJ1bnRpbWUtZGVzaWduLXJldmlldy1mOTc3YTk4M2FjNGM4OGJjNmQyOGFjZTM4MDUwNGRiNC9yZXZpZXctZjk3N2E5ODNhYzRjODhiYzZkMjhhY2UzODA1MDRkYjQtcmV2aWV3ZXItcmVzcG9uc2UtMS5tZCIsCiAgInJldmlld19pZCI6ICJyZXZpZXctZjk3N2E5ODNhYzRjODhiYzZkMjhhY2UzODA1MDRkYjQiLAogICJzY2hlbWEiOiAiYWktcGVlci1yZXZpZXcuaW52aXRhdGlvbi1yb3V0aW5nL3YxIiwKICAid29ya3NwYWNlIjogIi9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzLzhkYWUvYWktdGFzay1tYW5hZ2VyLy5zY3JhdGNoL3BlZXItcmV2aWV3L3Jldmlldy1mOTc3YTk4M2FjNGM4OGJjNmQyOGFjZTM4MDUwNGRiNCIKfQo" -->

# Reviewer invitation

Review: `review-f977a983ac4c88bc6d28ace380504db4`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/8dae/ai-task-manager/docs/superpowers/specs/2026-10-02-1861-explicit-empty-runtime-design.md`
- Workspace: `/Users/kpburson/.codex/worktrees/8dae/ai-task-manager/.scratch/peer-review/review-f977a983ac4c88bc6d28ace380504db4`
- Response: `/Users/kpburson/.codex/worktrees/8dae/ai-task-manager/docs/superpowers/reviews/1861-empty-runtime-amendment-xpr/spec/2026-10-03-2026-10-02-1861-explicit-empty-runtime-design-review-f977a983ac4c88bc6d28ace380504db4/review-f977a983ac4c88bc6d28ace380504db4-reviewer-response-1.md`
- Invitation: `/Users/kpburson/.codex/worktrees/8dae/ai-task-manager/docs/superpowers/reviews/1861-empty-runtime-amendment-xpr/spec/2026-10-03-2026-10-02-1861-explicit-empty-runtime-design-review-f977a983ac4c88bc6d28ace380504db4/review-f977a983ac4c88bc6d28ace380504db4-reviewer-invitation.md`
- Reviewer: `claude-opus-5-5` (`claude-opus-5-5`), effort: `high`
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

When the project-local broker is active, yield after each handoff; do not poll or repeat wait calls. Inspect `peer-review broker status --json` for authenticated instance state. After a failure, preserve receipts and run `peer-review broker reconcile /Users/kpburson/.codex/worktrees/8dae/ai-task-manager/.scratch/peer-review/review-f977a983ac4c88bc6d28ace380504db4 --json` only when the exact recovery evidence calls for it. A broker failure never silently changes the selected reviewer or transport. If the broker is unavailable for an existing manual review, use the bounded `peer-review status /Users/kpburson/.codex/worktrees/8dae/ai-task-manager/.scratch/peer-review/review-f977a983ac4c88bc6d28ace380504db4 --next` recovery path.

Role: reviewer. Join from a distinct session in the same physical worktree.

Installed join: `peer-review join /Users/kpburson/.codex/worktrees/8dae/ai-task-manager/docs/superpowers/reviews/1861-empty-runtime-amendment-xpr/spec/2026-10-03-2026-10-02-1861-explicit-empty-runtime-design-review-f977a983ac4c88bc6d28ace380504db4/review-f977a983ac4c88bc6d28ace380504db4-reviewer-invitation.md`

Installed-package join: `npx --no-install ai-peer-review join /Users/kpburson/.codex/worktrees/8dae/ai-task-manager/docs/superpowers/reviews/1861-empty-runtime-amendment-xpr/spec/2026-10-03-2026-10-02-1861-explicit-empty-runtime-design-review-f977a983ac4c88bc6d28ace380504db4/review-f977a983ac4c88bc6d28ace380504db4-reviewer-invitation.md`

Rules of engagement:

- Edit only the exact pending reviewer response shown above.
- Do not edit the reviewed artifact, create commits, or push.
- Query `peer-review help join` instead of guessing command syntax.

Recovery: `peer-review resume /Users/kpburson/.codex/worktrees/8dae/ai-task-manager/.scratch/peer-review/review-f977a983ac4c88bc6d28ace380504db4`
