# #1767 Correct Feasibility Recheck Implementation Plan

> **For agentic workers:** Work only in the recorded #1767 child worktree. Run each focused test red before implementing its behavior, and commit with `[#1767]` attribution.

**Goal:** Recheck the fixed #1558 GO condition against complete guidance obligations and one representative, provenance-bound public-CLI lifecycle transcript.

**Architecture:** Preserve the #1765 and #1676 artifacts as historical inputs. Add an opt-in authority-complete mode to the existing lifecycle capture runner; its default mode and #1765 artifact stay unchanged. The #1767 recertification report binds a distinct new capture, the completed rule map, and proposed static text to exact digests. The existing assertion command uses the current report and fails closed on stale identities or a NO-GO verdict.

**Tech Stack:** Node.js 26, `node:test`, Git, AITM public CLI, isolated fixture GitHub double.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` §§15, 18, 20; #1767 Scope and Deep-Dive Analysis.

## Story Intent

- **Beneficiary:** release reviewer
- **Capability:** obtain a provenance-bound post-catalog feasibility recheck
- **Need:** the existing modeled GO does not include complete obligations or representative actual CLI traffic
- **Value or failure prevented:** downstream migration opens only when the fixed GO condition is truly met

## Global Constraints

- The fixed working maxima are 4,000 router plus pickup, 240 clean response, 400 representative blocked response, and 5,600 full lifecycle proxy tokens. Absolute maxima are 5,000 / 300 / 500 / 7,000. Do not raise either set.
- Preserve `scripts/tests/fixtures/1558/actual-explain-traffic.json`, `actual-explain-traffic-corrected.json`, `feasibility-recheck-1676.json`, and `context-comparison-1676.json` exactly. Preserve the default #1765 runner behavior.
- Use actual public `aitm explain` output. Fixture transitions must carry full state/evidence digests and be labeled as fixture injection; no query is an execution grant. Never fabricate a ready result or execute a blocked action for measurement.
- Count exact command input, stdout, stderr, receipt-bearing arguments, and required explicit diagnostic once. Retain all warnings and operational arguments.
- Current proposed text must cover all 41 map rows through enforcement or retained protocol, with no installed-adapter cutover in this issue. Keep WBS 8 as the sole foundation GO authority and record this as its versioned recertification.

## Files and Responsibilities

- Extend `scripts/maintenance/capture-guidance-lifecycle.mjs` with an opt-in authority-complete fixture mode and a new artifact output path; do not change the default capture shape or its artifact.
- Repair the discovered production `aitm explain --action deliver` read path in `scripts/task-tracker/verbs/explain.mjs`: route it through the existing read-only delivery evaluator with an explicit read-port allowlist. Its current generic observation adapter cannot read `delivery`, so this action is indeterminate regardless of actual authority. This is required to measure a real delivery decision in this child, not a new sibling defect.
- Repair the discovered Close read path in `scripts/task-tracker/lib/action-decision/close.mjs`: use the existing read-only external PR source-history reader, and use the registered Review exit guard as producer so a genuine missing receipt yields a valid blocked explanation instead of an envelope validation exception.
- Add `scripts/tests/integration/task-tracker/lib/guidance-recertification-capture.test.mjs` for contiguous authority, public subprocess output, refusal/remediation, diagnostic, external boundaries, exact traffic, and historical preservation.
- Extend `scripts/maintenance/measure-guidance-candidate.mjs` so `--all --assert-feasible --json` validates and reports the current recertification instead of accepting the old candidate model as current.
- Extend `scripts/tests/unit/task-tracker/lib/guidance-candidate-measurement.test.mjs` with stale/missing/map-incomplete/capture-subset/traffic-duplication failures and the fixed-budget verdict.
- Add distinct `scripts/tests/fixtures/1558/actual-explain-traffic-recertification.json` and `feasibility-recheck-1767.json`; use the existing `obligation-complete-static/` directory, revising those four proposed files only if a map-to-protocol review proves an obligation missing.

## Task 1: Representative Current Capture

1. Write tests that reject the #1765 capture as a GO input because the Plan/Develop/Review/Close fixture authority is incomplete, while proving its original artifact and default runner still validate as historical evidence.
2. Add an opt-in fixture mode that supplies the board, body markers, local session/binding, dependency, verification, review, and delivery evidence consumed by each action evaluator. Reuse the production public `aitm explain` subprocess. Only the fixture input changes between queries; record every revision and body digest.
   2a. Test the public Deliver path red before wiring the existing delivery evaluator. Use only its read methods, and verify it never invokes a mutation method. Keep the public CLI transcript as the acceptance path.
3. Test the exact ordered schedule: first load, matching receipt, post-compaction reload, one representative blocked refusal, explicit diagnostic, remediation, changed instruction, each lifecycle decision, external approval and merge reads, and Done verification. Require one connected authority history and account for all agent-visible traffic once.
4. Commit runner and tests, generate the new artifact from that exact source commit, then verify its source and fixture read-back. A failing budget is a recorded NO-GO, not a test failure for transcript integrity.

## Task 2: Current Recertification Gate

1. Add red tests showing that the old candidate-model GO is stale, the #1676 NO-GO report remains historical, and omission or mutation of current capture, map, static text, runner, source, fixture, or transcript identity is refused.
2. Validate each completed map row against its exact enforcement or retained-protocol anchor and proposed static obligation. Read the #1676 draft static files by bytes, not the old Appendix A arithmetic assumption. Measure the current public-CLI capture's traffic, static files, clean and blocked responses, total, and reduction against the preserved equivalent legacy baseline.
3. Generate `feasibility-recheck-1767.json` with all source and file digests, separate current and historical labels, and unchanged fixed-budget verdicts. Make `--all --assert-feasible --json` exit 0 only for a current GO; ordinary `--all --json` reports honest NO-GO without hiding any failed check.
4. Run focused tests and the assertion command. If the result is NO-GO, investigate the measured cause within this issue; do not edit budgets, remove a required query, or advance #1677.

## Task 3: Governed Verification and Delivery

1. Run the two focused VC1 files, the VC2 assertion, lint, format, fast and slow suites. Inspect the identity envelope and historical file diffs.
2. Stamp each AC with its cited verifier and update the commit trace at the final child head. Run AITM's exact-head Test, Review, and Full-Auto approval gates.
3. Merge back through the owned #1558 epic command, push the verified epic head, close #1767 only after ready delivery/close evidence, and record the outcome in the Writing Studio Good Fences stub.
