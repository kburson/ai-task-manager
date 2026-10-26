# #2079 diagnostic/design review rounds

Reviewer: independent read-only agent /root/review_2079_repair_design, inherited model configuration. These reports are not code-review acceptance.

## Round 1 — verbatim report

## #2079 diagnostic and design review

**Verdict:** The diagnosis is supported by source. Shared throttling of advisory retention is a sound bounded correction, but the plan needs the following implementation and verification details before claiming the native failure is repaired.

### Findings

1. **P2 — Existing traffic tests do not prove captured snapshot performance.**  
   `scripts/tests/fixtures/refinement-traffic-runner.mjs:26` explicitly sets `AITM_GRAPHQL_USAGE: '0'`. Retain those authority regressions, and add an offline test using the real `scripts/task-tracker/action-capture-bin/gh` with collection enabled and a fake provider. Exercise the three-request epic path and verify every observation survives. Concurrent tests must include separate processes; an in-memory mutex alone would otherwise pass.

2. **P2 — Per-minute slots permit overlapping sweeps across a minute boundary.**  
   Plan line 18 guarantees one sweep per calendar minute, not one sweep during a five-second snapshot. A root read at minute end and child read after rollover can each pay the measured sweep cost; a long sweep can also overlap the following minute’s winner. Explicitly accept and test this residual behavior, or use a shared recent-completion/in-progress check. Avoid adding a lease subsystem unless measurements justify it.

3. **P2 — Reusing warning strings can change configured soft-cap behavior.**  
   `storage.mjs:316–329` accepts writer-specific `softBytes` and `softFiles`; `storage.mjs:638–650` computes warnings from those thresholds. Cache validated counts and derive warnings using each caller’s thresholds, or include thresholds in result identity. Test two writers with different thresholds and a warm advisory result.

4. **P2 — Advisory failures must remain outside capture invalidation.**  
   Existing `checkRetention` catches failures independently (`storage.mjs:327–335`), whereas the surrounding startup catch calls `fail()` and disables enrollment (`storage.mjs:337–341,358–377`). Preserve that separation for claim, read, publication and housekeeping errors. A loser must not wait for the winner or fall back to another full sweep. Test claim success followed by process death, partial result, denied access, and failed result publication; capture must continue.

### Security and boundedness requirements

Use private directories and exclusive claim creation consistent with `storage.mjs:51–55,180–189`. Validate advisory result size, schema, finite timestamps and nonnegative safe-integer counts before reuse. Keep advisory metadata outside the `.jsonl` observation inventory, so `readUsage` cannot interpret it as malformed telemetry.

Do not recursively scan all advisory history during startup housekeeping. Bound candidate deletion and refuse directory/symlink redirection; clean only recognized advisory metadata. A crashed claim should suppress advisory work only for its bounded period, never suppress observations. Keep warning output bounded.

### Why the diagnosis holds

`createUsageWriter` awaits retention at startup (`storage.mjs:373–374`); `beginObservation` awaits writer creation before setting `startedAt` (`collection.mjs:298–302`); the shim awaits observation setup before spawning GitHub CLI (`action-capture-bin/gh:107–120`). Consequently, recorded API duration excludes the sweep while the native aggregate remote deadline includes it (`decomposition-hook-authority.mjs:47–49,66–93`).

### Remaining validation limit

The winner still pays one complete sweep, and startup, enrollment, fsync, provider latency, pagination and the final fence still consume the existing budget. The reported 1166ms sweep therefore supports removing redundant work; it does not prove admission will succeed. Preserve the planned single captured native attempt and record its exact result without increasing deadlines.

**Scope:** Read-only source/design review. No tests, network requests, edits or Git/GitHub mutations performed. This report is not code-review acceptance or native admission.

## Round 1 author dispositions

All four findings accepted. Replace shared slots entirely with launch-boundary advisory inspection. No shared counts, warning cache, claim, lease or housekeeping remain, eliminating findings 2–3 and their associated security cases. Keep advisory errors separate from capture invalidation (finding 4). Add real captured offline snapshot coverage (finding 1). Retain concurrent subprocess coverage and the single native validation limitation.

## Round 2 — verbatim report

