---
name: Full-Auto review requires truthful approval provenance
description: Full-Auto approval must record consolidated current-epoch provenance and visible audit context; never represent it as human approval.
type: feedback
originSessionId: cb76eafb-1b98-42ba-93c7-cc315e949261
---
When operating in Full-Auto / autonomous mode, `/task approve` records
`provenance="full-auto"` plus detection signals on the consolidated
`aitm-review-approved` marker and maintains the visible Full-Auto footnote. It
must never pass `--human` or represent the approval as human.

Current authority additionally requires the persisted Test SHA, a passing Agent
Review proof in the latest Review epoch for that SHA, the matching approval,
and no later invalidation. A checked `Final Review Passed` box or historical
standalone marker is not authority.

The visible audit context documents:

- That the box was ticked under Full-Auto without human sign-off
- Scope of the self-review performed (tests, lint, regression scan, etc.)
- Risk that human-only judgment (architecture, naming, missed edge cases) was not gate-checked

**Why:** On #168 the box was ticked and `approve` was run with no comment explaining the auto-approval; the user caught the missing audit trail. The point of the DoD checkbox is the audit trail, not the tick itself.

**How to apply:** Run `/task approve #N` only after current Test and Agent Review
proof exist. Let the verb record Full-Auto provenance and audit context. If a
human actually approves in chat, use `/task approve #N --human` instead. After
demotion, demotion-shaped reconciliation, or Agent Review failure, rebuild Test
and Review proof before approving again.
