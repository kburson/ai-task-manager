# Guarded Timing Reengagement Repair Implementation Plan — #2157

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This issue's coordinator assigned native inline execution in the existing checkout; do not spawn implementers or create another branch/worktree.

**Goal:** Let the genuine Review operator remove only explicitly selected proven redundant zero-work returns, with preserved evidence and truthful recovery.

**Architecture:** A pure closed parser and candidate builder reuse the unchanged strict healer. A native verb qualifies current authority, holds the same timing exclusion with a live-owner lease, archives exact evidence and performs one correlated canonical update/readback. Public routing admits this specific operation while arbitrary interpreter activity stays blocked.

**Tech Stack:** Existing Node ESM, node:test, built-in fs/crypto/child_process, existing AITM native session/ownership/Review helpers and GitHub transport; no new dependency.

**Spec:** docs/superpowers/specs/2026-11-05-2157-timing-reengagement-repair-design.md

## Global Constraints

- Issue #2157 only; actual branch codex/2156-draft in the assigned spike-deliverable-writer-3516 checkout; retain all #2156 ancestors and receipts. Reserved timing-repair-2157 checkout/codex/2157-draft are untouched.
- Public command is `npx aitm timing-reengagement-repair <issue>` with exactly one mode, explicit unique zero-based repeated `--row-index`, and required original `--source-digest sha256:<64 lowercase hex>` on apply. No foreign/artifact/file/script/relaxation selectors.
- OPEN Review, genuine active session/timer/visit/ownership/physical binding and clean unchanged source; validated `receipt-v1` current-HEAD Test evidence only. No passed Agent Review prerequisite; complete prospective registry must pass with actual context.
- Existing strict same-second predicate is mandatory for each selected row against original bytes. Delete only selected lines; preserve actor work, refs, Unknown totals and every other byte/history. No implicit sweep or partial success.
- Native timing lock exclusion includes live-owner protection; no retries of the whole callback. Retain immutable original/candidate/manifest before remote effects in fixed sharedRuntimeRoot/evidence namespace, supporting the current unmigrated runtime.
- No source implementation until genuine ordered Claude spec/plan acceptance, native planned estimate/approval and posted/mirrored/completed deep dive. Later live #2147 activation is separate and requires genuine delivered source integration and wholly fresh qualification.

## Scope and Context

The observed #2147 zero-based rows54/55/56 match the existing demoted:develop/resumed/develop:started predicate. The legacy Node carrier is WRITE_CODE and blocked in Review; command registration is absent. Another genuine integration visit can add a second eligible triple. Explicit finite selection and whole-candidate validation solve this without general maintenance or timing waivers.

Source anchors: scripts/task-tracker/lib/heal-timing-departure.mjs::recoverRedundantSameSecondReengagement; scripts/task-tracker/gh-timing-comment.mjs::readCanonicalTimingSource/updateTimingComment; scripts/task-tracker/locks.mjs::withLock; scripts/task-tracker/lib/artifact-execution.mjs::captureArtifactOperator; scripts/task-tracker/verbs/review.mjs::resolveReviewVerificationEvidence; scripts/task-tracker/lib/agent-review/bootstrap.mjs and review-gate.mjs; scripts/task-tracker/lib/runtime-storage.mjs root/path APIs. The runtime control file is absent in this checkout; evidence must not require migrating it.

## Plan Metadata

- Priority: P0
- Size: M
- Estimate: 6 hours (three focused two-hour tasks; revised from initial Refine4 after builder exposed required lock integrity and authority-mode checks)
- Labels: bug

## Story Intent

- **Beneficiary:** task operator
- **Capability:** repair a proven redundant zero-work reengagement through the governed workflow
- **Need:** the strict healer has no supported Review admission
- **Value or failure prevented:** Review can finish without fabricated work or loss of original timing and source evidence

## Review Focus

1. A live timing owner exceeds the old30-second threshold: a competing native writer must wait or time out, never steal the lock; covered by Task1 competing-process test.
2. A second genuine source-integration visit adds another malformed triple: explicit selection may remove both, while an unselected malformed row blocks all writes; covered by Task2 prospective-gate integration.
3. Valid-looking legacy/directory authority lacks a Test fingerprint: refuse before archival/remote effects; covered by Task2 real qualification-mode test.
4. Unmigrated runtime and partial evidence publication: retain safely without creating activation records; partial/symlink/corrupt evidence must block mutation; covered by Task2 journal tests.
5. A transport error followed by exact candidate readback: prove applied from correlated observation or report uncertainty, and never issue a speculative second write; covered by Task2 and Task3 public retry tests.

