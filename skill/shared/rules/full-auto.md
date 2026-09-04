<!-- aitm-skill-version: 1.0.0 -->
<!-- aitm-rule-id: full-auto -->

# rules/full-auto.md

Tier-2. Load when the user names Full-Auto or any manual review boundary. On first read, emit:

```
aitm-skill-loaded:rules/full-auto:1.0.0
```

## Default

Full-Auto is the built-in default for new AITM sessions. Do not ask the user to choose routine review gates on first bind. Continue through governed lifecycle steps without babysitting, while preserving evidence, exact-SHA, CI, worktree, ownership, receipt, and provider-action protections. An explicit pause or a hard blocker still stops execution.

## Exact user phrases

The three controls are independent and additive. Translate them without a follow-up question:

| User phrase          | Session command             | Boundary                                           |
| -------------------- | --------------------------- | -------------------------------------------------- |
| `manual plan review` | `npx aitm auto manual-plan` | Human approval before Plan → Develop               |
| `manual code review` | `npx aitm auto manual-code` | Human pull-request approval before merge authority |
| `manual task review` | `npx aitm auto manual-task` | Human approval before Review → Done                |

Apply every named phrase when the user combines them. `Full-Auto` runs `npx aitm auto both`. The inverse per-boundary commands are `auto-plan`, `auto-code`, and `auto-task`; `reset` clears session overrides and restores project then built-in precedence.

## Manual code review

Manual code review replaces the spawned implementation-review agent for that run. Do not spawn an implementation-review agent. Complete implementation verification, open the pull request, and wait until required CI is green before requesting the configured eligible human reviewer. AITM may assign that user as the PR reviewer; assignment alone is never approval evidence.

The approval must be from the configured human reviewer, must not be from the PR author or a bot, and must apply to the exact accepted head SHA. Stale-head approval, a pending review request, or an agent review cannot authorize merge. If eligible exact-head approval is absent, preserve the branch and issue state and surface `PROMPT_REQUIRED: manual-code-review`; retry delivery after the human review.
