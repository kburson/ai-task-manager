Refs #680

Documentation only. Records the deliverable for spike #680 — "configurable open-ended N-state machine for downstream customization" — as a tracked design spec.

## What this adds

`docs/superpowers/specs/2026-09-08-aitm-yml-pipeline-engine-design.md`, covering:

- **Codebase findings** with file:line citations — the `state-factory.mjs` assembly seam, the 25 self-scoping guard checks that delete rather than abstract under edge binding, the two existing migration precedents (`stage-entry-markers.mjs` aliasing, `timing-slug-rename.mjs` in-place relabel), and the `LEGAL_TRANSITIONS` / `REQUIRED_CHAIN_STAGES` coupling that forced the drain-the-board decision.
- **18 decisions** with rationale, plus what was rejected and why.
- **Threat model for external gates** — arbitrary code execution, always-pass gates, and remediation-string injection, with the controls for each.
- **Follow-on epic outline** — A (ask-the-script), B (recycle verb), C (pipeline as config), D (gate & action plugin API).

## Divergences from the spike body

Recorded in section 10. The design keeps today's paired-transition guard model and binds guards to edges rather than expanding to the five-phase `entryGuard → onEnter → Action → onExit → exitGuard` shape; puts the config at project root rather than under `.ai-task-manager/`; and leaves resident actions as setup hooks rather than making them the deep work of a state.

## Verification

No source, test, fixture, runner, or dependency impact — `verify-develop.mjs` classifies the path as `no-verification-impact`. Prettier formatting applied.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
