# Post-Mortem — `<short title>`

Copy this file to `docs/postmortems/YYYY-MM-DD-<slug>.md` and fill in each field. Keep it concise — one writeup per incident, no preamble.

## Date / Incident ID

`YYYY-MM-DD` — short identifier (e.g. `2026-05-11-stale-base-fanout`). Link to the triggering GitHub issue(s) and commit SHAs.

## What happened

Specific action taken. Concrete sequence — what command ran, on which branch / worktree, at what time. No interpretation yet.

## Why it was wrong

Which rule, guardrail, or invariant was violated. Quote the rule and link to its source (`CLAUDE.md`, `docs/guides/*.md`, `skill/shared/SKILL.md`).

## Root cause

Was the rule missing, unclear, or unenforced? One of:

- **Missing** — no rule covered this case.
- **Unclear** — rule existed but ambiguous in this context.
- **Unenforced** — rule existed and was clear, but no hook / verb / test blocked it.

## Resolution

What was rolled back, reverted, reconciled, or manually fixed to return the system to a correct state. Include the recovery commands.

## Guardrail change

The code / hook / rule update committed in response — link the commit SHA or PR. A post-mortem without a guardrail change is incomplete; if the only outcome is "be more careful next time," the root cause is still **unenforced** and the work isn't done.
