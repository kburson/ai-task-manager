# Governed Spike Deliverable Writer Implementation Plan — #2156

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the native author session. Steps use checkbox syntax for tracking.

**Goal:** Attach a genuine existing spike report through a registered, native-authorized, source-stable transaction so later no-commit delivery has honest deliverable evidence.

**Architecture:** A small pure validation module owns arguments, comment observations and strict marker checks. A native verb owns fresh actor/source/issue authority, provider reads and the governed versioned body transaction. Existing no-commit delivery, resident-audit Close and epic reconciliation retain their contracts.

**Tech Stack:** Existing Node ESM, node:test, Git/GitHub provider adapters and native AITM authority; no new dependency.

**Spec:** `docs/superpowers/specs/2026-11-05-2156-spike-deliverable-writer-design.md`.

## Scope

One Develop-only spike-deliverable command, its focused validators, native registration, adversarial tests and operator activation documentation. This code-bearing issue does not advance or activate #2146, alter #2145/#2153 evidence, overlap #2155, or repair shared Claude.

## Plan Metadata

- Priority: P0
- Size: M
- Estimate: 4 hours
- Labels: enhancement
- Implementation plan: docs/superpowers/plans/2026-11-05-2156-spike-deliverable-writer.md
- Specification: docs/superpowers/specs/2026-11-05-2156-spike-deliverable-writer-design.md

## Story Intent

- **Beneficiary:** native operator completing an investigative spike
- **Capability:** publish a validated same-issue deliverable
- **Need:** the existing no-commit lane has no registered spike writer
- **Value or failure prevented:** genuine findings retain attributable evidence without fabricated source commits or manually authored authority markers

## Acceptance Criteria

- Native actor, binding, ownership, Develop/spike and actual source checks precede all writes; the comment is genuine, current and same-issue.
- Fresh mutation/readback refuses conflicts and drift, preserves history and unrelated content, and makes identical retries byte-preserving no-ops.
- Registered public workflow and existing no-commit/epic contracts are tested; separately qualified #2146 activation is documented.

## Global Constraints

- Operate only on an open spike in Develop. Do not change kind/stage or accepted Test/Review evidence.
- Require actual native binding/timer, singleton authenticated ownership and clean tracked/index source at unchanged actual HEAD; no identity override or caller-provided source substitution. HEAD is an around-write invocation precondition, not persisted by the URL/timestamp marker; later Test/Review/delivery receipts alone bind accepted source.
- Add only the existing deliverable marker wire format through governed fresh mutation; never hand-stamp evidence or create a spike commit trail.
- Validate the current comment before each write and after readback. Refuse changed observations; do not require historical unedited reports.
- Preserve existing no-commit delivery, resident-audit Close and epic-only reconciliation; no new dependency or broad reader refactor.
- Keep real Git/native binding/body-writer checks in integration, not unit; identify transport seams honestly and never call fixture success native host qualification.
- Both spec and plan require ordered sealed Claude review before implementation. Official launch/resume requires per-command `PATH="$HOME/.local/bin:$PATH"`, `DISABLE_AUTOUPDATER=1` and fresh actual runtime health; shared CLI repair belongs to epic owner.
- #2147 owns the native Test slot until released; no concurrent Test verb.

## Review Focus

- Same URL with noncanonical/invalid marker `ts`, malformed or duplicate claims cannot become false idempotent success: Task1 strict-marker table.
- Comment changes between fetch, retry and final readback cannot inherit stale validation: Task1 observation-race cases.
- Same checkout/issue with changed binding generation, paused timer or dirty index cannot keep old native authority: Task1 native/source integration cases.
- Provider returns an unrelated current body or a nominal no-op missing the intended marker: Task1 readback-negative cases.
- A declared new command that never reaches required native preflight cannot become an ungated alternate writer: Task2 registered-dispatch/preflight tests.

## File Structure

- Create `scripts/task-tracker/lib/spike-deliverable.mjs`: pure argument, comment-observation/identity and strict deliverable-marker validation.
- Create `scripts/task-tracker/verbs/spike-deliverable.mjs`: guarded native transaction and public verb output.
- Modify `scripts/task-tracker/task-tracker.mjs`, `lib/command-surface/catalog.mjs` and `verbs/help-data.mjs`: canonical registration, required-target preflight and help.
- Modify only necessary command/effect/admission/grammar inventories and exact package-boundary entries exposed by actual invariants.
- Create `scripts/tests/unit/task-tracker/verbs/spike-deliverable.test.mjs`, `scripts/tests/integration/task-tracker/spike-deliverable.test.mjs` and focused test fixture if needed.
- Create `docs/workflows/spike-deliverable.md`. The verified package `files` list excludes `docs/workflows`; add its repository URL to the existing shipped `skill/shared/rules/evidence.md` and route this verb there in `skill/shared/router.md`. Do not add a new packaged rule file or extra package allowance.

