# Refine publication recovery implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement the single task with test-first verification and independent final review.

**Goal:** Recover an interrupted Refine publication explicitly while preserving its predecessor effects and ordinary drift refusals.

**Architecture:** Add `refine --supersede-pending` and pass its opt-in through the field writer to the existing predecessor reconciliation owner. A distinct operation key preserves retry identity; only a pending Refine predecessor may be superseded by this path. Existing ownership, fresh authority, effect readback and one-step state movement remain authoritative.

**Tech Stack:** Node 26.8.1, JavaScript ESM, node:test, existing AITM publication owner.

**Spec:** AITM #2142 Scope and mirrored deep dive, consuming Project-Estimator #205.

## Global Constraints

- Never edit consumer publication records directly or detach children to restore an old digest.
- Ordinary exact retries retain semantic-drift refusals.
- Reconcile every registered predecessor effect before a new publication, retaining its operation ID and observed effects.
- Refine supersession requires complete current authority and a pending Refine predecessor.
- Successful Refine still advances one state only; no Plan/Develop or other lifecycle gate is waived.
- Keep existing command keys unchanged when the recovery flag is absent.

## Review Focus

- A normal exact retry after changed authority must remain refused.
- An explicit retry after a partial recovery must resume the same new operation.
- Missing authority must refuse before a business effect starts.
- Another writer's pending operation must not be silently superseded by Refine.
- CLI parsing must reject duplicate recovery flags and expose the option through help.

## Task 1: Add explicit Refine predecessor recovery

**Files:** modify `scripts/task-tracker/verbs/refine.mjs`, `scripts/task-tracker/lib/decomposition-field-writer.mjs`, `scripts/task-tracker/lib/estimate-writer-publication.mjs`, `scripts/task-tracker/verbs/help-data.mjs`, `docs/guides/decomposition-recovery.md`; create `scripts/tests/unit/task-tracker/lib/decomposition-refine-recovery.test.mjs`; extend `scripts/tests/unit/task-tracker/verbs/refine-verb.test.mjs`.

**Interfaces:** `parseArgs(argv)` recognizes boolean `supersedePending`; `runRefine({args,cfg,deps})` passes the explicit option through `publishFieldEstimateRevision`; `executeEstimateWriter` reconciles the registered pending Refine predecessor before publishing a distinct recovery operation. Existing arguments and ordinary operation keys remain unchanged.

- [ ] Write real-publication tests proving ordinary retry refusal, explicit recovery with retained predecessor effects, retry idempotency, incomplete-authority refusal and foreign-writer refusal. Write CLI parse/duplicate tests.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/decomposition-refine-recovery.test.mjs scripts/tests/unit/task-tracker/verbs/refine-verb.test.mjs`; observe the missing recovery behavior fail before implementation.
- [ ] Implement the opt-in path and help/recovery documentation using the existing reconciliation owner. Include the opt-in in the operation key only when true.
- [ ] Re-run focused tests and existing decomposition/stage completion tests; expect zero failures.
- [ ] Run `npm test`, relevant lint/format and `git diff --check`; investigate every failure and preserve evidence.
- [ ] Obtain independent review of the exact branch diff; address material findings, verify amended code and commit with `[#2142]` attribution.
- [ ] Package the reviewed repair without publishing unrelated source. Validate installed package identity and actual Project-Estimator #37 recovery before claiming #205 resolved.

Self-review: this is one recovery behavior, with one source owner. Every global constraint and review input has a targeted check. Consumer integration and live workflow readback remain separate from source test results.
