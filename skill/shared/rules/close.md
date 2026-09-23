<!-- aitm-skill-version: 1.0.0 -->

# Close — compatibility pointer

Emit `aitm-skill-loaded:rules/close:1.0.0` on first load. `/task close #N` owns the durable Review → Done transaction. Current `npx aitm explain #N --json`, CLI help, and the executed close result govern; detailed human recovery notes live in `../references/close-detail.md`.

## Human-only step

The ordinary close path runs only after explicit human instruction or an already-authorized Full-Auto continuation. Checked boxes alone are not approval. Agents report `CODE_COMPLETE`; the orchestrator closes.

## Review-approval gate

Require a Review-state issue, accepted exact-head Test evidence, Review approval provenance, complete pre-close checkboxes, delivery/merge reachability, matching binding and branch, and a clean workspace. Never call `gh issue close` or raw `move-state.mjs`.

## Dirty-Workspace Gate 2

Close blocks on dirty owned files. Preserve unrelated work and investigate the exact path before retrying. A refusal does not authorize `--force` or a state jump.

## Recovery

Close is a durable transaction: inspect its returned step and current GitHub record before retry. Reopened, stale, or false-delivery repair flags require their named audited preconditions; they are not generic bypasses. After external merge or human approval, re-query Explain; execution revalidates.

## Estimation delta comment

Close posts the `Review delta` from Estimate and actual time without changing the estimate. Timing and housekeeping boxes are finalized by Close, then verify Done and closedAt.
