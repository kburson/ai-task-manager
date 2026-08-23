<!-- aitm-skill-version: 0.0.0 -->

# Status Reporting & Pre-CODE_COMPLETE Checklist

Detailed reference for the "Status Reporting" and "Before reporting
CODE_COMPLETE" sections of `.ai-task-manager/templates/pickup-directive.md`.

## Status table

When returning control to an orchestrator after completing your work,
report exactly one of these statuses. Do not use `DONE` or
`DONE_WITH_CONCERNS` — those terms are ambiguous under the AITM close
contract and will cause orchestrators to advance the sequence
prematurely.

| Status                   | Meaning                                                                                                                                                                                                                                       | Required condition                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `CODE_COMPLETE`          | Implementation finished. All verifiable boxes checked; any boxes requiring human/live-env observation noted as unverifiable. Agent stops — orchestrator calls `/task review #N --duration-minutes M --words W` using values from this report. | List any unchecked items and why they could not be verified. Include `duration_minutes` and `words_delta`. Do NOT call `/task review`. |
| `ISSUE_READY_FOR_REVIEW` | Orchestrator reports this after `/task review` succeeds and the issue reaches Review.                                                                                                                                                         | Orchestrator notifies the human for approval. Do NOT run `/task close`.                                                                |
| `BLOCKED`                | Cannot proceed without orchestrator or human intervention.                                                                                                                                                                                    | Describe exactly what is needed.                                                                                                       |

## Rules for orchestrators

- On receiving `CODE_COMPLETE` from an agent: extract `duration_minutes`
  and `words_delta` from the report, then call `/task review #N
--duration-minutes M --words W`. If it exits non-zero (verification
  failed), post a comment on the issue listing the failed criteria,
  confirm the issue has been reverted to In Progress, and re-dispatch the
  agent. Loop until `/task review` succeeds.
- On `/task review` success (issue reaches Review): report
  `ISSUE_READY_FOR_REVIEW` and notify the human. Do NOT run `/task close`.
- A sub-issue sequence is complete only after all issues in that sequence
  reach **Done** via the `/task review` → human approval → `/task close`
  path.
- Do not advance to the next sequence while any issue has not been
  explicitly closed by a human.

If a DoD item cannot be verified by the agent (e.g., it requires a human
to observe a live environment, or it involves a third-party review),
leave that checkbox unchecked, report `CODE_COMPLETE`, and list the
unverified items. Do not check DoD boxes you cannot actually verify.

## Before reporting CODE_COMPLETE — agent steps

> ⛔ **All checkboxes checked means "ready for orchestrator to call
> `/task review`" — NOT permission for the agent to call `/task review`
> or `/task close`.**
> The agent's terminal action is reporting `CODE_COMPLETE` and stopping.

Review every item in the Definition of Done checklist in the issue body.
For each item:

- Verify it is genuinely complete (inspection + relevant test/command
  output).
- Run the standard DoD command checkboxes: `npm run test:all` (both
  fast and slow lanes), `npm run lint`, and `npm run format:check`.
- Verify every relevant issue-specific command in `## Verification
Commands` has been run successfully, its output read, and its checkbox
  checked.
- Verify every Acceptance Criterion has an `aitm-verified vc-list="vc:N"`
  citation (or an honest `aitm-non-demonstrable` opt-out) and every cited ID
  resolves under the root `## Verification Commands` section.
- Verify that all issue body checkboxes are ticked — this item is
  self-referential and must be the last box checked.
- Mark each verified item with `/task ensureChecked "<label>"`.

Then verify every Acceptance Criterion the same way. Do not check the
related Acceptance Criterion or DoD item until the relevant command
checkbox is checked.

## Word count — exit step (agent sessions only)

Before reporting `CODE_COMPLETE`, record your final word count:

```
node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs words-count
```

Compute `words_delta = W_end - W_start` (where `W_start` was captured at
agent entry — see step 1 of the pickup directive). Include both values
in your `CODE_COMPLETE` report.

**Stop here. Report `CODE_COMPLETE`. Do NOT call `/task review`.** The
orchestrator calls `/task review #N --duration-minutes M --words W`,
which moves the issue through In Review → Review (or reverts to In
Progress on failure and re-dispatches this agent). Duration and word
count come from the agent's `CODE_COMPLETE` report.
