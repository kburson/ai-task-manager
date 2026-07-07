# Excluded from the ai-memory seed

The `docs/ai-memory/` seed is a curated export of **durable, reusable** operational
lessons. Ephemeral epic-status trackers — files that record the live state of one
in-flight epic and have no value once that epic closes — are deliberately **excluded**.

## Exclusion patterns

- `project_drive_*_tree.md` — per-epic AFK/drive orchestration trackers.
- `project_integrity_epic_*.md` — per-epic integrity-remediation trackers.

## Excluded at last resync (#518)

- `project_drive_508_tree.md`
- `project_drive_592_tree.md`
- `project_integrity_epic_521.md`

The exclusion is enforced by `EXCLUDE_PATTERNS` in
`scripts/inspect/ai-memory-parity.mjs`; `--mode files`/`--mode diff` honor it so an
excluded file never reads as "missing from seed."
