### Task 5: Close the complete C1 kernel verification and delivery evidence

#### Story Intent

- **Beneficiary:** AITM operator adopting the candidate runtime
- **Capability:** rely on complete publication and exact recovery across supported generations
- **Need:** the new proof can regress existing batches, migration, timing and protected reads
- **Value or failure prevented:** partial authority or unsupported recovery is caught before joint release

#### Files

Existing C1 batch/writer/migration/initialization modules only for demonstrated regressions; C1 catalog/census/timing/pending-ask prerequisites and pure validator hunks; their owned contract/crash/successor tests; exact #1861 receipts and handoff docs under `docs/reviews/1857-remaining-work/`. No C2 whole-file adoption/fixture conversion or staged rename is included.

#### Interfaces Preserve existing sync `writeRuntimeRecordBatch`, `writeRuntimeJsonBatch`, `inspectRuntimeBatch`, `resumeRuntimeBatch`, record reads/locks/whole-operation contracts and all approved v1 digest/retry semantics. Hand off verified empty/activation/linked-v2 schemas, exact signatures/grammar/refusals and contract-test ownership; no consumer implementation claim.

- [ ] **Step 1: Build a complete AC-to-test ledger from the current issue and both specs; identify unproved original kernel/prerequisite behavior.** Cover full before/after journals, binding/actor/global deletion/binary payloads, pending fencing, sync Promise evidence, all real kill boundaries and completed successor timing. Do not copy historical aggregate passes as new acceptance.
- [ ] **Step 2: For every actual C1 regression, add a failing affected contract test, retain RED, minimally repair owned code and retain affected GREEN.** Validate all batch member conflicts before replay and no-fence successor retry without store rewriting; unknown/live/foreign owners and uncertain original census stay blocked. Preserve C2 consumer fixture failures with attribution, rather than silently converting their files or subtracting counts.

```js
const observed = inspectRuntimeBatch({ projectRoot: root, mainRoot: root, operationId });
const before = snapshotTree(root);
assert.throws(
  () =>
    resumeRuntimeBatch({
      projectRoot: root,
      mainRoot: root,
      operationId,
      observedDigest: observed.digest,
    }),
  (error) => error.code === 'RUNTIME_BATCH_CONFLICT'
);
assert.deepEqual(snapshotTree(root), before); // all conflicts are found before any replay.
```

Prepare the conflict by changing a journaled member after inspection inside the fixture. The existing synchronous resume signature accepts physical roots, operationId, observedDigest and internal adapters; an altered observation refuses `RUNTIME_BATCH_CONFLICT` before any member replay. The fixture uses exact owner-death evidence only when the observation itself remains admitted.

- [ ] **Step 3: Run admissible local lint/format and canonical TIA; preserve full candidate identity and evidence.** Full native WIP format/lint failures are inherited findings, not permission to repair unrelated files. Never invoke local full suites or waive failed/denied tests.
- [ ] **Step 4: Commit admitted C1 paths/hunks and open/update the exact candidate PR; obtain complete unit/integration/slow cloud results at its actual SHA.** Capture job URLs, tested SHA, census/lanes, outputs and conclusions. Resolve the supported cloud evidence/lifecycle ingestion route before Test; current local `/task test` adds prohibited full lanes, and a hand-written receipt is inadmissible.
- [ ] **Step 5: After actual CI green, obtain independent GPT-6.1 Sol / Extra High PR review; fix justified findings with affected RED/GREEN and refreshed cloud evidence.** Manual Plan consensus is neither code review nor delivery approval. Attach any created PR to this chat.
- [ ] **Step 6: Re-query scoped AITM Explain and stamp each supported AC/DoD separately using genuine verification authority.** Report CODE_COMPLETE only when all required implementation/evidence obligations are met. Orchestrator/human owns Review, approval, delivery and Close. Provide complete handoffs and pause after #1861; do not start #1862 or claim joint operational admission.

#### Verification Commands

Run: `node --test scripts/tests/integration/task-tracker/lib/runtime-batch-recovery.test.mjs`

Existing issue vc:1 targeted kernel inventory plus new empty/activation/bootstrap tests only when selected by canonical TIA; full issue vc:2–4 in PR/cloud; local lint/format vc:5–6; actual commit identity vc:7. Update the targeted inventory through scoped `issue-body` before stamping new tests; never remove broader requirements to fit local policy.

## Preservation and commits

Before each commit compare the private preservation baseline, protected refs and staged index entries. Stage exact admitted new files and scoped hunks only. Use an exact-path `git commit --only` when necessary to leave the staged actor-flush rename untouched. For shared mixed files, prepare a C1-only index blob from reviewed before/after hunks and verify unstaged bytes remain exact; do not commit the native whole-file consumer WIP. Use `[#1861]` messages, delivered commit-trace if native routing misses the actual commit, and preserve attribution. No authoring credit is assigned to inherited WIP.

## Self-review and human decision

Coverage: Intent/alternatives/absence → Task 1; plan/interfaces/main publication/recovery/ancestors/concurrency → Task 2; activation/control/linked/history/same-path/v1 → Task 3; grammar/identity/status → Task 4; original kernel/prerequisites/cloud/review/reconciliation handoffs → Task 5. All five Review Focus classes have explicit tests. API names, sync/async boundaries, root-keyed IDs and real activation references are consistent. The Plan itself changes no production source.

Ruling (2026-10-03): retain #1861 as the accepted cohesive kernel outcome at XL/20.5h and rank 1. The user expressly confirmed accepted amendment Plan review and rejected decomposition. The earlier kernel review already established that implementation and crash proof are inseparable; counting execution phases and shared dependencies as new independently useful outcomes reopened that settled boundary unnecessarily. The unapproved 42.5h preview is not live estimate authority. Cost if the retained estimate proves insufficient: report actual scope/engagement evidence and reassess with the user; do not silently overwrite the estimate, split the graph or reduce acceptance.

The human confirmation is execution authority in this session, not a fabricated Claude Plan verdict, package XPR acceptance, registered revised forecast, historical approval marker, test receipt or delivery. Preserve the original artifacts and their provenance. Exact-candidate confinement, complete applicable verification, cloud evidence and final code review remain necessary. No further Plan/decomposition confirmation is requested.