**Recommend the smaller launch-boundary repair.** It removes advisory full-store enumeration from every captured request without shared state or new filesystem lifecycle/security concerns.

Source findings:

- **Public CLI:** `bin/aitm.mjs:209–213` awaits `prepareUsageEnv` before `run()` and delegation. `prepareActionCaptureEnv` then preserves the prepared environment through its spreads (`action-capture.mjs:196–228`). A root advisory inspection here precedes the native snapshot’s deadlines.
- **Measurement launcher:** `graphql-usage-launch.mjs:10–14` awaits preparation before spawning the measured command. Nested CLI preparation sees inherited context and can skip inspection.
- **Legacy CLI:** `bin/cli.mjs:2019–2023` likewise prepares before command execution.
- **Native hooks:** `.codex/hooks.json:68–86` and `.claude/settings.json:78–96` directly import the guards. The guards do **not** call `prepareUsageEnv`. They can inherit the prepared shim/environment, but there is no guarantee of a fresh launch inspection for each hook invocation. Removing inspection from `beginObservation` still removes the measured per-request cost. Do not add preparation to hooks solely to restore advisory cadence.
- **Important hidden path:** `collection.mjs:23` creates a writer inside `reportDiagnostics`. Malformed inherited context generates diagnostics while enrollment can still succeed. If only `beginObservation` opts out, that fallback writer can still sweep on a descendant preparation path.

Smallest recommended correction:

1. Add one writer option, defaulting to existing behavior, that disables **both** startup and periodic automatic retention checks.
2. Pass that option for **every collection-owned writer**, including `reportDiagnostics` and `beginObservation`.
3. In `prepareUsageEnv`, run explicit `usageRetention` once when collection is enabled, enrollment is available, and the **incoming** environment has no inherited context. Handle its warnings/errors locally so failure cannot make preparation return the original environment and lose otherwise available capture.
4. Preserve explicit `usageRetention`, direct-writer defaults, raw capture, enrollment diagnostics and all authority deadlines.

Incoming-context absence is adequate as a scheduling hint. Malformed, inherited, or cross-root context can suppress this advisory scan; enrollment must still validate/reprobe exactly as today. This hint must never become authority.

Targeted regression additions:

- Root preparation performs one inspection; nested preparation and subsequent captured subprocess/HTTP observations perform none.
- Invalid inherited context still persists its diagnostic without inspection.
- Advisory inspection failure retains prepared collection and observations.
- Direct writer defaults and explicit retention still inspect/warn.
- Existing permission-context transition tests (`graphql-usage-collection.test.mjs:301–317,371–379`) retain their enrollment behavior.
- A real captured offline epic snapshot retains all observations and unchanged refusals.

This changes automatic warning cadence to launch-time inspection; long-lived prepared sessions will not refresh advisory warnings until another root launch or explicit report. That is a clear, smaller tradeoff than a persistent scheduler.

No tests, edits, network requests or mutations performed.

## Round 2 author dispositions

Accepted all recommendations. Revised plan specifies launch-only inspection, opts every collection-owned writer out (including diagnostic fallback), preserves direct-writer defaults, catches advisory failures locally, and documents warning cadence and native-hook limitations. Implementation acceptance and captured native validation remain pending.

## Round 3 — verbatim report

## Round 3 — revised design review

**All actionable design findings are resolved in the revised plan. No remaining concrete design issue identified.**

- Lines 18–22 replace shared advisory state with launch-time inspection, preserve direct-writer defaults, exclude every collection-owned writer, isolate advisory failures, and document hook behavior and warning cadence.
- Lines 26–28 require enumeration-based regressions, malformed-context diagnostic coverage, retained permission transitions, and a real captured offline epic snapshot.
- Line 30 preserves finite authority budgets and requires recording the native operation’s exact outcome.

The retained reports and author dispositions accurately reflect my earlier findings and recommendations.

**Scope:** Design review only. Implementation correctness, passing verification and native admission remain unverified. No tests, network requests, edits, binding or Git mutations performed.

## Round 3 author disposition

Accepted. No remaining actionable design findings. Implementation, code review, exact-head verification and bounded native confirmation remain required; this is not product acceptance.
