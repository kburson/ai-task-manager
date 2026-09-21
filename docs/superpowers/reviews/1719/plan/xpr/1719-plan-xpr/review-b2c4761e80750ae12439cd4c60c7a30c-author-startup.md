<!-- ai-peer-review-template version="1" digest="sha256:080e2f0f432cd6b2da0afe97442967302141df613a1bc47980a3f57570fedb2b" -->

# Author startup

Review: `review-b2c4761e80750ae12439cd4c60c7a30c`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/df88/ai-task-manager/docs/superpowers/plans/2026-09-21-1719-story-token-cost.md`
- Workspace: `/Users/kpburson/.codex/worktrees/df88/ai-task-manager/.scratch/peer-review/review-b2c4761e80750ae12439cd4c60c7a30c`
- Response: `/Users/kpburson/.codex/worktrees/df88/ai-task-manager/docs/superpowers/reviews/1719/plan/xpr/1719-plan-xpr/review-b2c4761e80750ae12439cd4c60c7a30c-reviewer-response-1.md`
- Reviewer invitation: `/Users/kpburson/.codex/worktrees/df88/ai-task-manager/docs/superpowers/reviews/1719/plan/xpr/1719-plan-xpr/review-b2c4761e80750ae12439cd4c60c7a30c-reviewer-invitation.md`

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

Phased sessions remain event-authoritative. After a non-final acceptance, finalize the current artifact and follow the single `peer-review advance <workspace> <artifact>` action emitted by `status --next`; never infer or skip a phase from chat.

When the host reports that the durable coordinator is active, yield after each handoff. The coordinator sleeps outside participant context and wakes only the exact configured session for an actionable protocol revision; do not poll or repeat wait calls. If durable wake is unavailable, use only the bounded manual fallback `peer-review status <workspace> --next`.

Installed help: `peer-review status --help`

Zero-install help: `npx --yes @kburson/ai-peer-review@0.2.2 status --help`
