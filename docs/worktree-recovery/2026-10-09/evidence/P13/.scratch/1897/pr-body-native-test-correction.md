Embedded source-plan Acceptance Criteria headings can hide the canonical issue criteria, causing native AC stamping to refuse before running the declared verifier. Select the first live canonical level-two section, skipping fenced and commented examples, and retain the legacy fallback when there is no live canonical section. Verifier grammar, evidence provenance and section termination remain unchanged.

Validation: genuine initial RED/GREEN plus six independent-review regressions (6 failures before correction), 66 affected tests passing, lint/format/diff checks passing. The independent review covered all three changed paths and its P2 literal-heading regression is corrected. Native AC verification is refreshed at the corrected commit. Full suites run in hosted CI with ci-slow enabled; no full host suite.

Refs #1897


Native Test was interrupted after it unexpectedly executed the full host fast lane (954 files). The configured project provider appended legacy full-suite declarations after the successful cloud verifier. This violates the TIA-only host constraint. The run and interruption remain preserved and are not a successful native Test receipt; delivery is blocked pending a separate upstream coverage-mapping repair.