## Implementation Tasks

### Task 1: Guarded spike publication transaction — 2 hours

#### Story Intent

- **Beneficiary:** native operator completing an investigative spike
- **Capability:** bind a genuine report to the spike through fresh native authority
- **Need:** existing marker helpers alone cannot authenticate the operator, source or current report
- **Value or failure prevented:** a report is published only from the actual owned source and cannot silently overwrite conflicting provenance

**Interfaces:** Consumes the existing governed mutation, kind/marker, native operator, ownership/live-state, proof-authority and scoped-deliverable primitives named in the spec. Produces:

- `parseSpikeDeliverableArgs(argv) -> {issueNumber:number, commentReference:string}`; exact required target and one --from-comment option, unknown/duplicate/malformed input refuses.
- `validateSpikeDeliverableComment({repository,issueNumber,commentId,currentUser,comment}) -> observation`; validates full current REST evidence and normalizes no evidence bytes.
- `spikeDeliverableCommentIdentity(observation) -> string`; deterministic comparison of ID, URL, author, body and creation/update metadata.
- `readSpikeDeliverableMarker(body) -> null | {url:string,ts:string}`; throw a categorized refusal for absent/duplicate Progress Markers sections, ambiguous boundaries and malformed/bare/duplicate claims. Return `null` only for exactly one valid section with zero marker claims. A single marker must round-trip through the existing strict parser before idempotency.
- `runSpikeDeliverable(ctx,deps={}) -> Promise<{status:'recorded'|'no-op',issueNumber:number,url:string,sourceSha:string}>`; captures actual native authority and unchanged source, validates every fresh attempted mutation and final readback. `sourceSha` is a diagnostic observation, not persisted acceptance evidence. Default dependencies use real native authority and provider adapters.
- `verbSpikeDeliverable(ctx) -> Promise<void>`; usage failures exit2, supported runtime/authority refusals exit1 with `spike-deliverable:<category>`, success exit0 only from verified run result. Public dispatcher wiring is Task2.

