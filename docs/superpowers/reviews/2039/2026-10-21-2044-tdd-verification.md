# Story #2044 timing-event verification

Bound scope is the pure mergeTimingEvents(existing,incoming) contract from Task 13 of the accepted active child plan. Deep-dive authority, local estimate and owner boundaries are retained in 2026-10-21-2044-deep-dive.md.

The initial named verifier failed with ERR_MODULE_NOT_FOUND for story-cache/timing-events.mjs before the production module existed. Implementation then passed all 45 focused tests. The original technical-plan seed is retained exactly: replay of the same ID is a no-op, activeSeconds remains null, and changing that value to measured zero conflicts.

Cases cover every supported field changing under a reused event ID, per-actor native cursor reuse, independent actor namespaces, opaque coordinate collisions, backdated arrival, deterministic equal-time ordering, preserved timestamp representation, adjacent intervals, cumulative active/idle snapshots after JSON reconstruction, nested overlap, independent simultaneous actors, zero-duration observations at interval boundaries, fractional seconds, mixed Unknown values and definite overlap of known minimum spans. Retained historical actor/event strings remain data and confer no emission authority.

The function accepts only normalized native interval deltas. It does not infer a missing source cursor, subtract cumulative totals, sample time, parse native Markdown rows, persist events or advance cursors. The known span used for overlap checking is explicitly a minimum bound when a duration component is Unknown; it is not a complete timing estimate. Existing native adapters and later ingestion/publication owners must retain their own source and authorization contracts.

Input refusals include missing/extra fields, invalid identities, structured/missing cursors, impossible UTC calendar instants, timezone omission, text/negative/infinite/negative-zero durations, unrepresentable intervals, sparse/non-array collections, accessors and unsupported Unicode. An accessor probe confirms its getter is not invoked. Outputs are detached frozen records and arrays. A supplied 1,000-event fixture replays deterministically with no transport, filesystem or subprocess dependency.

Observed verification:

- Focused timing verifier: 45 passed, zero failed.
- All current story-cache unit tests, the real store integration verifier and unit-lane purity checks: 286 passed, zero failed. This includes all accepted predecessor tests and the 72 store persistence-failure cases.
- Actual package-boundary verifier: 9 passed, zero failed. Exactly one additional runtime timing-event module is declared; no package exclusions or count headroom were changed.
- Focused ESLint passed. CSpell found one test-label spelling issue, corrected from non-finite wording to infinite. Formatting and final spelling/diff checks precede the final collateral commit.

Supporting local logs are .tmp/2044-red.log, .tmp/2044-green.log, .tmp/2044-combined.log and .tmp/2044-package.log. These are actual observed tests, not native lifecycle receipts. Independent review and exact-head CI/native acceptance remain required after the implementation is committed.

## Precision repair after independent review

The reviewer reproduced one actionable Important finding with two consequences: subtracting tiny positive spans from epoch timestamps hid real overlap, and binary floating-point addition of 0.1 plus 0.2 created a false overlap at an adjacent boundary. Two added regression tests failed against the original implementation (45 passed, 2 failed). The first also covers Number.MIN_VALUE after repair.

The repair interprets each supplied finite Number through its canonical decimal string, sums known components with bounded BigInt coefficients, and compares that exact minimum span against relative integer endpoint differences. Events are ordered by endpoint; each positive interval is checked against the preceding positive interval for its actor. No stored value is rounded or changed, and null remains Unknown. An explicitly supplied 0.30000000000000004 remains distinct from separate supplied components 0.1 and 0.2. The representable interval-range refusal is retained with exact arithmetic.

The focused verifier then passed 47 tests, zero failed. Logs: .tmp/2044-precision-red.log and .tmp/2044-precision-green.log. Full independent follow-up results are retained in the review rounds rather than inferred from these local logs.