## File Map

- Modify scripts/task-tracker/locks.mjs: optional leased acquisition supported by all lock contenders, preserving old caller API and unleased semantics.
- Modify scripts/tests/unit/task-tracker/lib/locks.test.mjs and create scripts/tests/integration/task-tracker/lib/timing-lock-lease.test.mjs: deterministic primitive cases and real holder/contender/dead-process behavior.
- Create scripts/task-tracker/lib/timing-reengagement-repair.mjs: pure grammar, source/operation digest, strict finite selection and evidence validation; no Git or provider I/O.
- Create scripts/task-tracker/lib/timing-reengagement-evidence.mjs: durable package-owned path, exclusive exact immutable artifacts and append-only observation; no authority decisions.
- Create scripts/task-tracker/verbs/timing-reengagement-repair.mjs: live native admission/qualification, full-census context, exclusion, transaction and truthful result.
- Modify scripts/task-tracker/gh-timing-comment.mjs only compatibly as needed to expose full canonical census comments to the new consumer, preserving existing source shape and error behavior.
- Create scripts/tests/unit/task-tracker/lib/timing-reengagement-repair.test.mjs and scripts/tests/unit/task-tracker/lib/timing-reengagement-evidence.test.mjs: pure matrix and filesystem evidence cases without Git.
- Create scripts/tests/integration/task-tracker/timing-reengagement-repair.test.mjs and scripts/tests/fixtures/timing-reengagement-provider.mjs: public CLI/real native fixture and explicit fake transport.
- Modify scripts/task-tracker/task-tracker.mjs, scripts/task-tracker/verbs/help-data.mjs, scripts/task-tracker/lib/command-surface/catalog.mjs: targeted closed public routing/preflight/help; adjust actual catalogue/runtime admission inventory only when its canonical generator shows required change.
- Modify scripts/tests/unit/task-tracker/lib/activity-policy-classify-bash.test.mjs and scripts/tests/unit/task-tracker/core/task-tracker-preflight-target.test.mjs: exact literal public command and malformed target admission; raw/compound interpreter regression stays blocked.
- Modify scripts/tests/unit/task-tracker/core/package-boundary.test.mjs for measured runtime-file allowance and exact inclusion/exclusion.
- Create docs/workflows/timing-reengagement-repair.md; modify existing shipped skill/shared/router.md and skill/shared/rules/evidence.md to link the guide with terse operation boundary. Do not ship private evidence or entire new guide by convenience.

## Implementation Tasks

### Task 1: Preserve timing exclusion for a live repair owner — 2h

#### Story Intent

- **Beneficiary:** task operator
- **Capability:** keep cooperating timing writers excluded during a live repair
- **Need:** the current lock can be reclaimed after30 seconds despite a living holder
- **Value or failure prevented:** repair qualification and publication cannot silently overlap another native timing write

**Interfaces:** Extend `withLock(lockPath, fn, options)` with `lease:true` and callback capability `{assertOwned():void}`. Existing callbacks and callers remain valid. Leased fn executes once with retries0. All acquire paths honor leased directories, even when the contender did not request a lease. Internal process observation may use existing process helpers if they establish the required safe liveness semantics. Permission errors/unknown/PID reuse are alive-or-ambiguous, never dead.

- [ ] Step1: Add failing primitive tests for valid leased owner beyond stale age, an unleased contender honoring the lease, missing/corrupt owner after discriminator, dead owner recovery, replaced inode/token, and foreign release. Existing legacy unleased tests must remain unchanged and passing.
- [ ] Step2: Run `node --test scripts/tests/unit/task-tracker/lib/locks.test.mjs`; require new assertions fail against age-only reclamation.
- [ ] Step3: Implement exclusive lease-mode discriminator before owner publication/callback, process identity/token owner record, liveness-aware reclamation and token/inode-checked cleanup. If acquisition stops between discriminator and owner publication, preserve/refuse the partial lease. Missing discriminator with unexpected entries is ambiguous, not an empty old lock. Assertions fail before/after effects when metadata changes. Keep stale/unleased retry waiting bounded; never tight-loop forever on an unremovable lease directory.
- [ ] Step4: Add real competing-process integration using a controlled old directory mtime or injected stale threshold; assert contender cannot enter while owner lives, dead complete owner is recovered and a replaced directory is not released by the prior owner. No long wall-clock sleeps.
- [ ] Step5: Run `node --test scripts/tests/unit/task-tracker/lib/locks.test.mjs scripts/tests/integration/task-tracker/lib/timing-lock-lease.test.mjs` and inspect all pass. Commit exact task paths as `[#2157] Keep live timing repair locks exclusive`.

