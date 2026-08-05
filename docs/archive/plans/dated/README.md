# Plans (retired)

> **Retired.** This was the canonical dated-plans location before the convention
> moved to [`docs/superpowers/plans/`](../../../superpowers/plans/) (Superpowers
> spec-to-plan authoring) and, separately, [`docs/plans/`](../../../plans/)
> (the `/task discover`/`new` tracked plan-and-draft store). The two files below
> are kept as historical record; the conventions described past this point are
> superseded — do not follow them for new plans.

Canonical home for design specs and implementation plans referenced by GitHub issues.

## Convention

- File name: `YYYY-MM-DD-<slug>.md` (date the plan was finalized).
- Anything a committed issue points to MUST live here. Do not reference `~/.claude/plans/*` from issue bodies — that path is per-machine and ephemeral.
- `~/.claude/plans/` remains the workspace for in-flight drafts. Once a plan is referenced by an issue or PR, copy the finalized version here.

## Divergence is documented, not avoided

Issue bodies, spec docs, and the implementation will drift as decisions are made. **Don't quietly rewrite the plan to match.** When a decision changes during execution:

- Append a **Decision Log** section to the plan with the date, what changed, why, and what was rejected.
- Update the issue body if the change affects acceptance criteria.
- Keep rejected alternatives — future-you may face the same fork.

The plan file is the historical record; the issue is the current contract.
