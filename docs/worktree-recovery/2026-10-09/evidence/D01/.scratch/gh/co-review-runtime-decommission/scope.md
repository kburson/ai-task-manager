Complete the terminal migration step from epic #1531 after #1591 proves that no authoritative active legacy review remains. Migrate or remove the remaining production consumers of the AITM-owned review runtime, delete the `npx aitm co-review` command surface and self-documentation, and delete `scripts/review/**` plus superseded AITM-only fixtures and tests.

Retain `ai-peer-review` as the sole owner of peer-review CLI behavior, protocol schemas, lifecycle, recovery, and archives for new reviews. Keep AITM limited to the published package API and its non-authoritative task-occupancy integration. Preserve historical accepted and abandoned review archives as immutable evidence without converting them to the package schema.

Add structural absence tests and rerun package parity with the legacy tree physically absent. Update review rules, help, and architectural documentation so no supported path directs users to the legacy command.
