# #1675 Guidance Explanations, Receipts, and Diagnostics Implementation Plan

> Issue: #1675  
> Branch: `feature/child/1675`  
> Estimate: 22h / L (unchanged)

## Goal

Expose a compact, fresh, read-only `aitm explain` command and an explicit diagnostic mode over the existing action-decision engine. Repeated agent instructions may be suppressed only by caller-provided matching receipts. Human guidance remains separately queryable, and actual public-CLI traffic becomes the feasibility evidence for later #1558 migration work.

## Constraints

- Evaluate authority exactly once per invocation and never accept effect-capable ports.
- Keep routine output closed and free of full decisions, raw diagnostic messages, human prose, and evidence-only fields.
- Treat `--known` and `--known-source` as caller attestations only; do not persist or recover them.
- Preserve the immutable legacy baseline and existing candidate artifacts.
- Keep mutation commands independently fresh; explanation is never execution authority.

## Task 1: Lock the protocol with failing receipt tests

Files:

- Create `guidance/protocol.mjs`.
- Create `scripts/tests/unit/task-tracker/lib/guidance-receipts.test.mjs`.
- Modify `scripts/task-tracker/lib/action-decision/presentation.mjs`.
- Update the existing presentation tests and candidate fixtures that validate the initial envelope shape.

Steps:

1. Add RED tests for the exact `ID@sha256:<64 hex>` known-receipt grammar, repeated receipts, irrelevant IDs, malformed values, mismatched digests, human-only changes, agent changes, and caller-state reset.
2. Add RED tests for optional `sourceReceipt`: exact prefix and lowercase digest, presence only with an unsuppressed typed source-divergence warning, rejection of missing, extra, malformed, partial, or mismatched values in both routine and diagnostic envelopes.
3. Implement pure protocol helpers that select agent catalog entries, emit expanded or not-modified guidance, derive/suppress the independent source receipt, and validate the final closed envelope.
4. Keep `presentActionDecision` responsible for operational projection and reuse `validateExplanationEnvelope` as the final fail-closed boundary.
5. Run the receipt/presentation unit tests to GREEN.

## Task 2: Add the read-only explain engine and public CLI

Files:

- Create `scripts/task-tracker/verbs/explain.mjs`.
- Create `scripts/tests/integration/task-tracker/lib/guidance-explain.test.mjs`.
- Modify `scripts/task-tracker/task-tracker.mjs`, `bin/aitm.mjs`, and action-evaluator runtime adapters as narrowly required.

Steps:

1. Add RED public-command tests for generic navigation, all seven explain-ready actions, all five registered pending actions, unknown vocabulary, `rebind`, terminal Done, unknown/conflicting state, and authority-collection failures.
2. Add strict argument parsing for `aitm explain N [--action ID] [--known ID@DIGEST] [--known-source RECEIPT] [--diagnostic] --json`; reject duplicate singleton flags, missing values, unsupported shapes, and non-JSON public use if the issue contract requires JSON.
3. Build a dedicated read-only runtime that gathers current issue/config/state inputs and observation ports, invokes `evaluateAction` once, projects the result, resolves guidance through the static cache, validates the whole envelope, and writes one JSON value.
4. Construct diagnostic output from that same decision and bundle. Preserve raw messages only as `untrusted: true`; never auto-enable diagnostic mode for blocked or indeterminate results.
5. Add effect traps covering network writes, issue mutations, locks, session/timing changes, Git ref mutation, tests, review/provider calls, and evidence stamps. Assert clean stderr and no routine diagnostic/human leakage.
6. Test a routine timeout followed by a fresh successful diagnostic call; prove no retrieval/persistence claim and no extra diagnostic-only reads.

## Task 3: Register aliases, help, and human-detail recovery

Files:

- Modify `scripts/task-tracker/lib/command-surface/{routing,catalog,entrypoints}.mjs`.
- Modify `scripts/task-tracker/verbs/{promote,review,close,help,help-data}.mjs` and self-doc data where the repository's canonical alias metadata requires it.
- Modify `scripts/task-tracker/guidance.mjs`.
- Extend command-surface, help, self-doc, and guidance recovery tests.

Steps:

1. Register `explain` as a canonical read-only verb and route generic/next/review/close explain forms into the same engine without duplicating evaluator logic.
2. Verify every alias resolves to the same action ID, envelope schema, effect-free behavior, and exit semantics.
3. Add `guidance explain ID` as human catalog inspection only. Return source/trust, summary, explanation, triggers, execution, examples, references, and fingerprints without issue-readiness evaluation.
4. Prove invalid catalogs continue to allow source, validate, help, and version recovery but refuse human explain; preserve the unchanged workflow-preflight JSON contract.
5. Run catalog/help/self-doc parity tests to GREEN.

## Task 4: Capture actual traffic and enforce feasibility

Files:

- Extend `scripts/tests/helpers/guidance-characterization.mjs` and the smallest appropriate measurement helper.
- Add distinct actual-capture artifacts under `scripts/tests/fixtures/1558/`; do not modify preserved legacy baseline bytes.
- Extend the focused integration tests with capture identity and budget assertions.

Steps:

1. Execute deterministic public CLI scenarios for first load, matching repeat, agent change, source-only change, compaction/reset, blocked result, and explicit diagnostics.
2. Record complete stdin/argv/stdout/stderr and typed fields with stable source/runner/fixture digests. Compare actual semantics against candidate expectations without relabeling candidate output as actual evidence.
3. Enforce 240-byte clean and 400-byte blocked routine limits. Count source warning and receipt once each when present.
4. Publish current unslimmed totals separately from the modeled proposed-static end state. Combine actual traffic only with explicitly identified proposed adapter text and enforce 4,000/5,600 feasibility plus improvement over the equivalent legacy baseline.
5. Cross-check authority reads and cardinalities against the preserved Task 1 inventory. A breach fails VC14 and blocks later migration work.

## Task 5: Verify, review, and deliver

1. Run VC14:

   `node --test scripts/tests/integration/task-tracker/lib/guidance-explain.test.mjs scripts/tests/unit/task-tracker/lib/guidance-receipts.test.mjs`

2. Run focused action-decision, guidance cache/admission, command-surface, help, self-doc, and characterization regressions.
3. Run `npm test`, the integration suite, the slow suite, `npm run lint`, and `npm run format:check` (or the repository-equivalent check command).
4. Confirm the exact reviewed commit contains #1675 attribution and that `git diff --check` is clean.
5. Complete semantic plan review before Develop and code review before merge-back. Resolve all findings or record an evidence-backed disposition.
6. Merge back through the governed epic workflow, push `feature/epic/1558`, relocate the binding if required, and close #1675 only after exact-head verification and approval.

## Milestone checkpoints

- M1: Protocol/receipt RED-to-GREEN.
- M2: Read-only public CLI RED-to-GREEN with effect traps.
- M3: Alias/help/human-recovery parity GREEN.
- M4: Actual capture and all feasibility gates GREEN.
- M5: Full repository verification, review, merge-back, and closure.
