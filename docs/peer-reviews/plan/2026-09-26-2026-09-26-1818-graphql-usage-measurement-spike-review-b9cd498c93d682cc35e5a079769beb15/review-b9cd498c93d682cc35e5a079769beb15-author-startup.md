<!-- ai-peer-review-template version="1" digest="sha256:19ffedd45cc89730c41b5fc6fc80931986ec73850cc5212040204307170085e4" -->

# Author startup

Review: `review-b9cd498c93d682cc35e5a079769beb15`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/9f45/ai-task-manager/docs/superpowers/plans/2026-09-26-1818-graphql-usage-measurement-spike.md`
- Workspace: `/Users/kpburson/.codex/worktrees/9f45/ai-task-manager/.scratch/peer-review/review-b9cd498c93d682cc35e5a079769beb15`
- Response: `/Users/kpburson/.codex/worktrees/9f45/ai-task-manager/docs/peer-reviews/plan/2026-09-26-2026-09-26-1818-graphql-usage-measurement-spike-review-b9cd498c93d682cc35e5a079769beb15/review-b9cd498c93d682cc35e5a079769beb15-reviewer-response-1.md`
- Reviewer invitation: `/Users/kpburson/.codex/worktrees/9f45/ai-task-manager/docs/peer-reviews/plan/2026-09-26-2026-09-26-1818-graphql-usage-measurement-spike-review-b9cd498c93d682cc35e5a079769beb15/review-b9cd498c93d682cc35e5a079769beb15-reviewer-invitation.md`

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

Zero-install help: `npx --yes ai-peer-review@0.2.2 status --help`
