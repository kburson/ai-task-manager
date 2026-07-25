# Excluded from the ai-memory seed

The `docs/ai-memory/` seed is a curated export of **durable, reusable** operational
lessons. Ephemeral epic-status trackers — files that record the live state of one
in-flight epic and have no value once that epic closes — are deliberately **excluded**.

## Exclusion patterns

- `project_drive_*.md` — AFK/drive orchestration trackers (per-epic or per-queue).
- `project_integrity_epic_*.md` — per-epic integrity-remediation trackers.
- `project_epic_<N>_*.md` — any per-epic tracker keyed by issue number (state,
  guardrail, or any other suffix); these are point-in-time status logs, never
  reusable lessons, even when the underlying epic shipped real architecture.

## Excluded at last resync (2026-07-25)

- `project_drive_508_tree.md`
- `project_drive_592_tree.md`
- `project_drive_727_tree.md`
- `project_drive_bug_queue_2026_07_10.md`
- `project_epic_859_state.md`
- `project_epic_905_guardrail.md`
- `project_epic_912_state.md`
- `project_integrity_epic_521.md`

## Excluded at prior resync (#518)

- `project_drive_508_tree.md`
- `project_drive_592_tree.md`
- `project_integrity_epic_521.md`

The exclusion is enforced by `EXCLUDE_PATTERNS` in
`bin/lib/memory-seed-set.mjs` (the shared source of truth, imported by both
`scripts/inspect/ai-memory-parity.mjs` and the install-time manifest);
`--mode files`/`--mode diff` honor it so an excluded file never reads as
"missing from seed."