- [ ] **Step 1: Write missing-behavior RED tests in both declared suites.** A valid Develop/spike/owned-current-comment fixture must produce one marker and `status === 'recorded'`; same URL retry must return `no-op` with identical body and original timestamp. Wrong kind/stage/actor/source/comment cases must reject and leave captured writes empty. Assert both real produced marker URL and unchanged unrelated bytes, not a mock's existence.
- [ ] **Step 2: Run `node --test scripts/tests/unit/task-tracker/verbs/spike-deliverable.test.mjs scripts/tests/integration/task-tracker/spike-deliverable.test.mjs` and retain the expected RED for the absent writer, not unrelated fixture/bootstrap failures.**
- [ ] **Step 3: Implement the exact pure interfaces and native guarded transaction.** Use existing parse/serialize helpers, native binding capture and reassertion, live owner/state readers and scoped-deliverable admission; bind fresh scope/stage/visit/receipt authority. Default source observation checks actual HEAD and tracked/index cleanliness. Use real `mutateIssueBody` fresh closure and both fresh-base hooks, and verify returned version/body, current comment and operator/source before reporting success.
- [ ] **Step 4: Expand RED→GREEN tables for all spec refusals.** Cover cross-repo/issue/ID URLs; empty/deleted/bot/wrong-author report; valid edited current report and malformed comment metadata. Marker cases explicitly include: same-URL noncanonical/invalid `ts` refuses rather than no-op; out-of-section marker-looking prose and fenced examples are ignored; absent/duplicate Progress Markers headings and ambiguous boundaries refuse; malformed/unterminated and fenced in-section claims count and refuse; two in-section claims refuse even when one is malformed or differs only by letter case; valid-section zero claims returns `null`. Also cover bare/conflicting-URL claims; every prohibited state/kind; missing/paused/native generation drift; dirty index/source movement; ownership/state loss on retry; unrelated concurrent additions preserved; comment edit/deletion at each observation; missing/mixed/stale provider readback and uncertain post-write result. Every negative asserts no success; pre-write failures additionally assert no remote body write. Real Git/binding records and real governed versioned transaction stay in integration with provider transport isolated.
- [ ] **Step 5: Run both targeted suites and required existing epic/no-commit/Close regressions.** Expected all pass, zero skipped, with original epic non-epic refusals unchanged. Record counts and exact substituted boundaries.
- [ ] **Step 6: Before committing, run `npx aitm verify-develop --mode iteration --issue 2156`, the registered carrier for `node scripts/task-tracker/verify-develop.mjs`.** Retain the affected-check result; fix failures before committing. Then commit the focused files with `[#2156]` and update native commit-trace. No manufactured spike commit attribution; this commit belongs to the new code issue only.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/verbs/spike-deliverable.test.mjs
node --test scripts/tests/integration/task-tracker/spike-deliverable.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/epic-reconcile.test.mjs scripts/tests/unit/task-tracker/verbs/close-no-commit-delivery.test.mjs
npx aitm verify-develop --mode iteration --issue 2156
```

### Task 2: Registered native workflow and operator contract — 2 hours

#### Story Intent

- **Beneficiary:** native operator completing an investigative spike
- **Capability:** invoke the guarded writer through the supported public workflow
- **Need:** an unregistered helper is unavailable to the native session and cannot establish supported delivery evidence
- **Value or failure prevented:** operators can publish findings without bypassing preflight, altering issue kind or confusing runtime installation with source acceptance

**Interfaces:** Consumes Task1's `verbSpikeDeliverable(ctx)` and exact `spike-deliverable <issue> --from-comment <id|url>` grammar. Produces canonical registered target-required dispatch/help and operator instructions. Existing delivery/Close record schemas remain unchanged.

- [ ] **Step 1: Add RED public tests.** Spawn the public CLI for help and usage (missing/duplicate/unknown options exit2, no writes), and exercise registered dispatch plus actual target-required preflight/refusal. Extend the real integration fixture to demonstrate marker publication feeding the existing no-commit deliverable contract, and refusal to reinterpret a code/epic issue as a spike. Do not use source-text presence as the behavior assertion.
- [ ] **Step 2: Run the targeted suites to observe those failures before registration.** Retain the precise failure evidence.
- [ ] **Step 3: Register dispatch, preflight, catalog/help and necessary governed effect/command inventories.** Add only this operation and the two intentional runtime package entries; retain exact package ceiling and unit purity. Do not add an artifact-selection alias or broaden epic-reconcile.
- [ ] **Step 4: Write the operator guide.** Explain current-comment publication in Develop, unchanged native source subject, conflicts and post-write uncertainty, no-commit qualification/delivery, and the separately reviewed/qualified #2146 runtime activation route. Never instruct an operator to hand-stamp a marker, change kind, fake a commit trail or copy a runtime into the blocked source.
- [ ] **Step 5: In Develop, run both targeted suites, existing regressions and affected repository invariants, then the per-commit `npx aitm verify-develop --mode iteration --issue 2156` carrier of `node scripts/task-tracker/verify-develop.mjs`.** Expected pass, zero skipped. Fix actual failures narrowly and preserve RED logs. Full population unit/integration/slow, CodeQL and package-compatibility regression belongs to the remote PR CI pipeline and qualified native Test stage in its isolated source worktree, not a local Develop full-suite checklist. Require successful CI at the final exact head before native Test.
- [ ] **Step 6: Commit `[#2156]`, obtain independent whole-source acceptance at the final exact SHA and refresh all native AC proof.** After coordinator releases Test exclusivity, native Develop finalization/Test/Review/approval and fresh delivery intent qualify that exact source; use only sanctioned expected-head provider merge and live delivery reconciliation, then authoritative Close/Done. Preserve source/history.

**Verification Commands:**

Develop uses the two targeted suites and per-commit iteration. The full-lane commands below name the populations exercised by remote CI and native Test's configured provider/receipts; they are not instructions to run full populations locally in Develop.

```sh
node --test scripts/tests/unit/task-tracker/verbs/spike-deliverable.test.mjs
node --test scripts/tests/integration/task-tracker/spike-deliverable.test.mjs
npx aitm verify-develop --mode iteration --issue 2156
npm test
npm run test:integration
npm run test:slow
npm run lint
npm run format:check
```

## Completion and limits

The new production issue is complete only after reviewed exact-source delivery and native CLOSED/Done readback. Old #2146 investigation checks are not this code's proof. This plan performs no live #2146 publication, runtime activation or state change; the original owner/coordinator must qualify those separately from the delivered implementation.
