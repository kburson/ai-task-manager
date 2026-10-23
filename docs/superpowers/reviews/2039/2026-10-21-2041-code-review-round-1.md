# #2041 independent code review — round 1

Reviewer: fresh read-only Codex subagent `/root/review_2041_code`, inherited model and effort, no independently exposed exact model identifier. No Astra attribution.

## Raw reviewer report

```text
Independent read-only review completed for #2041.

Range: `b330fe3f467cefbe45ad3040a42612d57c8af04f..51a7b28640087821e94b472e7d638f66fb9f80c3`.

Critical: 0. Important: 0. Minor: 0. No actionable findings.

Reviewed `manifest.mjs`, its exact unit verifier, package-boundary delta, active Task 4, concrete storage schemas, specification, committed design rulings and TDD record.

Actual verification:

- Manifest, native observation and snapshot reader: **147/147 passed**.
- Real npm package-boundary verifier: **9/9 passed**.
- Additional adversarial probes: **10 expected refusals passed**, covering unsupported revision mode, invalid UTF-8 body with matching checksum, missing nested batch payload, nested traversal path, conflicting references, inconsistent edited timestamps, tombstone, forged `Map.get`, current new-comment intent and foreign project-field key.
- Supported edited revision: accepted.
- Boundary assertions: deferred batch, timing, conflict and optional source JSON preserved exactly; missing payload referenced from optional source refused.

The structural/domain boundary matches the explicit ruling: this validator checks required generation containers, batch schema/counter coherence and every declared nested payload reference. It preserves timing event/cursor, batch/effect, conflict and optional source JSON for their owning domain validators. A successful return therefore establishes storage integrity, not those records’ semantic validity or publication authority.

Identity binding, canonical generation byte checks, immutable detached results, native revision consistency, inventory checks and independent counters appear sound within this slice. No filesystem, API, cloud, issue, commit or source-file mutation was performed.

Limitations: no full repository CI or filesystem crash/concurrency verification; those belong to native final verification and storage #2054. Reviewer identity: Codex review subagent; no independently exposed exact model identifier or Astra attribution.
```

## Author disposition

Accepted the clean review. No production change follows the reviewed implementation head. Preserve the explicit boundary for consumers: store integrity is not timing validity, a batch publication grant, current assignment or freshness. Later domain validators remain mandatory before their effects, projections or cleanup decisions. Filesystem containment and crash/concurrency verification remain with #2054; this module performs no I/O.

The final author focused run passed 57 manifest cases; the reviewed combined run passed 147. Real package inventory passed 9/9 with exactly one intentional new runtime module. Focused ESLint, CSpell and Prettier checks passed. Native exact-head Test/Review/approval/Close remain pending; child Done requires parent-branch acceptance and root #2039 retains customer delivery.
