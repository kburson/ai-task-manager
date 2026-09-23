# #1677 Paired Context and Authority Measurement Implementation Plan

> **For agentic workers:** Execute the checked steps in order. Use test-first changes and keep each resulting report bound to committed source and fixture bytes.

**Goal:** Produce a reproducible, complete before/after context comparison for both adapters, real-token calibration, and separately measured authority cost so #1678 can certify the final installed release.

**Architecture:** Preserve the WBS Task 1 frozen Markdown baseline and #1767 coherent public-CLI capture as separate immutable inputs. A new paired runner projects the same ordered lifecycle and authority transitions through each workflow, retains raw agent-visible streams, and partitions their costs without overlap. A shared budget module supplies both the existing static meter and the new full-transcript gate. Deterministic request counts remain separate from sampled latency.

**Tech Stack:** Node.js ESM, `node:test`, existing AITM observation-port fixtures, a pinned development-only tokenizer, JSON evidence artifacts.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`; accepted WBS source `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md`, Task 25.

## Global Constraints

- Frozen legacy bytes, source SHA, runner, scenario and authority fixture identities do not change.
- #1767's 24-event current CLI recertification remains a distinct, replay-verified source. It is a proposed-static GO, not installed-adapter release proof.
- Fixed absolute ceilings: router plus pickup 5,000; routine clean 300; representative blocked 500; representative full lifecycle 7,000 proxy tokens.
- Working ceilings with at least 20% unused headroom: 4,000 / 240 / 400 / 5,600. Never raise them.
- Static files round individually using `Math.ceil(text.length / 4)`. Aggregate traffic rounds once using `Math.ceil(totalTrafficCharacters / 4)`.
- All commands, stdout, stderr, receipt input/output, repeat metadata and required explicit diagnostics are agent-visible traffic. Legacy traffic is nonzero.
- The final `--assert-budgets` mode must remain red until #1678 supplies actual final loaded adapter text and CLI traffic.
- Calibration names its actual tokenizer package/version/encoding and scope; proxy estimates never become model-token claims.

## File Map

- `scripts/task-tracker/lib/context-budgets.mjs`: shared immutable budget definitions and assertion helpers.
- `scripts/task-tracker/measure-context.mjs`: current static scenarios imported from shared budgets; keep unrelated idle/parallel meanings.
- `scripts/task-tracker/measure-guidance-context.mjs`: CLI and reusable `buildGuidanceContextReport`, `validatePairedTranscript`, `assertGuidanceBudgets` exports.
- `scripts/maintenance/capture-guidance-lifecycle.mjs`: additive paired mode that reuses the isolated fixture while preserving historical and recertification modes.
- `scripts/tests/helpers/guidance-paired-context.mjs`: test-side fixture reader and comparison assertions; no production mutation or authority bypass.
- `scripts/tests/integration/task-tracker/lib/guidance-context.test.mjs`: behavioral and fail-closed coverage.
- `scripts/tests/fixtures/1558/lifecycle-transcript.json`, `context-budgets.json`, `tokenizer-calibration.json`, `authority-after.json`: generated current evidence; `context-comparison.json` gets a distinct paired section, retaining old characterization unchanged.
- `package.json` and `package-lock.json`: development-only tokenizer pin.

### Task 1: Capture paired lifecycle and calibrate context

#### Story Intent

- **Beneficiary:** release reviewer
- **Capability:** inspect equivalent complete lifecycle context evidence for both adapters
- **Need:** the frozen Markdown baseline and current public CLI must represent the same work without hidden traffic
- **Value or failure prevented:** context reduction claims retain all commands, receipts, diagnostics, and real-token calibration

#### Execution Detail

##### Establish Paired Input Authority

- [ ] Add integration tests that read frozen legacy files and #1767 capture by exact path and digest, require the same scenario and authority transition identifiers for both adapter workflows, and reject a missing compaction/repeat/diagnostic event.
- [ ] Run `node --test scripts/tests/integration/task-tracker/lib/guidance-context.test.mjs` and observe the expected red assertion.
- [ ] Add a distinct paired transcript construction path that copies the 24-event order, labels fixture transitions and external approval/merge separately, and keeps all original command/stdout/stderr bytes. Reuse historical Markdown text snapshots without recapturing or modifying the WBS Task 1 baseline artifact.
- [ ] Run the focused test green and commit the transcript runner and its first generated fixture.

##### Shared Budgets and Complete Accounting

- [ ] Add tests for eight exact fixed values, separate per-file static rounding, one aggregate traffic rounding, byte/character reconciliation, zero uncounted agent-visible bytes, and rejection of incomplete or double-counted categories.
- [ ] Run the focused test red.
- [ ] Implement `context-budgets.mjs`; import it in `measure-context.mjs` and `measure-guidance-context.mjs`. Keep idle/parallel static budgets explicitly labeled while adding invoked-plus-pickup and full lifecycle limits.
- [ ] Implement report categories for static instructions, operational input, operational stdout/stderr, receipt input/output, explicit diagnostics, and repeat/compaction metadata. Record exact source commits, raw stream paths and digests, totals, delta, actual-vs-modeled label, and working/absolute verdicts for Claude and Codex.
- [ ] Run focused tests and both existing static meters; commit the accounting implementation.

##### Calibrate Tokens and Heavy Inputs

- [ ] Add tests requiring package/version/encoding, exact input bytes, tokenizer tokens, proxy tokens and ratio for clean, blocked, repeated, diagnostic and full-lifecycle streams; assert the report does not claim universal provider equivalence.
- [ ] Run the focused test red; pin the selected tokenizer in development dependencies and lockfile.
- [ ] Generate calibration from raw committed streams. Add a reachable heavy case with declared child/dependency/refusal counts, preserve typed operational args, and record unbounded dimensions without inventing a universal cap.
- [ ] Run focused tests, verify generated artifact from formatted source bytes, and commit.

Run: `node --test scripts/tests/integration/task-tracker/lib/guidance-context.test.mjs`

### Task 2: Measure authority costs and publish the pre-slim report

#### Story Intent

- **Beneficiary:** release reviewer
- **Capability:** compare Explain and executor authority reads and inspect a reproducible pre-slim report
- **Need:** cheaper text can conceal extra remote reads or policy collection
- **Value or failure prevented:** release remains gated until exact request invariants and full context costs are measured

#### Execution Detail

##### Authority and Timing Accounting

- [ ] Add tests comparing Explain and executor read-only collection on unchanged inputs: physical reads match, in-attempt duplicates are zero except named refresh, baseline passes do not load workflow policy, waivable failures enrich only their scope, and same-invocation diagnostics add no reads.
- [ ] Run the focused test red; extend the existing observation-port ledger fixture and generate `authority-after.json` with per-resource read counts, retry/page counts, separate explain-then-execute collection, and post-success annotation lookup plus at most one absent-record write.
- [ ] Keep deterministic request ceilings exact. Record local-cache and stub timings separately from controlled live median/p95 samples; set reviewed CI timing ceilings with at least 20% headroom.
- [ ] Run focused tests and commit the authority report.

##### Pre-Slim Report and Gate

- [ ] Generate `context-budgets.json`, `lifecycle-transcript.json`, `tokenizer-calibration.json`, `authority-after.json`, and the distinct current paired section of `context-comparison.json` from formatted inputs, then re-read and compare each to regeneration.
- [ ] Run `node scripts/task-tracker/measure-guidance-context.mjs --all --json`; require successful honest accounting, including legacy command traffic and current actual CLI traffic.
- [ ] Run `node scripts/task-tracker/measure-guidance-context.mjs --all --assert-budgets --json`; require nonzero while installed adapter static text remains above the final fixed gate, with explicit modeled/pre-slim classification.
- [ ] Run `node --test scripts/tests/integration/task-tracker/lib/guidance-context.test.mjs`, `npm test`, `npm run test:slow`, `npm run lint`, and `npm run format:check`; commit the current evidence.
- [ ] Re-read the #1677 issue ACs, stamp each declared verifier, and submit the exact committed head to AITM Test. #1678 owns final installed-adapter release proof.

Run: `node scripts/task-tracker/measure-guidance-context.mjs --all --json`
