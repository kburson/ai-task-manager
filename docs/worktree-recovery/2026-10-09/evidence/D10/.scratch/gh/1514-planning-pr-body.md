## Summary

- Records the approved design for externalizing Plan Estimation Forecast comparables into one tamper-evident visible list.
- Records the task-by-task implementation plan for the writer, reader, compact issue anchors, compatibility, and verification coverage.
- Makes no runtime changes and does not close #1514.

## Review note

Please run an AITM co-review on both the specification and implementation plan when reviewer tokens are available. This PR records the planning artifacts now without requiring that co-review to consume currently unavailable token capacity.

## Verification

- `npx prettier --check docs/superpowers/plans/2026-09-04-1514-externalize-forecast-comparables.md docs/superpowers/specs/2026-09-04-1514-externalize-tamper-evident-forecast-comparables-design.md`
- `git diff --check`

Tracks #1514.