### Task 2: Qualify and execute a retained strict repair transaction — 2h

#### Story Intent

- **Beneficiary:** task operator
- **Capability:** remove selected redundant returns with retained original evidence and exact readback
- **Need:** a write or lost response otherwise cannot establish safe current-source repair authority or truthful retry
- **Value or failure prevented:** real work and verification history survive and uncertain transport never becomes fabricated success

**Interfaces:**

- `parseTimingReengagementRepairArgs(rest) -> {issueNumber,mode:'check-only'|'apply',rowIndices:number[],sourceDigest?:string}` is pure and closed; rejects option-first issue and unknown/duplicate scalars.
- `buildTimingReengagementCandidate({body,rowIndices}) -> {candidate,selectedRows}` calls the unchanged helper for each original row, enforces stricter removable metadata boundary, rejects conflicting neighborhoods, then deletes descending physical lines. It never selects implicitly.
- `timingReengagementSourceDigest({repository,issueNumber,commentNodeId,body,sourceHead}) -> 'sha256:…'` uses canonical unambiguous encoding; operation key additionally includes sorted selection.
- `retainTimingReengagementEvidence({projectDir,manifest,original,candidate}) -> retainedRecord` and `readTimingReengagementEvidence({projectDir,issueNumber,operationKey}) -> retainedRecord|null` own exclusive filesystem persistence and strict validated readback in fixed sharedRuntimeRoot/evidence/timing-reengagement-repair. No caller paths. Manifest schema `aitm.timing-reengagement-repair/v1`.
- `runTimingReengagementRepair(ctx,deps={}) -> {status:'checked'|'applied'|'already-applied',issueNumber,commentNodeId,sourceHead,sourceDigest,candidateDigest,rowIndices,evidencePath?}`. Errors have stable `timing-reengagement-repair:<reason>` codes and indicate uncertain postwrite outcome distinctly. Dependencies are explicit test injection, never CLI/env bypasses. No body/lifecycle/evidence stamping occurs.
- A compatible canonical census result may add `comments` while preserving existing `status/source/error`. Full census identities/bodies must correlate with the unique source. The native wrapper uses production gate bootstrap and resolveReviewVerificationEvidence in receipt-v1 mode only.

- [ ] Step1: Write pure tests for observed2147 triple; two original-snapshot candidates; byte-identical other rows, refs, totals and non-table content; unknown mode/target/hash/selection; actor/ref/trailing-metadata/Unknown/positive-work/time/cursor/adjacency near misses. Assert each invalid case throws before candidate publication. Run new pure test and observe missing-module/API failure.
- [ ] Step2: Implement closed grammar and pure candidate/digest functions. Run new pure suite plus existing strict healer and maintenance CLI tests; all pass without modifying their predicate or fixtures to broaden admission.
- [ ] Step3: Write filesystem tests for exclusive immutable original/candidate/manifest, exact digest/schema/identity revalidation, lost/partial/corrupt artifacts, symlink ancestors/files, collision, unmigrated runtime and existing invalid controls. Assert failure means zero writer calls; first run fails without evidence implementation.
- [ ] Step4: Implement evidence leaf with registered physical-root/path checks, exclusive publication and exact readback. Keep immutable evidence separate from result observations. Recovery rederives candidate from retained original and selection, not trusting stored candidate alone.
- [ ] Step5: Write native integration tests with real Git/session/binding/occupancy and explicit synthetic provider/qualification records. Exercise production authority, current fingerprint/receipt and whole gate; no fake `ready:true` shortcut. Cover actual Review entry then timing-only failure, both selected new-visit triples, unrelated/unselected failure, mode legacy-marker/directory refusal, owner/root/visit/source drift and dirty index. Initial new native path must fail before implementation.
- [ ] Step6: Implement native wrapper: validate current open Review owner/frame/occupancy/timer; current clean HEAD; valid exact receipt/fingerprint; full comments/canonical identity; actual workflow policy and diff; strict candidate; full prospective gate no normalization. Under Task1 lease revalidate frame and all remote authority, retain evidence, reobserve exact source, update once, correlate exact readback and final authority. Check-only never archives or mutates. No whole-callback retry. Use bounded native API timeouts and actual locked ownership assertions.
- [ ] Step7: Add failure-injection tests for source drift after check, archive failures, postwrite generation/owner/source drift, ambiguous update with exact candidate readback, unchanged-original retry, foreign candidate, wrong node ID, readback failure and repeated apply requiring zero further writes. Missing archive on candidate state cannot yield already-applied. Run new pure/evidence/integration suites and existing healer/CLI/activity tests; require all green.
- [ ] Step8: Commit exact task paths as `[#2157] Retain and verify strict Review timing repairs`.

