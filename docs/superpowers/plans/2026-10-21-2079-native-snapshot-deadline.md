# #2079 native snapshot deadline repair

**Goal:** Keep captured, fresh issue authority usable without removing deadlines, capture, pagination or conflict fences.

## Story Intent

- **Beneficiary:** a maintainer delivering governed stories
- **Capability:** complete bounded authority snapshots while retaining GraphQL capture
- **Need:** repeated telemetry retention scans consume the snapshot deadline before provider dispatch
- **Value or failure prevented:** current plan bindings can be published without weakening ownership or conflict checks

## Evidence and diagnosis

The native reader has a 5000ms aggregate remote deadline and 6000ms total deadline. Its ordinary epic path needs initial root, child graph and final root fence reads. Each captured subprocess calls beginObservation before provider dispatch; it awaits createUsageWriter, which enumerates and stats the complete telemetry store. A retained local probe found 67,457 files / 93,954,496 bytes and took 1166ms per sweep. Concurrent writers repeat the cost and contend for disk before API timing starts. No historical GitHub task lookup was used for diagnosis or the local estimate.

## Reviewed repair boundary

Move automatic advisory retention inspection to the top-level collection launch boundary. Public, legacy and measurement-launcher entrypoints prepare their environment before native workflow deadlines begin. Inspect once only when collection is enabled, enrollment is available and the incoming environment has no inherited usage context. Treat context absence only as a scheduling hint; enrollment still validates and reprobes exactly as before. Catch advisory errors locally so an available prepared environment is never lost. Preserve warnings using the existing thresholds and explicit complete usageRetention API.

Add one createUsageWriter option, defaulting to current behavior, disabling both startup and periodic advisory checks. Every collection-owned writer opts out, including reportDiagnostics and beginObservation. Direct writers retain current automatic checks. Every raw observation, diagnostic, append/fsync and close marker remains recorded; no raw data is deleted. No advisory cache, shared lease, slot, retry, schema change or authority waiver is introduced.

Native hooks directly import their guards and do not prepare a collection environment. They may inherit a prepared shim/environment; removing collection-owned writer scans removes that per-request overhead. Do not add preparation to hooks merely to restore advisory cadence. Long-lived prepared sessions refresh automatic cap warnings on the next root launch or explicit retention inspection, not on each request. Advisory caps still cannot reject or delete capture records. All native authority deadlines, pagination, query inventories, ownership checks and drift fences remain unchanged.

## Implementation and verification

1. Add offline regression in scripts/tests/unit/task-tracker/lib/decomposition-snapshot-deadline.test.mjs. Observe a failure before changing production. Verify root preparation inspects once; nested preparation, malformed inherited-context diagnostics, captured subprocesses and HTTP observations do not inspect; advisory failure preserves capture; direct-writer defaults and explicit retention still inspect/warn. Count actual local enumeration via filesystem seams or observed behavior, rather than wall-time assertions.
2. Modify only scripts/task-tracker/lib/graphql-usage/storage.mjs and collection.mjs unless focused test support is necessary. Preserve capture and native guard source unchanged. Keep policy options explicit and retain existing defaults for direct storage callers.
3. Add a real captured offline epic snapshot test using action-capture-bin/gh with collection enabled and an offline provider. Retain all three observations and unchanged refusal behavior. Existing refinement-traffic source fixtures disable collection and alone cannot prove this repair. Preserve root/nested permission-context transitions and GraphQL storage/collection regressions.
4. Review code independently, retain findings and author dispositions, commit #2079 implementation and collateral, then use native Test/Review/delivery. Preserve pre-existing #2039 staged collateral and its rubric-zero configuration change separately. Run normal repository verification at delivery.
5. After the fix is available in the executing checkout, attempt one captured native #2039 plan-binding operation. Record exact success/refusal. If its finite budget still fails, retain measured evidence and investigate; do not claim a full performance improvement or increase the timeout speculatively.

## Review disposition

The independent diagnostic/design review supported the cause but identified per-minute rollover, threshold-specific warnings, advisory-failure isolation and captured subprocess verification gaps. The original shared-slot proposal is withdrawn in favor of the smaller launch-boundary correction above. Round 2 independently recommended this approach. All reports and author dispositions are retained separately; these are design reviews, not implementation acceptance.

## Estimate and exclusions

Agent-produced local estimate: S, 3h, P0, rank1. Allocation: 0.5h diagnosis, 1h correction, 1h offline regression, 0.5h review/collateral. Below four hours. No owner estimation or cloud historical comparables. No product cache subsystem, raw-data cleanup, historical evidence rewrite, workflow waiver, uncontrolled retry or broad refactor.
