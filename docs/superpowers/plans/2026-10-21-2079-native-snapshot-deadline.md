# #2079 native snapshot deadline repair

**Goal:** Keep captured, fresh issue authority usable without removing deadlines, capture, pagination or conflict fences.

## Story Intent

- **Beneficiary:** a maintainer delivering governed stories
- **Capability:** complete bounded authority snapshots while retaining GraphQL capture
- **Need:** repeated telemetry retention scans consume the snapshot deadline before provider dispatch
- **Value or failure prevented:** current plan bindings can be published without weakening ownership or conflict checks

## Evidence and diagnosis

The source snapshot reader has a 5000ms aggregate remote deadline and 6000ms total deadline. Its ordinary epic path needs an initial root read, a child graph read and a final root fence. Each captured subprocess calls beginObservation before dispatch, which awaits createUsageWriter. Every writer currently enumerates and stats the entire telemetry store before provider timing starts. The retained local probe found 67,457 files / 93,954,496 bytes and took 1166ms for one sweep. Concurrent writers repeat that cost and contend for disk. Fast recorded API durations therefore do not measure this startup overhead. No historical GitHub task lookup was used for this diagnosis or estimate.

## Repair boundary

Keep the existing native authority deadlines and complete selected-resource reads. Rate-limit only the advisory telemetry retention sweep across processes sharing the same collector root. Use an exclusive, private per-minute local slot so only one writer initiates a sweep in that minute. Other writers continue recording every observation and preserve known warning results when available. A missing, partial or crashed advisory result is never authority and never permits a GitHub write. Claim/write failures remain best-effort diagnostics; they cannot disable capture or weaken issue admission. Do not delete raw observations, participants, controls or diagnostics. Stale advisory slots may be removed as bounded metadata housekeeping; reporting/explicit retention reads still inspect the complete store.

A single sweep may still be slow. If the native bound continues to fail after removing redundant sweeps, retain that measured result and investigate rather than increasing the authority timeout speculatively.

## Implementation and verification

1. Add a deterministic offline regression in scripts/tests/unit/task-tracker/lib/decomposition-snapshot-deadline.test.mjs. Use real temporary collector storage and instrument filesystem enumeration. Multiple sequential and concurrent short-lived writers must retain every observation while sharing one advisory sweep. Test next-minute refresh, failed/incomplete advisory claims, symlink containment and warning propagation. Observe the repeated-sweep failure before production changes.
2. Implement the smallest advisory retention scheduler in scripts/task-tracker/lib/graphql-usage/storage.mjs, factoring a focused sibling module if needed. Keep the full explicit usageRetention API and raw capture intact. Do not change native decomposition permissions, timeouts, query inventories or evidence.
3. Run the targeted test, existing GraphQL storage/collection tests and native hook traffic regression. Hung transport, malformed pagination and every existing drift refusal remain enforced. Run normal repository verification at the delivery boundary and retain exact outcomes.
4. Review code independently, preserve findings and author dispositions, commit only #2079 implementation and its collateral, then use native Test/Review/delivery. Keep pre-existing #2039 staged collateral and its configuration change separate.
5. After the fix is available in the executing checkout, attempt one captured native #2039 plan-binding operation. Record success or exact refusal; no claim of a complete performance improvement from incomparable windows.

## Estimate and exclusions

Agent-produced local estimate: S, 3h, P0, rank1. Allocation: 0.5h diagnosis, 1h correction, 1h offline regression, 0.5h review/collateral. Below the four-hour target. No owner estimation or cloud historical comparables. No product cache subsystem, historical evidence rewrite, workflow waiver, uncontrolled retry or broad refactor.