### Task 3: Expose and prove the guarded public operation — 2h

#### Story Intent

- **Beneficiary:** task operator
- **Capability:** invoke the exact repair from Review through a discoverable supported command
- **Need:** the current only carrier is refused arbitrary Node maintenance
- **Value or failure prevented:** operators can complete legitimate Review repair without timing-only demotion or guard bypass

**Interfaces:** `verbTimingReengagementRepair(ctx)` invokes Task2 native wrapper, prints its bounded result and exits2 for grammar,1 for authority/uncertainty. Register a target-required verb and run the same pure parser at the early public-entry grammar boundary; no opaque first-integer target inference. The public CLI must not admit foreign/artifact flags before rejecting them. CLI status is evidence only when native exact readback established it.

- [ ] Step1: Add real subprocess tests invoking `npx aitm timing-reengagement-repair`/package-owned bin in the disposable Review fixture. Assert initial failure is actual unknown-command or absent route; distinguish it from a valid refusal by prefix/code. Add help and malformed option-first target tests proving no timers/provider effects.
- [ ] Step2: Register target-required catalogue/routing/preflight/help using Task2 parser. Preserve actual hook invocation for the literal `npx aitm` form; change classifier only if a failing production-path test requires a narrow command admission. Never whitelist arbitrary `node`, script basename, compound source effects or maintenance directory.
- [ ] Step3: Exercise actual native activity hook in Review with valid check/apply and negative raw Node healer, unrelated script, compound source write and malformed public grammar. Assert public operation reaches native guards and negative activity stays refused. Prove API outcomes and retained evidence from the CLI, including same-original-digest retry after lost response and no duplicate remote update.
- [ ] Step4: Run npm pack boundary check to expose exact new runtime delta. Update allowance by measured required leaves only and assert each new runtime file included, fixture/scratch/evidence/new repository guide excluded. Validate generated guidance/catalogue through canonical tools; never fabricate a changed artifact if checks already pass.
- [ ] Step5: Write operator guide with exact syntax, zero-based indices/digest semantics, strict eligibility, storage/recovery/uncertainty limits, normal re-review and separate qualified2147 activation. Update only terse shipped pointers and matching version sentinels where needed.
- [ ] Step6: Run targeted integration, pure/evidence/locks, existing healer/CLI/activity, routing/help and package-boundary tests. Run lint/format appropriate to changed files; commit `[#2157] Expose guarded Review reengagement repair`.

## Verification and completion sequence

- [ ] Enrich root VC2 through governed issue-body operation with new pure/evidence/lock tests, or add stable root VC8 and cite it for ACs as appropriate; keep existing root VC IDs stable. Do not create appendix checkbox sections.
- [ ] Run required native Develop finalization at clean committed source and individually stamp/tick ACs with root commands. Coordinate exclusive native Test slot with coordinator before Test; one genuine Test pass at final accepted source owns full unit/integration/slow and required root checks.
- [ ] Obtain fresh independent most-capable-model whole-branch source review, disposition every finding in durable artifacts and accept exact final SHA. Run checks appropriate to any fixes; no reuse of old #2156 code acceptance.
- [ ] Execute native Review/approval/delivery under coordinator AFK authority, required CI and exact provider merge handoff. Native Close only after verified delivery and fresh native readiness; preserve original branch/source/receipts. Do not bypass sanctioned merge integration with shell commands.
- [ ] Report source delivery separately from live activation. Do not repair2147, activate2146, reuse de353Test proof on new code, or change2145/2071.

## Self-review

Every spec section maps to Task1 exclusion, Task2 native/strict/durable transaction or Task3 public/package/operator surface. The five review-focus cases each have an explicit owning test step. Interfaces share issueNumber/sourceHead/sourceDigest/rowIndices consistently. All tasks include their own failing test, production change, passing test and issue-tagged commit; no independent feature or generic maintenance framework is introduced. Initial6h is an author assessment, not published Plan authority until the native planned-estimate operation succeeds after review. Native Explain remains the next lifecycle authority.
