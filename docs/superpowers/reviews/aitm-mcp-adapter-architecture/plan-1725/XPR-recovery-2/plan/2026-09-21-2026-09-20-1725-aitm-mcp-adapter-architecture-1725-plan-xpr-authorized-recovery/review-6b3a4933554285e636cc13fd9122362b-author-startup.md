<!-- ai-peer-review-template version="1" digest="sha256:78b5e8f8f7a26e58ad224d8044ad4b7b0c6cc23cf041cceb4560d23012c826c0" -->

# Author startup

Review: `review-6b3a4933554285e636cc13fd9122362b`

Mode: `normal`

- Artifact: `/Users/kpburson/.codex/worktrees/aitm-plan-1725-xpr/ai-task-manager/docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md`
- Workspace: `/Users/kpburson/.codex/worktrees/aitm-plan-1725-xpr/ai-task-manager/.scratch/peer-review/review-6b3a4933554285e636cc13fd9122362b`
- Response: `/Users/kpburson/.codex/worktrees/aitm-plan-1725-xpr/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/plan-1725/XPR-recovery-2/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-1725-plan-xpr-authorized-recovery/review-6b3a4933554285e636cc13fd9122362b-reviewer-response-1.md`
- Reviewer invitation: `/Users/kpburson/.codex/worktrees/aitm-plan-1725-xpr/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/plan-1725/XPR-recovery-2/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-1725-plan-xpr-authorized-recovery/review-6b3a4933554285e636cc13fd9122362b-reviewer-invitation.md`

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

Zero-install help: `npx --yes @kburson/ai-peer-review@0.2.3 status --help`
