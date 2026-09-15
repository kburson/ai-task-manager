# Done Delivery Audit Implementation Plan (#1633)

## Objective

Implement and deliver a fail-closed two-week Done-to-trunk audit, commit its live
survey, and create governed recovery work for every false or indeterminate Done
record.

## Tasks

1. Add failing fixture tests for exact Done-marker interval selection, duplicate
   suppression, and deterministic sorting.
2. Add failing classification tests for direct trunk ancestry, receipt-backed
   merge/squash, reconstructed historical squash, child attribution, legitimate
   non-epic issue-resident delivery, root-epic false-Done, and malformed or
   missing authority.
3. Implement pure marker parsing, classification, recovery-coverage validation,
   and canonical Markdown rendering in
   `scripts/maintenance/audit-done-delivery.mjs`.
4. Implement the read-only GitHub/git adapter using validated argv calls. Freeze
   the snapshot and remote trunk SHA; never fetch, edit issues, or mutate git.
5. Run the live audit for 2026-09-01 America/Chicago through the frozen snapshot.
   Inspect every non-verified result against raw GitHub and git evidence.
6. Create one governed recovery issue for each confirmed `false-Done` or
   `indeterminate` result. Stamp its stable audit/affected-issue marker and link
   the dependency without altering the affected historical issue.
7. Regenerate
   `docs/audits/2026-09-15-done-delivery-14-day-survey.md`, then prove byte-for-byte
   reproducibility with the issue's `--verify-report` command.
8. Run focused tests, full unit/integration/slow suites, lint, format, and diff
   checks. Stamp AC/DoD evidence through AITM.
9. Complete Agent Review and Full-Auto final review, publish a PR to `trunk`, wait
   for required hosted checks, execute the exact AITM provider action, verify the
   landed receipt, and close #1633.

## Completion evidence

- Every in-window Done marker appears once in the report.
- Every row includes the required provenance fields and one allowed
  classification.
- All false/indeterminate rows name unique governed recovery issues.
- `--verify-report` exits zero against the committed snapshot.
- The focused and repository-wide verification commands exit zero at the
  accepted SHA.
