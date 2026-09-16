# #1558 Ask-the-Script Guidance Replacement Implementation Plan

> **For agentic workers:** After manual plan acceptance and issue hydration, use the executing-plans skill to implement the assigned child task. Checkboxes describe future implementation work; none is completed by authoring this document.

**Goal:** Reduce complete agent-context consumption relative to the current Markdown workflow while preserving every enforced lifecycle requirement and the fixed context budgets.

**Architecture:** Keep one full `aitm.action-decision/v1` evaluator/executor contract. Project it through a pure, validated `ActionPresentationV1` into the routine `aitm.action-explanation/v1` envelope. Explicit diagnostics expose the complete same-invocation decision. A validated, content-addressed YAML catalog supplies only missing operational instructions; a disposable compiled cache avoids repeated static validation. Existing locks, fresh authority collection, guarded mutations, and approval/provider boundaries remain authoritative.

**Tech Stack:** Node.js >=24, ECMAScript modules, `node:test`, injected Git/GitHub ports, SHA-256, minified JSON, `js-yaml` 5.4.2 syntax events, and repository-local scratch fixtures. The current package version is 0.1.0 and is unshipped; production-package references below are release requirements, not claims of an existing published release.

**Spec:** `/Users/kpburson/.codex/worktrees/ac27/ai-task-manager/docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` (repository-relative identity: `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`).

**Source provenance:** Drafted against repository commit `e10d6ed80f5897835dbfe5850a23b014be257a73`. Source-spec SHA-256: `2e121b01863952df69ac13bb373bf9c2d671e1e04027b047289f96647d9eea78`; amendment closure commit: `0d22a887d7f2ab90e58f6f159add85badfc70e30`. Technical amendment agreement was recorded against `41a336449a460ed73fa616e06ecc54a1514405c4341460889aab14a35f7c1d07` at `ae51f9d23e553b8123629d48cfa1997b7d5ed60c`; the closure digest above is the source for this plan. Closing records are `docs/superpowers/reviews/1558/spec/2026-09-16-1558-ask-the-script-guidance-design-amendment-r3-reviewer-claude-review.md` and the corresponding `-author-codex-response.md`.

**Status:** Manual author/reviewer agreement reached in replacement-plan round 3; all six findings are closed and no further review round is required. Technical agreement is pinned to SHA-256 `ecce0ee53314729481b8a1139409732b9862b6d25d1dddbbd4618e98d6df8ffe` at commit `20aaadc6` before this status-only closure. Closing records are `docs/superpowers/reviews/1558/plan/2026-09-16-replacement-round-3-reviewer-claude.md` and `docs/superpowers/reviews/1558/plan/2026-09-16-replacement-round-3-author-codex.md`. Human acceptance remains pending. Agreement does not establish feasibility, authorize hydration, or approve runtime implementation; the pre-hydration sizing and Task 1b GO gates remain mandatory. Preserve source-spec and historical review bytes, including their historical status wording.

**Supersession:** This replacement targets `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance.md` (SHA-256 `6810a378cc1ba3fff051fcf72032278efc955af053eb76b8b059de9e033e79f1` at the repository baseline). Preserve that file and its review history. Its full-bundle wire format and synthetic NO-GO do not govern the amended presentation. No amended feasibility measurement exists yet; neither success nor impossibility is claimed. Only an accepted replacement may become the backlog source.

## Global Constraints

- The catalog is never enforcement authority; a successful explanation is never a grant. Execute only through existing sanctioned boundaries and refresh authority under the normal lock.
- Keep full evidence identities, full HEAD values, source observation times/revisions/digests, snapshot identity, and normalization intent digests internally. Neither a presentation nor an earlier full decision is executable input or a reusable authorization capability.
- Routine output contains only the closed seven-field operational result and required guidance/receipt protocol. Preserve every typed operational value without truncation. Do not add evidence-only provenance, raw messages, human prose, or automatic diagnostic fallback.
- All arrays, nulls, blocker/warning/request `args`, and mode-required fields are explicit. Unknown keys/versions and malformed or semantically inconsistent data fail closed. A valid empty array must also be tested for semantic preservation, not just schema validity.
- Free text is data. Only registered actions/remediations with validated arguments can select operations. Never infer commands, subjects, approvals, or remedies from raw text.
- `.ai-task-manager/aitm-guidance.yml` is the only project override. It must be tracked and wholly shadows the module-resolved package source. Invalid selection never falls back. Init/upgrades never create it.
- Invalid catalogs block before network access, lock acquisition, session/issue mutation, guards, or provider action. Only validation/source/help/version are recovery routes; human guidance explanation is not an exception.
- Bare action IDs remain in `lib/lifecycle-policy/actions.mjs`; no YAML state machine or `workflow.*` aliases. `workflow-preflight` retains its narrower compatibility contract. #1559 recycling, #1560 pipeline configuration, and #1561 plugin execution remain outside scope; the shared decision contract remains compatible with #1561.
- YAML anchors, aliases, merge keys, and custom tags are forbidden. Decode UTF-8 strictly; report one-based lines and UTF-16 columns over LF-normalized source.
- There is no `projectedDigest` over rendered body bytes. Normalization intent excludes timestamps, proposed SHA stamps, and rendered markers; persistence remains execution-only after readiness.
- Cache only validated static guidance under `.tmp/aitm/guidance-cache/`. No authority cache, dynamic-decision diagnostic archive, receipt ledger, daemon, SQLite, compression codec, or binary wire format. B1 and B2 ship together.
- Receipts attest instructions still present in current context. Discard after compaction, clear, fresh worker start, or sentinel invalidation even if markers appear in a summary. Evidence/provenance is not a receipt or a reliable test of model memory.
- Fixed absolute proxy ceilings are **5,000 / 300 / 500 / 7,000**, respectively router-plus-pickup / routine clean response / representative routine blocked response / representative full lifecycle. CI requires >=20% unused headroom: **4,000 / 240 / 400 / 5,600**. Never raise them. Explicit diagnostic traffic required by the pinned lifecycle counts in its unchanged total.
- Keep all known required causes for indeterminate results, all warnings in order, and all simultaneous human requests. Heavy reachable cases are measured separately with declared inputs; fixture maxima are not universal limits or permission to truncate.
- Preserve Node compatibility, current provider-action authorization, guard strength, mutation exit codes, scratch isolation, and production-only downstream installation.

## Backlog hydration and delivery boundaries

Keep #1558 as parent. Each task is a proposed child with its own story, scope, ACs, and verifier. Numbers below are plan identities, not invented GitHub issue numbers. Hydration happens only after manual plan consensus and human acceptance, through `scripts/gh/create-issue.mjs --shape sub-issue --parent 1558` or its supported orchestrator. Never use direct `gh issue create`, advance state during hydration, or give each child the entire epic as its implementation scope.

| Task | Workstream              | Proposed child title                                                       | Prerequisites |
| ---- | ----------------------- | -------------------------------------------------------------------------- | ------------- |
| 1a   | A1 / D characterization | Inventory source/effects/flags and freeze the legacy workflow baseline     | None          |
| 1b   | A1 / D characterization | Certify candidate semantics and measure the single feasibility decision    | 1a            |
| 2    | A1                      | Establish the complete shared decision and typed vocabulary contract       | 1b GO         |
| 3    | A1 / C                  | Validate and project the compact operational result                        | 2             |
| 4    | A2                      | Extract immutable authority collection and complete guard evaluation       | 3             |
| 5    | A2                      | Project Functional DoD and persist it only after readiness                 | 4             |
| 6    | A2                      | Share bind, resume, and early promotion readiness                          | 4, 5          |
| 7    | A2                      | Share Test entry readiness without running tests in explanation            | 4, 5          |
| 8    | A2                      | Share Review readiness and evidence-dependent navigation                   | 6, 7          |
| 9    | A2                      | Share delivery readiness without invoking providers                        | 4             |
| 10   | A2                      | Share close readiness and complete lifecycle parity                        | 5, 8, 9       |
| 11   | B1                      | Validate guidance syntax, schema, references, and field locations          | 2             |
| 12   | B1                      | Enforce guidance source trust and operational admission                    | 6–11          |
| 13   | B2                      | Compile and cache valid and invalid guidance results                       | 12            |
| 14   | C                       | Expose routine explanations, receipts, and explicit diagnostics            | 3, 10, 13     |
| 15   | D                       | Hydrate the guidance catalog and migrate human documentation               | 14            |
| 16   | D                       | Capture paired CLI transcripts, tokenizer calibration, and authority costs | 15            |
| 17   | D                       | Slim both adapter protocols and certify measured reduction                 | 16            |

Execution order starts 1a → 1b → 2 and then follows the dependency table. Task 1 is shorthand for the two characterization children, never a hydratable combined story. Task 1a uses VC1; Task 1b uses VC18, retaining established VC2–VC17 identities. There are 18 proposed children and 18 verifiers. Task 11 can follow Task 2 without waiting for A2, but this is not authorization to dispatch agents. Both characterization children exclude runtime foundation/extraction changes. Task 1b owns the sole feasibility decision. If it records NO-GO, its honest accounting tests (VC18) can pass while its separate `--assert-feasible` gate fails; Tasks 2–17 remain blocked. A passing candidate is only early feasibility, not release evidence. Actual CLI capture supersedes it before cutover.

After acceptance, pin this plan's commit/digest and each child's `Source-plan`, `Source-plan-commit`, and `Source-plan-section`; copy its story, scope, ACs, and exact verifier to sanctioned hydration fragments and record native dependencies/WBS. All later tasks may be represented in Backlog with explicit prerequisites, but none is execution-ready before its gates pass. At Refine, estimate actual scope and split tasks exceeding the current atomic threshold (review at 16 hours or three tasks; split at 24 hours or four). Tasks 1a, 1b, 4, 8, 10, and 12 require explicit scope/estimate scrutiny before hydration; splitting characterization here does not waive the atomic threshold. If 1a still exceeds it, split inventory and baseline-harness capture into native prerequisite children and pin the WBS before hydration; 1b cannot start until both are complete. Likewise split 1b if required, retaining one final feasibility decision owner. No implementation-size estimate is claimed by this plan; retain all parity/entrypoint cases in any split and pin a WBS revision before work.

**Mandatory characterization sizing before hydration:** Record inventory/flag-analysis and harness-plus-baseline as separate estimated deliverables, each with hours, implementation-task count, uncertainty and proposed owner, plus their combined Task 1a totals, in the reviewed decomposition/WBS record. This review always occurs before hydrating Task 1a, not at its implementation Step 5. Apply the existing threshold to each half and their combined scope: 16 hours or three implementation tasks triggers size review; 24 hours or four requires a split and a pinned WBS revision before hydration. A threshold-crossing half must itself be decomposed; separating it from the other half is insufficient. Task 1b depends on every resulting inventory/harness child, and remains the sole feasibility-decision owner. Unknown estimates block hydration until resolved; they are not a below-threshold result. These are planning estimates for decomposition, not speculative Backlog size/estimate field writes. The same pre-hydration sizing rule applies to Task 1b's scope.

Before implementation in each child worktree, run `bash scripts/dev-env/setup-local-worktree.sh` and `node scripts/dev-env/verify-local-worktree.mjs`; verify `node_modules/ai-task-manager -> ..`. Bind the actual assigned child and reconcile requested issue, board, binding, branch, and attribution. Preserve required plan acceptance and existing state workflow. Use the assigned issue in tests/commits, not this document's task number. Stage only the task's files after its checks pass.

## Feasibility, comparison, and release gates

1. **Before runtime foundation:** Task 1a inventories all seven actions and captures the current Markdown workflow; Task 1b verifies clause-to-oracle coverage and measures candidate presentation against the same coherent lifecycle and authority fixtures. Required cases include ready, representative blocked, indeterminate, normalization, warnings, and applicable policy enrichment. Candidate fixture serializers stay under test/maintenance tooling and cannot authorize execution. Record exact input/source/schema/serializer identities and every character; no guessed observation count or synthetic sixteen-call schedule.
2. **Before further content migration:** Task 14 replays the pinned scenarios through the actual CLI and compares production serialization with candidate semantics. Retained legacy adapter text may still exceed final totals: separately report actual current totals and explicitly modeled end-state static text. Actual clean/blocked responses and the end-state feasibility projection must pass working maxima before Task 15. This checkpoint cannot claim the still-unmigrated release passes.
3. **Before cutover/release:** Tasks 16–17 replace all modeled candidate traffic/static text with actual captured CLI output and final adapter loads. Both adapters must show lower complete total context than the equivalent preserved Markdown baseline and meet all four working maxima. Count required investigations. An increased total, incomplete baseline, missing category, or budget breach fails acceptance. Revise within the budgets and repeat the affected measurements; do not relax thresholds.
4. **Joint loader/cache release:** Task 12 installs a failing release certification requirement until Task 13 proves B2. No operational-loader consumer release may omit cache certification. Final package acceptance also requires action parity, protocol conformance, context reduction, and authority cost evidence.

**Draft static assumption and recheck:** Task 1b measures the exact bytes of proposed static text, but its obligation completeness is provisional until Task 15 completes `rule-guidance-map.json`. Record that assumption and its remaining static/lifecycle margins in `feasibility-decision.json`; do not describe it as certified retained protocol. The round-1 Codex probe was reproduced at this baseline: shim 237 + adapter 1,249 + router 2,150 + installed pickup 1,400 = 5,036 proxy tokens. A hypothetical 60% retention of the latter three files gives about 3,117 including the unchanged shim, below 4,000. This is arithmetic sensitivity, not a measured obligation-complete draft or a guarantee for Claude/full-lifecycle traffic. Task 15 must replace the draft assumption with the complete obligation-mapped proposed text for both adapters, rerun the same feasibility command against current CLI traffic, and record the new digests/totals before Task 16 or skill removal. Failure stops migration for revision within the fixed budgets; the original baseline stays frozen. Task 17 still requires final actual loaded text and traffic.

Use `Math.ceil(text.length / 4)` for each loaded static file and `Math.ceil(sumOfTrafficCharacters / 4)` for cumulative request/response traffic, matching the repository proxy convention. Sum those terms for the lifecycle; do not multiply rounded per-response deltas. Also record exact UTF-8 bytes. Tokenizer calibration records actual package/version/encoding and its scope; no claim that one tokenizer represents every provider.

The paired scenario uses actual state/evidence transitions and §18 query boundaries: after bind/resume, before an unsettled lifecycle action, after refusal/drift, after required external approval/merge, and after compaction. Include first/repeat/changed-entry/reload cases, explicit remediation, and any required diagnostic investigation. Do not query before every ordinary edit/read/test/Git command, execute blocked actions for measurement, or choose an artificially easy blocked case. Pin why the representative blocked case is representative using the refusal inventory. Report a separate reachable heavy case with declared child/dependency/refusal inputs and uncertainty; it is not a new universal 7,000-token gate. Never hide a heavy result or drop its operational values.

The reproducible `context-comparison.json` contains baseline/candidate source commits, adapter/tool versions, scenario and authority fixture digests, ordered transcript paths, per-category counts (static instructions, operational input/output, receipts, explicit diagnostics), total counts, delta, and fixed-budget verdicts for each adapter. Categories partition counted text without overlap; retain the original complete streams. Legacy lifecycle commands and outputs are nonzero. Different per-category costs are expected; compare totals for the same work. Preserve baseline runner, loaded file bytes, and authority fixtures before migration. Label candidate serialization versus actual CLI capture explicitly.

**Parser selection:** Planning inspection confirms installed `js-yaml@5.4.2` exports `parseEvents`, `getScalarValue`, and `constructFromEvents`. Task 11 must prove the full raw-range/UTF-16/forbidden-syntax contract and move that exact version to production dependencies. Include parser/adapter versions in compiler identity. No unreviewed fallback to another parser or plain `load()`.

## File and interface map

All paths below are repository-relative. New modules live beside the existing authority they extend. Avoid adding more policy to the already large verb files.

| Location                                                                                                                               | Responsibility                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `scripts/task-tracker/lib/lifecycle-policy/actions.mjs`                                                                                | Sole action enumeration, allowed-state policy, evaluator/executor bindings          |
| `scripts/task-tracker/lib/action-decision/contract.mjs`                                                                                | Decision/blocker/normalization schemas and validation                               |
| `scripts/task-tracker/lib/action-decision/presentation.mjs`                                                                            | Pure operational projection, closed result/envelope validation, diagnostic boundary |
| `scripts/task-tracker/lib/action-decision/remediations.mjs`                                                                            | Closed typed remediation registry and prohibited selections                         |
| `scripts/task-tracker/lib/action-decision/legacy-refusals.json`                                                                        | Frozen, source-fingerprinted migration inventory                                    |
| `scripts/task-tracker/lib/action-decision/observations.mjs`                                                                            | Attempt-scoped immutable read collection and provenance                             |
| `scripts/task-tracker/lib/action-decision/evaluate.mjs`                                                                                | Complete two-pass guard/preflight orchestration                                     |
| `scripts/task-tracker/lib/action-decision/normalization.mjs`                                                                           | Ready-only persistence/readback orchestration                                       |
| `scripts/task-tracker/lib/action-decision/{session,promote,test,review,deliver,close}.mjs`                                             | Per-action read-only requirements and shared executor preflights                    |
| `scripts/task-tracker/lib/action-decision/navigation.mjs`                                                                              | Evidence-dependent navigation atop existing lifecycle policy                        |
| `scripts/task-tracker/lib/functional-dod-project.mjs`                                                                                  | Pure ordered DoD projection                                                         |
| `scripts/task-tracker/lib/guidance/{source,positions,parse,validate,documentation,fingerprints,requirements,admission,annotation}.mjs` | Source selection, full validation, trust, operational admission, divergence audit   |
| `scripts/task-tracker/lib/guidance/{compile,cache-identity,cache,protocol}.mjs`                                                        | Split artifacts, disposable cache, conditional response expansion                   |
| `instructions/aitm-guidance.yml`                                                                                                       | Complete published agent/human catalog                                              |
| `instructions/aitm-guidance.schema.json`                                                                                               | Authored catalog shape and closed grammar                                           |
| `instructions/aitm-guidance.release.json`                                                                                              | Published raw-file fingerprint and schema metadata                                  |
| `scripts/task-tracker/{guidance,measure-guidance-context}.mjs`                                                                         | Recovery/human CLI and captured-response measurement harness                        |
| `scripts/task-tracker/verbs/explain.mjs`                                                                                               | Generic and targeted dynamic explanation                                            |
| `scripts/tests/helpers/action-decision-fixtures.mjs`                                                                                   | Frozen authority, effect spies, and canonical verb/mutator harness                  |
| `scripts/tests/helpers/guidance-fixtures.mjs`                                                                                          | Valid/invalid YAML, installed-source and index fixtures                             |
| `scripts/tests/fixtures/1558/`                                                                                                         | Baselines, transcript fixtures, tokenizer calibration, budget artifacts             |
| `docs/guides/ask-the-script.md`                                                                                                        | Maintainer protocol, adoption, trust, failure recovery, performance evidence        |

Additional existing authority owners and test seams:

- `scripts/task-tracker/lib/lifecycle-policy/executable-transitions.mjs` owns `forwardTarget`; `states.mjs` owns state identities/normalization; `index.mjs` re-exports them. Read/reuse these modules; do not redefine their policy in `actions.mjs`.
- `scripts/task-tracker/lib/state-bootstrap.mjs` walks `scripts/task-tracker/states/{index,backlog,refine,ready-for-plan,plan,develop,test,review,done}.mjs`; `lib/guard-bootstrap.mjs` is only the compatibility shim. Task 1 inventories registrations and Task 2 defines their contracts; Task 4 removes the stale mutable-context contract, and Tasks 6–10 migrate producer families.
- `scripts/task-tracker/lib/close-gates.mjs` → `trunk-ref.mjs` currently performs `git fetch`; `commit-attribution.mjs` consumes ref-scoped commit messages. Task 10 extracts a read-only attribution observation seam; Task 4 classifies/prohibits ref mutation in explanation.
- `scripts/task-tracker/lib/context-budgets.mjs` will own shared scoped budget constants for both measurement tools (Task 16), with legacy static scenarios explicitly distinguished from full captured lifecycle acceptance (Task 17).

The interfaces below are planned additions, not claims that these APIs already exist. Define their JSDoc shapes in Task 2 and export them from the owning modules; consumers must use the same names.

```js
// actions.mjs: descriptors are data; importing the registry cannot start verbs.
listLifecycleActions(); // frozen [{id, evaluator, executor, readiness: 'pending'|'complete'}]
// All 12 descriptors: the current nine actions plus bind, resume, deliver.
// Non-v1 refine/demote/shelve/park/cancel-plan retain executor/state policy,
// evaluator: null and readiness: 'pending'. No invented executable handler.
// actionPolicyFor stays in actions.mjs; forwardTarget stays in executable-transitions.mjs.

// contract.mjs / remediations.mjs
validateActionDecision(decision); // throws a named contract error on invalid data
normalizeRefusal(raw, { guardId, legacyInventory }); // typed Blocker; siteId is lint provenance only
validateRemediation({ id, args }); // validates core registry and prohibits bypasses
vocabularyDigest(); // SHA-256 over versioned actions, guards, boundaries, resources,
// code definitions/args, warnings, human-request kinds/subject mappings, remediations.

// observations.mjs
createObservationAttempt({ repository, issue, boundaryId, now, read });
// attempt.observe({resource, identity, scope, refresh}) -> Promise<Observation>
// attempt.finish() -> deeply frozen bundle; attempt.invalidate(reason) -> void
// read(request) -> {value, revision?}; attempt records digest/time even without revision.

// evaluate.mjs: dependencies are explicit read-only ports, never a full mutable ctx.
evaluateAction({ actionId, repository, issue, projectDir, inputs, attempt, deps });
// -> Promise<ActionDecision>; all effective observations appear in decision.snapshot.

// functional-dod-project.mjs
projectFunctionalDod({ body, head, evaluatedAt });
// -> {body, normalization: null | {normalizerId, inputDigest, decisions,
//     decisionDigest, disposition: 'persist-on-execute'}}
// Each decision: {key:'acs'|'checkboxes', ruleId, stamp:boolean, tick:boolean}.

// normalization.mjs: called within the executor's existing lock.
persistReadyNormalizations({ decision, refreshAndEvaluate, mutateBody, readBack });
// -> {decision, persisted, warnings}; throws named persistence/readback/drift failures.

// guidance/validate.mjs
validateGuidance({ source, profile, registries, packageRoot, limits });
// -> aitm.guidance-validation/v1 + internal normalized data/ranges on success.
// profile: 'active' | 'candidate' | 'published'

// guidance/cache.mjs
loadGuidance({ projectDir, moduleUrl, need, refresh = false });
// need: 'manifest' | 'agent' | 'human' | 'diagnostics'; returns validated view.

// guidance/protocol.mjs
explainWithGuidance({ decision, diagnosticMessages, admissionWarnings, catalog,
  known = [], knownSource = null, diagnostic = false });
// -> closed aitm.action-explanation/v1; consumes one completed evaluation.
// Routine: {schema, result, guidance}; optional sourceReceipt is the closed transport choice described below.
// Diagnostic adds fullDecision AND diagnosticMessages from this invocation.

// action-decision/presentation.mjs
presentActionDecision({ decision, admissionWarnings, suppressSourceWarning });
// -> ActionPresentationV1; validation precedes explicit field projection.
validateActionPresentation(result);
validateExplanationEnvelope(envelope, { diagnostic });
// Validation includes semantic invariants and mode-required/forbidden keys.
```

`ActionDecision` is the full §13.2 structure: schema, issue, actionId, status, snapshot, blockers, normalizations, warnings, humanDecision, and guidanceIds. The snapshot includes state, HEAD, digest, observation-window timestamps, and each source's identity/time/revision or digest. A blocker requires guardId/code/args and exactly one typed remediation or explicit noAutomaticRemediation. Generic navigation may return actionId null for terminal Done (ready with no executable recommendation) or unresolved navigation (indeterminate with a typed cause). Neither fabricates a registered action or a ready close decision. Presentation objects are never accepted by evaluateAction or an executor.

Additional characterization owners are `scripts/maintenance/measure-guidance-candidate.mjs`, `scripts/tests/helpers/guidance-characterization.mjs`, `scripts/tests/helpers/{guidance-legacy-cli,guidance-legacy-preload,guidance-legacy-transport}.mjs`, and `scripts/tests/fixtures/1558/legacy-workflow/`. Task 1a owns the legacy capture harness; Task 1b owns the candidate/oracle and clause-traceability files. They are test/tooling additions, not runtime APIs. Task 1 pins a versioned standalone candidate serializer; Task 3 checks production projection against its fixtures and the independent spec-clause index and Task 14 replaces its response capture with actual CLI output.

## Implementation tasks

### Task 1a: Inventory source/effects/flags and freeze the legacy workflow baseline

**User story:**

As a maintainer establishing the context baseline,
I want a complete inventory and replayable current workflow without bypassed predicates,
So that candidate feasibility compares the same governed work and does not assume an unavailable harness.

**Scope/files:** Create `scripts/tests/helpers/{guidance-legacy-cli,guidance-legacy-preload,guidance-legacy-transport}.mjs`, `scripts/tests/unit/task-tracker/lib/guidance-legacy-baseline.test.mjs`, and `scripts/tests/fixtures/1558/{action-observation-inventory,behavioral-flags,authority-baseline,legacy-baseline}.json` plus `legacy-workflow/` loaded-text/authority/transcript fixtures. Existing `scripts/tests/helpers/move-state-cli.mjs` is only a move-state process host, not a whole-lifecycle harness. Reuse existing `deps`/`pexec`/`pexecGithubBodyStore` seams where available. Build the missing process harness here; no production guard/serializer/executor changes or skill slimming.

**Interfaces:** The test-only `captureLegacyWorkflow({ sourceCommit, adapter, scenario, authorityFixture, scratchRoot })` runner returns ordered raw streams, loaded file bytes, simulated mutation/effect log and physical transport ledger. Each ledger row identifies process/lane, executable or direct-network port, operation/arguments, fixture request identity and outcome, with sensitive fixture values handled under the existing test conventions. Freeze its implementation/source digests with baseline data. Task 1b consumes these artifacts; no feasibility verdict or second gate is introduced by this task.

- [ ] **Step 1 — Inventory all seven paths and behavioral environment reads.** Follow dispatcher, verbs, delegates, guard registrations, mutators and evidence-v2 lanes; record predicates, conditional reads/resource subjects, refusal and warning expression fingerprints, human obligations, locks and first effects. Classify transitive helpers as pure/read-only-network/ref-mutating/effectful. Include every production `TT_*`/`AITM_*` behavioral read in `scripts/task-tracker/`, `scripts/gh/`, `bin/`, and their reachable production dependencies, including indexed/destructured/env-alias reads, not just dot-notation matches. `behavioral-flags.json` records flag, each source symbol/fingerprint, default/nondefault behavior, predicate/effect changed, legitimate operator versus test/fault-fixture purpose, baseline policy, retain/relocate/retire disposition, rationale, scope/owner task and verifier. No blanket classification from a flag's name; no unclassified read passes VC1.

  Seed the inventory from observed `TT_SKIP_NETWORK`, `AITM_GUARD_FORCE_THROW`, `AITM_SKIP_PARENT_STATE_GATE`, `AITM_SKIP_DUP_CHILD_GATE`, `TT_FAKE_NEW_ISSUE`, `TT_SKIP_FIELD_SELF_CHECK`, `TT_SKIP_DIRTY_CHECK`, `TT_REPAIR_FAKE_FIELDS`, `TT_REPAIR_FAKE_OPTIONS`, `AITM_EVIDENCE_RECORDED_FIXTURE`, `AITM_DUP_CHILD_SIBLINGS_JSON`, and `AITM_FORCE_STAMP`, then enumerate beyond that seed. `AITM_FAKE_BODY_FILE` currently has test-only readers; record that boundary as a regression case. An inventory is not permission to remove all existing operator controls. Preserve legitimate out-of-scope behavior with explicit rationale; relocate/retire in-scope test injection in the owning implementation child, with its tests, before final release. If an unresolved flag affects a measured v1 path, block feasibility/release instead of silently exempting it. Unrelated cleanup requires separately reviewed scope and is not auto-hydrated.

- [ ] **Step 2 — Add harness-boundary tests and run VC1 to RED.** Seed a disposable repository under repository-local scratch with deterministic issue/board/approval/PR/provider fixtures. Assert that an inherited bypass/fake flag is rejected or removed before child launch, unknown subprocess/network requests fail externally to guard error conversion, all streams are captured, and a refused action does not advance the fixture store. Remove a flag inventory row and a captured command output; both must fail completeness. Test a real CLI command with a missing approval fixture and then its approved counterpart so transport injection cannot accidentally replace the readiness predicate. Require positive transport evidence: every lane that declares GitHub authority must contain its expected `gh` or explicitly inventoried direct-HTTP requests, with request identities/counts reconciled to fixture-store reads, pages/retries and declared conditional paths. An empty escape ledger is necessary but insufficient; a missing expected transport fails even when no escape was recorded. Add isolated subprocess regressions for callback `execFile`, module-evaluation-captured `promisify(execFile)`, the aliased `promisify(nodeExecFile)` path in `scripts/gh/lib/gh-client.mjs`, and nested children. Cover success/failure output shapes and a mutation that restores the native custom symbol: that mutation must fail positive ledger coverage using harmless local canaries, without making a live GitHub call.

```js
const denied = await fixture.captureLegacyWorkflow('missing-review-approval');
assert.equal(denied.executedClose, false);
assert.ok(denied.stderr.length + denied.stdout.length > 0);
assert.equal(denied.productionBypassFlagsEnabled.length, 0);
assert.ok(denied.transportLedger.length > 0);
assert.ok(denied.transportLedger.some((call) => call.executable === 'gh'));
assert.deepEqual(denied.observedAuthorityRequests, denied.expectedAuthorityRequests);
assert.deepEqual(denied.unhandledTransportCalls, []); // also required, not a coverage proof
assert.throws(() => fixture.verifyTransportCoverage({ ...denied, transportLedger: [] }));
assert.throws(() => fixture.verifyFlagInventory({ omit: 'TT_SKIP_NETWORK' }));
```

- [ ] **Step 3 — Build the missing test-only process transport.** Launch the unchanged pinned CLI entrypoint in a child Node process with `--import` pointing to `guidance-legacy-preload.mjs`. Before CLI imports, preload wraps low-level `node:child_process` calls and invokes `syncBuiltinESMExports()`, routing inventoried GitHub/provider transports to `guidance-legacy-transport.mjs`. It must also replace any native `Symbol.for('nodejs.util.promisify.custom')` implementation on wrapped exports that expose one (notably `execFile` and `exec`): retaining the native custom function bypasses the wrapper when production captures `promisify(execFile)` at module evaluation. Name and test `scripts/gh/lib/gh-client.mjs`'s aliased `nodePexec` and the `defaultExecFile` custom-promise route exposed through `ghClient.execFile` as consumers of this interception. Install interception before either module is imported. The replacement custom function must delegate through the same intercepted callback/transport path, preserve the native `{ stdout, stderr }` resolution and error `code`/`stdout`/`stderr`, and preserve the returned promise's child handle where used. Simply deleting the custom symbol can change promisified result shape and is not the selected solution. Never delegate the replacement to the original native custom function. Inventory and test synchronous/spawn/other process forms separately; patching `execFile` alone is not whole-process coverage. Existing direct injected ports use the same fixture store. Real local Git/filesystem/session/lock work runs only in the isolated fixture repository; simulated remote writes update the store only after the actual command reaches its transport. Propagate the test preload to nested Node children and intercept their transports as well. Deny uncatalogued process/network calls, cover direct HTTP transports at their bottom port, and record attempted escapes outside swallowed errors. Do not mock validators, guards, readiness, routing, command formatting or whole successful verb results. Freeze clock inputs only where required and record them.

  The launcher constructs an allowlisted environment with bypass/fake/fault flags absent; approved identity/configuration variables are explicit fixture inputs. Never use `TT_SKIP_NETWORK=1`, fabricated issue flags, forced approval, or recorded-mode authority shortcuts to make a successful baseline. Production sources gain no preload switch or transport-bypass option; all harness files remain under excluded `scripts/tests/`, verified by package-boundary tests. Record the exact transport port for every inventoried read/effect and fail if any is unhandled. Reconcile expected per-lane authority requests with observed ledger entries and fixture-store accesses; an unobserved call cannot be certified by an empty escape list. Prove preload synchronization and both call forms on the supported Node floor as well as the development runtime before capturing a baseline. If a lane cannot be captured without altering production predicates, stop this child and revise the harness scope/WBS; do not substitute hand-written output or claim a complete baseline.

- [ ] **Step 4 — Capture and freeze both adapters.** Run the coherent scenario with real CLI formatting and all predicates against deterministic authority. Capture loaded shim/router/adapter/pickup/Tier-2 bytes, command inputs, complete stdout/stderr, local and simulated remote effects, pages/retries and logical reads. Store source/runtime/runner/scenario/fixture digests and command-to-transcript ordering in `legacy-baseline.json`; preserve the pinned source revision for replay after migration. Existing code has no explain command: identify executor read-only phases and would-be query boundaries accurately. Keep controlled read-only live median/p95 with runtime/sample count separate from fixture transport timing; never mutate live issues for benchmarking.
- [ ] **Step 5 — Run VC1 to GREEN and commit.** All seven action lanes, effect/flag classifications, full traffic and known refusals must be covered before Task 1b starts. Confirm the mandatory separate-and-combined sizing review and any required WBS split were completed before hydration; Step 5 is a completion check, not the first sizing decision. Scope growth crossing a threshold requires re-decomposition before continuing.

**Acceptance criteria:**

- [ ] Source/effect/refusal/warning/human and production behavioral-flag inventories are complete, fingerprinted and dispositioned; measured paths cannot silently use bypasses. <!-- aitm-verified vc-list="vc:1" -->
- [ ] The test-only whole-lifecycle process harness exercises unchanged production predicates/formatting against isolated transports, with positive per-lane transport coverage, callback/custom-promisify shape regressions, attempted-escape and package-exclusion proofs. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Both adapter baselines retain complete loaded text, real command traffic, authority/transport identities and reproducible runner/source bytes before candidate measurement. <!-- aitm-verified vc-list="vc:1" -->

### Task 1b: Certify candidate semantics and measure the single feasibility decision

**User story:**

As a maintainer investing in context reduction,
I want a clause-complete candidate model and reproducible paired costs before runtime changes,
So that extraction starts only when the amended presentation has a measured feasible path within the fixed budgets.

**Scope/files:** Create `scripts/maintenance/measure-guidance-candidate.mjs`, `scripts/tests/helpers/guidance-characterization.mjs`, and `scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs`. Consume Task 1a’s frozen inventory/runner/baseline and create `scripts/tests/fixtures/1558/{spec-clause-index,oracle-traceability}.json` plus the candidate artifacts below. Extend `scripts/tests/helpers/guidance-characterization.mjs` only for candidate modeling and comparison; do not extract production evaluators, change runtime schemas/guards, slim skills, or add the operational loader in this child.

**Interfaces:** The maintenance tool supports `--all --json` for honest measurement, and `--all --assert-feasible --json` for the distinct foundation gate. Reports have a schema/version, source commit, source symbols, fixture digests, serializer version, scenario identity, and explicit candidate/actual classification. Task 1b alone owns `feasibility-decision.json` and `--assert-feasible`; Task 2 consumes that result, never a green unit test alone. The clause index is transcribed from the pinned spec, independently of oracle code/schema keys.

- [ ] **Step 1 — Verify Task 1a inputs.** Require its accepted complete action/effect/flag inventories, source and artifact digests, frozen loaded bytes, and real-command baseline capture for both adapters. Every mocked transport and excluded flag has an inventory row; every expected authority request has positive observed ledger/fixture-store evidence. Neither an empty mock set nor an empty escape list proves coverage. Missing paths, uncaptured outputs, unclassified flag reads, bypass-derived success, or source drift block candidate certification.
- [ ] **Step 2 — Build clause-to-assertion traceability before the gate.** `spec-clause-index.json` enumerates each normative requirement from §§13.2 and 15.2, plus applicable §§14.1/15.5/17 mode/source-receipt obligations and the reviewed initial transport choice. Each stable clause ID records source digest, section and a short requirement. `oracle-traceability.json` maps each clause to named executable assertion IDs, positive and adversarial fixture IDs, expected outcome and source-to-result field checks. Validate exact index coverage, not an index derived from the serializer’s implemented fields; missing/duplicate rows, stale source digests, unknown fixtures or assertions that did not execute fail VC18 and `--assert-feasible`. The acceptance review checks the index against the actual spec text before accepting 1b.

  Required clause groups are: full internal evidence/normalization identity; required arrays/nulls; all seven result fields; producer/code/domain/phase/args/disposition closure; resource and multi-subject causes; known final refusals and ordered complete blockers; nonrecursive invalid-result failure; warning producer definitions/composition/duplicates/source suppression; each human kind/actor/subject/args; effective-policy request completeness and blocker order; cross-issue mappings and unresolved/terminal null actions; complete normalization intent and only allowed digest omissions; retained operational SHA arguments; no snapshot/raw-text/guidance-ID duplication; complete guidance expansion and receipt rules; closed version/member/type rejection; and routine-forbidden versus diagnostic-required keys. Break these groups into individually testable normative rows, not one unchecked row per paragraph. Use the same frozen index in Task 3 conformance; production matching a defective candidate is not enough.

- [ ] **Step 3 — Add failing characterization tests and run VC18 to RED.** Negative cases remove a baseline command output, omit an action lane, use a guessed observation count, return an indeterminate result without causes, erase a warning/request/normalization, or count only selected JSON fields. Every case must fail completeness or preservation independently of its favorable size.

```js
const reports = await fixture.characterizeBothAdapters();
assert.ok(reports.codex.baseline.operationalOutput.characters > 0);
assert.equal(reports.codex.uncountedAgentVisibleBytes, 0);
const withMoreEvidence = fixture.addObservationWithoutOperationalChange();
assert.deepEqual(fixture.present(withMoreEvidence), fixture.present(fixture.baseDecision));
assert.throws(() => fixture.accept({ ...reports.codex, omittedOutput: true }));
assert.throws(() =>
  fixture.verifyTraceability({ omitClause: 'human-policy-request-completeness' })
);
assert.throws(() => fixture.verifyOracleMutation('omit-human-requests-for-review-approval'));
assert.throws(() => fixture.verifyOracleMutation('accept-missing-humanDecision'));
```

The helper implements a strict test-only schema/semantic oracle for §§13.2/15, not permissive hand-built successful outputs. Inputs include all arrays, typed arguments, and full digests where required. Positive fixtures require actual nonempty review/plan requests under effective policy, not merely rejection of malformed requests. Mutation tests remove a required generated request or its validator requirement and must fail clause assertions before GO. Later production conformance checks both the frozen clause index and candidate cases.

- [ ] **Step 4 — Measure complete candidate responses and coherent transcripts.** Build deterministic full-decision fixtures for every action's reachable ready/blocked/indeterminate/enriched/normalizing/warning/human lanes. Derive routine and diagnostic candidates under the amended schema, including same-invocation diagnostic messages. Vary observation cardinality with unchanged operational results (routine size unchanged), then add real blockers/subjects/warnings (visible size increase). Measure full serialized commands, receipts, stdout/stderr and loaded candidate protocol files. Include changed instruction, matching/stale receipts, compaction reload, remediation and any required diagnostic request; a later diagnostic is a fresh query, not retrieval of a previous failure. Use the shared scenario selection criteria above.
- [ ] **Step 5 — Assemble these independently inspectable artifacts:**
  - `action-decision-fixtures/{bind,resume,promote,test,review,deliver,close}.json`: deterministic authority inputs, complete candidate decisions, operational/diagnostic outputs, expected field-preservation assertions, and scenario links. Explicitly label these candidates, not production evaluator outputs.
  - `action-cardinality.json`: observed per-fixture blocker/observation/warning/request counts, simultaneous reachability, per-site fan-out, finite heavy-case inputs, and any unbounded dimensions.
  - `serialization-sensitivity.json`: exact characters/bytes/proxy for routine versus diagnostic changes and extra queries; no average-size multiplication or shortened fingerprints.
  - `context-comparison.json` and ordered `candidate-workflow/` transcripts linked to the preserved `legacy-workflow/` transcripts: references to both frozen Task 1a adapter baselines, proposed static text and full traffic, category totals/delta, scenario/fixture/source/tool identities, and budget verdicts.
  - `feasibility-decision.json`: every fixed ceiling/headroom/reduction verdict, fidelity/completeness result, heavy-case report and interpretation, and GO or NO-GO. Characterization tests validate an honest NO-GO without making it a GO.
- [ ] **Step 6 — Run VC18 to GREEN, then run the separate foundation assertion.** GO requires complete clause/assertion/fixture coverage, checked Task 1a inputs, full semantic fidelity, all representative working maxima, and measured lower candidate totals for both adapters under equivalent work. If it fails, commit the measured NO-GO as the characterization result, stop Tasks 2–17, and revise candidate presentation/instruction/query choices within the approved spec and fixed budgets. Reopen manual design/plan review only if the proposed remedy changes the contract. Do not relabel the old full-bundle probe as amended evidence.

**Acceptance criteria:**

- [ ] All normative clauses have executed positive/adversarial oracle assertions, with mutations proving missing generation/validation cannot pass; Task 1a inputs remain pinned and unchanged. <!-- aitm-verified vc-list="vc:18" -->
- [ ] Paired complete costs, sensitivity, reachable heavy case, timing provenance, and honest GO/NO-GO are reproducible; increased evidence-only cardinality does not enlarge routine output. <!-- aitm-verified vc-list="vc:18" -->
- [ ] The separate foundation assertion blocks all runtime work until feasible, semantically complete candidates meet fixed working maxima and reduce both adapter totals. <!-- aitm-verified vc-list="vc:18" -->

### Task 2: Establish the complete shared decision and typed vocabulary contract

**User story:**

As a lifecycle maintainer,
I want to inspect one versioned action and refusal contract,
So that core execution, explanation, and future gate producers cannot disagree about authority.

**Scope/files:** Create `action-decision/contract.mjs`, `remediations.mjs`, and `legacy-refusals.json` under the mapped library directory. Modify `lib/lifecycle-policy/actions.mjs` and `lib/guard-registry.mjs`; inventory the real bootstrap in `lib/state-bootstrap.mjs` and `scripts/task-tracker/states/*.mjs`, updating their contracts where necessary. Preserve `lib/guard-bootstrap.mjs` as a compatibility re-export shim. Create `scripts/maintenance/lint-action-refusals.mjs`, `scripts/tests/helpers/action-decision-fixtures.mjs`, `scripts/tests/unit/task-tracker/lib/action-decision-contract.test.mjs`, using the already committed Task 1 characterization artifacts. Add the refusal lint to `package.json` and CI. Record the readiness/refusal inventory in `docs/guides/ask-the-script.md`.

**Interfaces:** Produces action enumeration, schema validation, refusal normalization, vocabulary digest, and reusable authority/effect fixtures. Add bind/resume/deliver descriptors without inventing state edges. Core owns the contract before #1561 consumes it; no dependency on a completed plugin runtime. `listLifecycleActions()` returns all twelve descriptors. The five non-v1 actions (`refine`, `demote`, `shelve`, `park`, `cancel-plan`) retain their existing execution policy but have no ready evaluator. Explicit explanation returns `indeterminate` with `action-not-explain-ready` and a no-automatic-remediation disposition; it does not recommend execution. Unknown IDs return `unknown-vocabulary`, not a fabricated registered action. Readiness-complete is per conformance-tested lane, never inferred from registration.

- [ ] **Step 1 — Check the foundation gate.** Run `node scripts/maintenance/measure-guidance-candidate.mjs --all --assert-feasible --json` against the pinned Task 1 artifacts. Confirm inventory source fingerprints still match; changed runtime inputs require recharacterization before extraction.
- [ ] **Step 2 — Define the closed shared contract.** Preserve all §13.2 evidence fields. Require arrays and `humanDecision`, nonempty blockers for blocked/indeterminate, none for ready, `args` on every blocker/warning/request, and exactly one disposition per blocker. Define the reserved boundary producers separately from executable guards, closed resource IDs/subject schemas, warning shapes, human-request kinds and effective-policy mappings. The detailed invariants in Task 3 are shared validation requirements, not serializer-only repairs.
- [ ] **Step 3 — Add failing contract assertions.** Use `node:test` and `node:assert/strict`; fixtures must exercise real normalizers, not copies of them.

```js
assert.ok(listLifecycleActions().some(({ id }) => id === 'bind'));
assert.ok(!listLifecycleActions().some(({ id }) => id.startsWith('workflow.')));
assert.throws(() => validateRemediation({ id: 'bypass-guard', args: {} }));
assert.deepEqual(
  normalizeRefusal(
    { reason: 'run arbitrary shell text' },
    {
      guardId: fixture.guardId,
      legacyInventory: fixture.inventory,
    }
  ),
  {
    guardId: fixture.guardId,
    code: 'unclassified-refusal',
    args: {},
    noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
  }
);
```

- [ ] **Step 4 — Run VC2 and verify RED**, then implement schema validation and registry enumeration. Closed decision statuses are ready/blocked/indeterminate. `contract.mjs` also owns the closed, domain-qualified `CODE_DEFINITIONS` registry below; status and diagnostic code are distinct fields. Thrown guards, invalid results, and unknown vocabulary map to guard-error/guard-result-invalid/unknown-vocabulary and indeterminate. Typed-remediation validation failures never use the legacy adapter. Registry records include actionId, argument schema, human/provider/destructive/Full-Auto classifications, and guidanceId. Existing structured mutation output/exit codes may retain compatibility formatters while carrying the complete blocker list.
      Define/export data-only `CODE_DEFINITIONS` in `action-decision/contract.mjs`; guidance imports this shared contract, not vice versa. Each record has code, domain, allowed producer IDs, severity, legal phase/status, closed required args schema, and disposition requirements. Definitions include subject/action mappings and effective-policy human requirements where applicable. The initial named-code set is:

  | Domain/phase                     | Codes and behavior                                                                                                                                                                                                                                   |
  | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Decision, indeterminate          | `guard-error`, `guard-result-invalid`, `unknown-vocabulary`, `action-not-explain-ready`, `authority-read-failed`, `authority-read-skipped`, `state-unavailable`, `guard-effect-forbidden`, `attribution-authority-unavailable` — no automatic action |
  | Decision, blocked                | `unclassified-refusal` (frozen legacy/manual only), `migration-freeze`, `plan-approval-missing`; migrated guard-family codes are added here with their typed dispositions, not emitted ad hoc                                                        |
  | Execution normalization failures | `normalization-authority-drift`, `normalization-persist-failed`, `normalization-readback-failed` — stop subsequent effects; never rewrite a post-ready write failure as an earlier ready predicate                                                   |
  | Guidance admission/validation    | `guidance-catalog-invalid`, `guidance-catalog-untracked`, `unknown-agent-operation`; all additional source/schema/reference/budget diagnostics must be declared here before Tasks 11–12 emit them                                                    |
  | Operational warnings             | `guidance-source-diverged` with source/full digest; `legacy-guard-warning` with registered guardId; operational details require dedicated typed definitions                                                                                          |
  | Post-success audit warning       | `guidance-annotation-failed` — warning only, cannot undo a committed transition                                                                                                                                                                      |

  Include the canonical code definitions/version in `vocabularyDigest()`, cache identity, and conformance fixtures. `lint-action-refusals.mjs` scans emitted code fields and constructor calls in both `action-decision/` and `guidance/`, plus migrated guard/verb boundaries; undeclared codes or illegal domain/phase combinations fail. Runtime validation rejects dynamic unknown values even when static analysis cannot resolve them. Only namespaced/versioned registry changes can expand the closed set; no arbitrary plugin codes or free-text parsing. Test an undeclared admission code and an audit warning misused as a ready decision, not just three guard exceptions. Validation diagnostics remain detailed; centralization does not collapse distinct errors into one generic code.

- [ ] **Step 5 — Freeze and enforce the inventory.** Extend the existing parser-based maintenance approach using installed `espree`; scan guard registration and inventoried verb/mutator refusal symbols. Every reachable site must be typed or match a frozen legacy record. Test an added and an edited unclassified refusal; both fail the lint. Deleting/migrating a site removes its allowance. Reasons remain labeled diagnostic text outside operational choices. Task 2 does **not** type every historical guard branch: unchanged legacy results map by registered guard ID to the single reserved `unclassified-refusal`/human-investigation disposition only when every reachable legacy branch in that guard is in the frozen static inventory. `siteId` is static lint provenance, not recoverable runtime branch identity. The runtime does not invent it or parse reasons. New/changed guard branches must emit their own stable code and disposition; migrations belong to Tasks 6–10, with further family splits at Refine.

  Extend both `invoke()` and `consume()` in `guard-registry.mjs` to preserve typed `code`, `remediation`/`noAutomaticRemediation`, and optional multiple typed refusals returned by migrated producers; preserve legacy `reason`/string `blockers` only as diagnostic compatibility fields. For multiple typed refusals, validate every item and attach the registered guard ID to each. Catch/thrown and malformed results receive explicit contract error codes at this boundary; they cannot become legacy blocked text. Fixtures must prove two branches of one guard retain different emitted codes and an old multi-branch guard remains one conservative manual disposition without string parsing.

- [ ] **Step 6 — Preserve warnings and human obligations.** Extend typed producer boundaries to carry ordered evaluator warnings and requests. Legacy raw warnings remain available only in diagnostic messages; emit the inventoried typed warning, and type any decision-relevant details before marking the action explain-ready. Require matching human requests under effective policy, including explicit cross-issue typed subjects. Never infer approval or suppress simultaneous requirements.
- [ ] **Step 7 — Run VC2 to GREEN and commit** the contract, frozen migration inventory, and conformance fixtures, referencing the preserved Task 1 baseline. Test that a malformed typed result remains indeterminate and a legacy blocked result cannot produce an executable command.

**Acceptance criteria:**

- [ ] All seven v1 actions use one bare-ID registry and one versioned decision contract; #1561 has a documented consumption boundary. <!-- aitm-verified vc-list="vc:2" -->
- [ ] Every inventoried refusal is coded or explicitly manual, and new/changed unclassified sites fail CI. <!-- aitm-verified vc-list="vc:2" -->
- [ ] The closed blocker/warning/request schemas enforce producer, args, status, scope and policy invariants while preserving complete internal evidence; Task 1 GO is a checked prerequisite. <!-- aitm-verified vc-list="vc:2" -->

### Task 3: Validate and project the compact operational result

**User story:**

As an agent choosing a lifecycle action,
I want all operationally necessary information without repeated evidence metadata,
So that routine guidance remains small while explicit investigation can inspect complete evidence.

**Scope/files:** Create `scripts/task-tracker/lib/action-decision/presentation.mjs` and `scripts/tests/unit/task-tracker/lib/action-presentation.test.mjs`; extend Task 2 contract definitions and Task 1 conformance fixtures. Keep catalog lookup and CLI orchestration in Task 14. This module accepts validated values and performs no I/O, evaluation, logging, mutation, or authority collection.

**Interfaces:** Export `presentActionDecision`, `validateActionPresentation`, and `validateExplanationEnvelope` with the names in the interface map. `ActionPresentationV1` has exactly `issue`, `actionId`, `status`, `blockers`, `normalizations`, `warnings`, `humanDecision`. It has no inner schema tag. The outer envelope versions result/guidance/diagnostic members together. Do not import guidance implementation into the core contract; pass already resolved guidance to envelope validation.

- [ ] **Step 1 — Add failing schema and preservation tests; run VC3 to RED.** Include each missing/unknown member, undefined arrays/nulls, missing `args`, unknown version/code/producer, malformed/truncated JSON, wrong disposition, empty indeterminate causes, unknown resource/subject, and valid-looking empty replacement of a nonempty operational array. Consumer validation rejects malformed output; serializer preservation tests additionally catch valid but untruthful empty values.

```js
const result = presentActionDecision({
  decision,
  admissionWarnings: [],
  suppressSourceWarning: false,
});
assert.deepEqual(result.blockers, decision.blockers);
assert.deepEqual(result.humanDecision, decision.humanDecision);
assert.deepEqual(result.warnings, decision.warnings);
assert.deepEqual(
  result.normalizations,
  decision.normalizations.map(({ normalizerId, decisions, disposition }) => ({
    normalizerId,
    decisions,
    disposition,
  }))
);
assert.equal(Object.hasOwn(result, 'snapshot'), false);
const { warnings, ...missingWarnings } = result;
assert.throws(() => validateActionPresentation(missingWarnings));
assert.throws(() => validateActionPresentation({ ...result, extraEvidence: [] }));
```

- [ ] **Step 2 — Implement an explicit allowlist projection.** Validate the full internal decision first. Copy issue/action/status unchanged and every ordered blocker, with guardId/code/args and complete typed disposition. Retain full SHA/evidence-reference arguments when operationally required. Project every normalization to normalizerId/ordered decisions/persist-on-execute; omit only its inputDigest/decisionDigest. Resolve guidanceIds later to guidance entries, never duplicate them. Exclude snapshot, evidence-only HEAD/digests/timestamps/identities, raw messages/stacks/bodies, and the nested decision schema. Never spread the internal decision into the envelope or default missing fields to empty values.
- [ ] **Step 3 — Enforce typed failure, warning, and request semantics.** Register `authority-collection`, `action-navigation`, and `action-result-validation` separately from live guards. Read failures use `authority-read-failed` args `{source, reason}` (timeout/rate-limited/unavailable/incomplete/invalid); skipped required reads use `authority-read-skipped` args `{source}`. Multi-subject resources require the registered typed subject. Navigation uses `state-unavailable` args `{reason: 'unknown'|'conflicting'}`. Preserve already known final refusals alongside required-read failures; unevaluated guards are not successes. Use the closed noAutomaticRemediation reasons `authority-investigation-required`, `state-investigation-required`, `result-investigation-required`, and `legacy-guard-requires-human-investigation` from §13.2/14.1. Invalid internal results produce a fixed valid indeterminate `action-result-validation` refusal without recursively projecting the malformed input. Test the fallback itself and exclude raw validator errors from routine output.
- [ ] **Step 4 — Compose warnings and human requirements without loss.** Admission warnings precede evaluator warnings; preserve producer-local order and duplicates. Only a matching source receipt may suppress its source warning. `guidance-source-diverged` is exactly `{code, args:{source: '.ai-task-manager/aitm-guidance.yml', digest: fullDigest}}`; `legacy-guard-warning` uses args `{guardId}`. Catalog-invalid is admission failure; annotation-failed is post-success mutation audit, never a ready warning. All warnings require closed args. HumanDecision is null or a nonempty requests array with exact `{kind,actor,subject,args}` records, ordered with corresponding blockers: plan-approval/configured-approver/args `{}`, review-approval/configured-approver/args `{head: fullHEAD}`, manual-investigation/human-operator/args `{guardId,code}`. Non-null cannot accompany ready. Every effective-policy human remediation needs a matching request; machine-investigable causes need not invent one.
- [ ] **Step 5 — Test subject mapping and declared modes.** A request subject `{issue,actionId}` must match its corresponding blocker's registered typed mapping; never infer a target from prose. Include parent/close with child/promote approval, two simultaneous children, wrong issue/action, cross-repository rejection, revoked effective-policy exemption, and manual navigation investigation with null actionId matching an indeterminate result. Result scope remains the queried action/issue; remediation retains its own target; a request cannot execute anything. Test terminal Done ready/null separately. Routine envelope forbids fullDecision/diagnosticMessages; diagnostic mode requires both even when messages is `[]`. Every message is exactly `{guardId,text,untrusted:true}`. Compare diagnostic/routine result and guidance under identical inputs/receipts.
- [ ] **Step 6 — Run VC3 to GREEN and commit.** Adding evidence-only observations with distinct full digests/times/identities must not change routine bytes. Adding an operational blocker/warning/request must change the matching result array without truncation. Compare all Task 1b candidate fixtures and every independently indexed normative clause with production projection; matching an incomplete oracle alone cannot pass VC3. Document the conservative version policy: after acceptance any field/semantic change (including additive) requires a new outer major, compatibility decision and recertification of adapters, aliases, result/guidance consumers, #1561 boundary, and measurements. Internal version changes only if its contract changes; flags select declared modes only.

**Acceptance criteria:**

- [ ] Strict shared validation and allowlist projection preserve every operational field while removing only specified diagnostic provenance; no valid-empty substitution hides content. <!-- aitm-verified vc-list="vc:3" -->
- [ ] Typed failures, ordered warnings, effective-policy human requests, cross-issue subject mapping, and deterministic nonrecursive failure output match the amended spec. <!-- aitm-verified vc-list="vc:3" -->
- [ ] Routine/diagnostic modes are closed, evidence growth alone does not grow routine output, and complete diagnostic data remains available without becoming execution input. <!-- aitm-verified vc-list="vc:3" -->

### Task 4: Extract immutable authority collection and complete guard evaluation

**User story:**

As an agent choosing a lifecycle action,
I want to receive readiness derived from the executor's complete current evidence,
So that an explanation cannot omit a known blocker or reuse stale authority.

**Scope/files:** Create `action-decision/observations.mjs` and `evaluate.mjs`. Modify `lib/move-state/guard-execution.mjs`, `lib/guard-registry.mjs`, `verbs/promote.mjs`, `lib/guard-adapters-entry-fields.mjs`, `scripts/task-tracker/states/index.mjs`, and the read-only seams in `lib/workflow-policy/{enforcement,preflight,snapshot}.mjs`. Create `scripts/tests/unit/task-tracker/lib/action-observations.test.mjs` and `scripts/tests/integration/task-tracker/lib/action-evaluator.test.mjs`.

**Interfaces:** Consumes Task 2 schemas and fixtures; produces `createObservationAttempt` and `evaluateAction`. Per-action collectors introduced in Tasks 6–10 provide required observations and existing preflight functions. A pending adapter yields indeterminate, never ready. Remove `Reflect.set(ctx, 'refinementPlan', ...)` from `runGuards.finish()`; return `derived.refinementPlan` exclusively as result data. In the same task migrate `verbs/promote.mjs` from `guardCtx.refinementPlan` to the final `guardResult.derived?.refinementPlan`, preserving `applyRefinementEstimate` after success. Update stale context-mutation comments/tests. Do not add an unfrozen write-through channel.

- [ ] **Step 1 — Add failing provenance/two-pass tests.** Freeze every pass's input; effect-capable test ports record an attempted effect in an out-of-band harness ledger **before** throwing. Assert that ledger is empty in a harness `finally`, outside guard error conversion, so swallowed exceptions cannot make a no-effect test pass. A deliberate forbidden-fetch fixture must make this outer assertion fail even when `runGuards` catches its exception; production converts the attempt to indeterminate `guard-effect-forbidden`, never a benign legacy blocker. Count calls at the transport layer.

```js
const decision = await evaluateAction(fixture.waivableRequest);
assert.equal(decision.status, 'ready');
assert.equal(fixture.calls.policyBoundary, 1);
assert.equal(fixture.calls.issueBody, 1);
assert.deepEqual(decision.blockers, []);
assert.ok(decision.snapshot.observations.some((o) => o.source === 'workflow-policy'));
assert.deepEqual(fixture.effects, []);
// A separate frozen-context regression supplies an entry-field guard whose
// returned derived object must survive both evaluation and promote consumption.
const ctx = Object.freeze(fixture.refinementContext);
const guards = await fixture.runRefinementGuards(ctx);
assert.deepEqual(guards.derived.refinementPlan, fixture.expectedRefinementPlan);
assert.equal(Object.hasOwn(ctx, 'refinementPlan'), false);
await fixture.executePromotionWithGuardResult(guards);
assert.deepEqual(fixture.appliedRefinementPlan, fixture.expectedRefinementPlan);
```

- [ ] **Step 2 — Run VC4 to RED.** Add companion cases for baseline success (zero policy reads), valid non-applicable exception (underlying blocked result), failed required policy read (indeterminate), thrown guard, missing source, mismatched repository/issue/body/scope, and an unmapped refusal formerly hidden by `REFUSAL_ID_TO_STATUS`.
      Include `AITM_GUARD_FORCE_THROW` as a distinct fault-injection case: its current site is `bash-guard.mjs` hook evaluation, whose expected behavior is a blocking hook error with no side effects. It is not a shared lifecycle guard and a thrown exception is not an attempted effect. Preserve that hook regression while the Task 1a disposition relocates its test-only injection to a non-shipped helper if this boundary is changed. Separately inject a thrown shared-evaluator guard through test dependencies: expect `guard-error`/indeterminate and an empty effect ledger. A forbidden effect must record an attempt and produce `guard-effect-forbidden`; do not classify one as the other or claim the production hook flag reaches the evaluator.

- [ ] **Step 3 — Extract collection and orchestration.** Memoize only within one immutable attempt using repository/issue/resource/scope/boundary identity. Record lazy guard reads as observations. Hash canonical bundle content including normalization inputs; expose an observation window, not an atomic-snapshot claim. Use baseline refusals only to decide whether policy enrichment is required, then evaluate the complete guard set again and return its replacement result. Preserve legitimate exception semantics; never union provisional and final blockers.

```js
const baseline = await runCompleteGuards(baselineInputs);
const required = requirementIdsForGuardRefusals(baseline.refusals);
if (required.length === 0) return normalizeCompleteResult(baseline);
const policy = await collectRequiredPolicy(required); // failure -> indeterminate
return normalizeCompleteResult(await runCompleteGuards(withPolicy(policy)));
```

These local helpers are extracted orchestration seams inside `evaluate.mjs`; they call existing predicates through explicit observation ports. This is not permission to invoke an effectful legacy helper unchanged.

Only pure computation and read-only observations (local filesystem/Git reads and read-only network calls) are permitted during action evaluation. Guidance compilation may write only its disposable cache before evaluation; the action no-effect assertions cover tracked files, refs/object-store/index, locks/sessions, GitHub, tests, and providers. Ref-mutating/effectful helpers must be split: collect equivalent fresh evidence read-only, then share the existing predicate. No durable/cached live observation substitutes for freshness. Missing equivalent evidence yields a named indeterminate result, with no executable recommendation; it is not silently skipped. Keep an unconverted adapter pending rather than advertising universal indeterminate results as parity success. Require positive ready-path fixtures, expected blocker codes, and the independent attempted-effect ledger for every migrated action.

For trunk attribution (Task 10), resolve current remote tip through a read-only remote lookup and evaluate the same message-attribution predicate against that exact tip only if the complete local object graph is available and non-shallow for that traversal. Pin the observation's remote/ref/SHA and read-only object-completeness result. `ls-remote` alone does not prove ancestry or message attribution. Missing objects, shallow history, remote failure, or unsupported ref resolution yields `attribution-authority-unavailable`/indeterminate; never run `git fetch` or trust an old remote-tracking ref in explanation. An equivalent read-only GitHub history traversal may be introduced only with complete pagination and conformance evidence. Execution may perform its existing fetch outside the pure predicate before refreshing its own evidence; fetch failure cannot authorize remote authority from stale refs. Preserve explicitly configured local-ref authority with explicit local provenance. Bound request/latency effects in the existing §20.3 budget.

- [ ] **Step 4 — Preserve bounded refreshes.** Extract pre-Refine contiguity refresh orchestration, replace superseded body observations, and rerun all predicates whose inputs changed. A failed refresh or incompatible identity is indeterminate. Invalidate attempts on effects, retries, scope changes, and delegated subprocess boundaries; never serialize a reusable authority capability.
- [ ] **Step 5 — Run VC4 to GREEN and commit.** Verify both the read-only evaluator and lower mutator consume the shared orchestration, with mutation/audit writes outside it. Record post-extraction request counts against Task 1; add deterministic no-duplicate-read assertions.

Use Task 2 resource/producer schemas for typed collection errors, and Task 3 preservation fixtures for every returned array. A required read failure contributes its own cause even before guards run; preserve known final refusals and never claim skipped guards passed. The effect-attempt ledger lives outside caught guard exceptions so a swallowed trap cannot make a test pass. Neither successful read reuse nor diagnostic mode authorizes reusing authority across commands.

**Acceptance criteria:**

- [ ] Complete guards, conditional policy enrichment, provenance, and contiguity refresh share one read-only evaluation path with mutation. <!-- aitm-verified vc-list="vc:4" -->
- [ ] Required-read failures, incompatible evidence, malformed results, and pending adapters never become ready; explanation performs no effects. <!-- aitm-verified vc-list="vc:4" -->
- [ ] Read reuse is bounded to one attempt and does not remove execution refreshes. <!-- aitm-verified vc-list="vc:4" -->

### Task 5: Project Functional DoD and persist it only after readiness

**User story:**

As a lifecycle executor,
I want to evaluate derived DoD without writing and persist only a ready result,
So that explanation remains read-only and failed persistence cannot authorize progression.

**Scope/files:** Create `lib/functional-dod-project.mjs` and `action-decision/normalization.mjs`. Modify `lib/functional-dod-derive.mjs`, `lib/review-derive-rescan.mjs`, and the promote/review/close call sites. Create `scripts/tests/unit/task-tracker/lib/functional-dod-project.test.mjs` and `scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs`; update existing `review-derive-rescan.test.mjs` expectations only where this spec deliberately replaces stale fallback behavior.

**Interfaces:** Produces `projectFunctionalDod` and `persistReadyNormalizations`. Consumes `mutateIssueBody` through the existing versioned boundary and preserves the existing sanctioned **`evidenceStamp: true`** option. Within the new pipeline only the ready-only execution persistence helper supplies that literal to the write adapter; it is never a caller/catalog/remediation field or available through the explanation dependencies. Existing sanctioned minting callers outside this refactor remain intact. Closed normalizer ID is `functional-dod-derived`; its version is included in decision hashing. Preserve the existing derivation rule IDs `derive:all-acceptance-criteria-ticked` and `derive:all-non-self-non-lifecycle-checkboxes-ticked`.

- [ ] **Step 1 — Add failing pure-projection tests.** Start with real bodies from existing DoD fixtures: complete unstamped ACs, incomplete ACs, stamped/unticked keys, already complete body, and unrelated missing requirements.

```js
const first = projectFunctionalDod({ body, head, evaluatedAt: '2026-09-16T10:00:00Z' });
const second = projectFunctionalDod({ body, head, evaluatedAt: '2026-09-16T11:00:00Z' });
assert.deepEqual(first.normalization.decisions, second.normalization.decisions);
assert.equal(first.normalization.decisionDigest, second.normalization.decisionDigest);
assert.deepEqual(
  first.normalization.decisions.map((d) => d.key),
  ['acs', 'checkboxes']
);
assert.equal(
  projectFunctionalDod({ body: first.body, head, evaluatedAt: '2026-09-16T12:00:00Z' })
    .normalization,
  null
);
```

- [ ] **Step 2 — Run VC5 to RED.** Add integration fault cases for version conflict, changed HEAD, write failure, body readback failure, wrong execution provenance, and successful normalization followed by failed transition.
- [ ] **Step 3 — Extract the pure body transform.** Parse `items`, `acsItem`, and `cbItem` once from the observed **base** body. Retain those base checked/evidence-marker flags while evaluating derivation predicates against progressively updated **next**: acs first, then checkboxes after the acs write/tick. Do not reparse item flags between phases. Omit no-change keys. Add explicit staged/base-vs-next characterization fixtures (including stamped-but-unticked acs and checkboxes) that compare the projector's bytes and ordered intent with the original transform at fixed HEAD/timestamp. Hash normalized input body separately from the ordered decision set. Hash decision intent using normalizer ID/version, key/rule/stamp/tick only. Do not introduce a projected-body digest or use explanation timestamps as persistence expectations.
- [ ] **Step 4 — Move persistence behind full readiness under the existing lock.** Refresh and evaluate with the projected body; if blocked/indeterminate, do not stamp. Assert the injected write receives `evidenceStamp: true`; a companion integration test omitting that option must hit the existing proof-introduction refusal, demonstrating the flag was actually necessary. Assert no explain call can reach that write adapter. The versioned write callback must recompute projection and readiness on every fresh base after conflict. Read back actual stamps/ticks and their current execution HEAD/timestamp, then revalidate remaining authority before the next effect. An empty post-write decision set is expected idempotence. Name failures `normalization-persist-failed`, `normalization-readback-failed`, or `normalization-authority-drift`; never return the stale pre-derive body as authorization.
- [ ] **Step 5 — Run VC5 to GREEN and commit.** Confirm evaluate-at-two-times parity, fresh evaluation despite equal intent digest after HEAD change, no unrelated ticks/approvals/test evidence, and truthful reporting of normalization that remains after a later failure.

**Acceptance criteria:**

- [ ] Explanation uses the same pure ordered projection as execution and discloses pending writes without performing them. <!-- aitm-verified vc-list="vc:5" -->
- [ ] Concurrent edits trigger complete recomputation; failed writes/readbacks stop all subsequent effects. <!-- aitm-verified vc-list="vc:5" -->
- [ ] Decision identity excludes timestamps/marker bytes, while execution readback checks actual provenance and idempotence. <!-- aitm-verified vc-list="vc:5" -->

### Task 6: Share bind, resume, and early promotion readiness

**User story:**

As an agent starting or advancing work,
I want to inspect session and early-transition readiness without rebinding or moving an issue,
So that navigation predicts the same checks that execution enforces.

**Scope/files:** Create `action-decision/session.mjs`, `promote.mjs`, and `navigation.mjs`. Modify `scripts/task-tracker/task-tracker.mjs`, `verbs/resume.mjs`, `verbs/promote.mjs`, `lib/verb-preflight.mjs`, and relevant guard producers found in Task 1. The dispatcher/resume path currently owns numeric issue binding; do not invent a nonexistent `verbs/bind.mjs`. Create `scripts/tests/integration/task-tracker/lib/action-session-promote.test.mjs`.

**Interfaces:** Supplies bind/resume/promote collectors and evaluator bindings. Navigation imports `actionPolicyFor` from `lib/lifecycle-policy/actions.mjs` and `forwardTarget` from `lib/lifecycle-policy/executable-transitions.mjs` (or their canonical index re-exports); later Test/Review/close delegates remain pending until their tasks pass. `bind` is the v1 semantic action covering cold binding and switching the active issue through numeric `#N`/supported start-resume routes. `rebind` is presently a cursor trigger identity, not a separate entry in `ROUTE_IDENTITIES` or the public `VERBS` set; do not add a twelfth-plus-one action or a shell command by implication. Test actual switch/rebind behavior through the bind adapter. `explain --action rebind` remains `unknown-vocabulary` with no executable recommendation; it does not silently alias to resume.

- [ ] **Step 1 — Add failing paired fixtures** for worktree/binding/ownership mismatch, global `migration-freeze` (preserve executor exit 14), issue state, early field/parent/dependency/contiguity gates, plan approval/deep-dive/metadata/estimate gates, and an unmapped transition refusal. Compare shared evaluator status and code/disposition with the actual executor's pre-effect refusal.

```js
for (const caseName of sessionPromoteCases) {
  const result = await fixture.compareEvaluationAndExecution(caseName);
  assert.equal(result.evaluated.status, result.executed.readiness.status);
  assert.deepEqual(result.evaluated.blockers, result.executed.readiness.blockers);
  assert.deepEqual(result.explainEffects, []);
}
```

`compareEvaluationAndExecution` is added to the Task 2 helper and invokes production action evaluation and real injected verb/mutator seams; it cannot synthesize readiness by copying expected results.

- [ ] **Step 2 — Run VC6 to RED.** Cover numeric bind and explicit resume, new and existing bindings, terminal Done, unknown/conflicting state, pre-Refine refresh, and a dependency change between observation and execution. Add `TT_SKIP_NETWORK=1`, `gateAssigneeMatch=false`, a migration freeze appearing after explanation, and missing config/board/marker observations. A required observation skipped by `TT_SKIP_NETWORK` yields `indeterminate`/`authority-read-skipped`; shared v1 execution cannot promote that absence to ready. Tests needing offline data inject complete deterministic observations instead of invoking this production escape.

  Distinguish configured applicability from missing evidence: `gateAssigneeMatch=false` disables that optional assignee-match predicate in current execution; preserve that preference, record the effective configuration in the bundle, and test explain/execute parity with the gate explicitly inapplicable. It is not permission to skip board/body reads or other independently required ownership predicates. When the gate is enabled, skipped/unreadable assignee authority is indeterminate; failed required board/marker reads in either mode are also indeterminate. Do not claim a skipped check was performed or change the project preference into a blanket refusal.

- [ ] **Step 3 — Extract read-only session/transition preflights.** Keep session registration, timers, worktree changes, healing, and audit writes in execution. Preserve complete lower-level transition blockers; `REFUSAL_ID_TO_STATUS` formats compatibility output only. Migrate these families to stable codes and typed registered remediations; retain only reviewed unchanged legacy sites with explicit manual dispositions.
- [ ] **Step 4 — Share navigation and refresh execution.** Session actions do not create state edges. A delegated action must evaluate its own complete readiness before being exposed. Each executing boundary refreshes under its normal lock even immediately after explanation. Mark only conformance-tested action paths complete in registry metadata.
- [ ] **Step 5 — Run VC6 to GREEN and commit.** Verify no session, GitHub, lock, or provider effect from explanation and preserve existing bind/resume/promote regression behavior.

**Acceptance criteria:**

- [ ] Bind/resume and early forward edges expose all required session, verb, and mutator checks with stable dispositions. <!-- aitm-verified vc-list="vc:6" -->
- [ ] Shared navigation preserves lifecycle policy, terminal Done, and indeterminate unknown state without a second state walk. <!-- aitm-verified vc-list="vc:6" -->
- [ ] Changed authority after explanation is refused by fresh execution checks. <!-- aitm-verified vc-list="vc:6" -->

### Task 7: Share Test entry readiness without running tests in explanation

**User story:**

As an agent preparing verification,
I want to inspect whether the Test action may begin,
So that asking for guidance never creates a sandbox or executes verification commands.

**Scope/files:** Create `action-decision/test.mjs`. Modify `verbs/test.mjs`, `lib/resident-actions/develop-verification.mjs`, `lib/resident-actions/test-quick-ci.mjs`, and the Develop-exit/Test-entry guard producers named by Task 1. Create `scripts/tests/integration/task-tracker/lib/action-test.test.mjs`.

**Interfaces:** Supplies the test evaluator and shared entry preflights to `runVerbTest`/`runTestWithEntryInterlock`; preserves their execution interlock and sandbox environment behavior.

- [ ] **Step 1 — Add failing readiness/effect tests.** Cover missing verification declarations, invalid evidence/HEAD/binding, required sandbox/develop receipts, allowed reruns, workflow-policy exceptions, and required-read failure.

```js
const result = await fixture.evaluate('test', 'valid-test-entry');
assert.equal(result.status, 'ready');
assert.deepEqual(fixture.effects, []);
assert.equal(fixture.calls.createWorktree, 0);
assert.equal(fixture.calls.execVerification, 0);
```

- [ ] **Step 2 — Run VC7 to RED.** Pair each entry refusal with the actual verb and transition guard path. Test that an execution test failure after ready is reported as a runtime outcome, not misrepresented as successful verification or an omitted precondition.
- [ ] **Step 3 — Extract all knowable entry requirements.** Collect current declarations, HEAD, binding, lifecycle and receipt authority using Task 4; call the same predicates from Test execution before effects. Keep test execution, evidence stamping, state writes, and sandbox setup outside evaluation. Return typed remediations or explicit manual dispositions for migrated families.
- [ ] **Step 4 — Wire promote's Test delegate** to this readiness contract while preserving the normal Test interlock, later refresh boundaries, and sandbox lock-variable stripping.
- [ ] **Step 5 — Run VC7 to GREEN and commit**, including unchanged existing Test entry/interlock regressions.

**Acceptance criteria:**

- [ ] Test and its promote delegate agree on all knowable readiness checks; explanation runs no test/sandbox/provider effect. <!-- aitm-verified vc-list="vc:7" -->
- [ ] Execution refreshes authority and reports post-ready test outcomes truthfully. <!-- aitm-verified vc-list="vc:7" -->

### Task 8: Share Review readiness and evidence-dependent navigation

**User story:**

As an agent entering or rerunning Review,
I want to see the same evidence and completeness blockers as the reviewer action,
So that explanation neither stamps approval nor recommends close before Review is complete.

**Scope/files:** Create `action-decision/review.mjs`; modify `action-decision/navigation.mjs`, `verbs/review.mjs`, `verbs/promote.mjs`, `lib/review-preflight.mjs`, relevant Test-exit/Review-entry guard producers, and `lib/resident-actions/review-agent-validation.mjs`. Create `scripts/tests/integration/task-tracker/lib/action-review.test.mjs`.

**Interfaces:** Shares current `runReviewPreflight` logic and Task 5 projection; exposes evidence-dependent Review rerun selection to both promote and generic explanation.

- [ ] **Step 1 — Add failing paired cases:** complete unstamped DoD, incomplete ACs, stale exact-HEAD Test evidence, epic-aware requirements, missing commit trail, waived versus passed policy state, semantic-review provider constraints, and a Review resident needing rerun.

```js
const outcome = await fixture.compareEvaluationAndExecution('review-unstamped-complete');
assert.equal(outcome.evaluated.status, 'ready');
assert.equal(outcome.evaluated.normalizations[0].normalizerId, 'functional-dod-derived');
assert.deepEqual(outcome.explainEffects, []);
assert.equal(await fixture.nextAction('review-resident-incomplete'), 'review');
```

- [ ] **Step 2 — Run VC8 to RED.** Include failures at required policy collection, projection persistence/readback, and authority refresh; ensure unsupported managed-provider capability remains a blocker where existing execution requires it.
- [ ] **Step 3 — Extract Review's full readiness path.** Include preflight, completeness, current evidence, home-state and mutator guards; remove mutate-before-evaluate use of `deriveAndRescan` from this path. Preserve sanctioned Review behavior after readiness, including explicit human approval boundaries and resident execution. Evaluation cannot run review probes, spawn reviewers, tick unrelated items, or emit audit/approval stamps.
- [ ] **Step 4 — Share evidence-dependent navigation.** If Review must rerun, both consumers select Review using current evidence. Delivery requirements remain explicit blockers/remediations for close; do not silently invent a state edge. Mark the Review adapter complete only after its delegated and direct forms pass the same cases.
- [ ] **Step 5 — Run VC8 to GREEN and commit**, preserving exact-head and epic-aware Review regressions and deleting migrated inventory allowances.

**Acceptance criteria:**

- [ ] Direct/delegated Review and explanation share complete evidence, projection, policy, and transition checks. <!-- aitm-verified vc-list="vc:8" -->
- [ ] Incomplete Review is navigated consistently; explanation never performs reviewer, probe, approval, or evidence effects. <!-- aitm-verified vc-list="vc:8" -->

### Task 9: Share delivery readiness without invoking providers

**User story:**

As an agent preparing delivery,
I want to inspect current delivery authorization and exact-HEAD requirements,
So that a ready explanation cannot substitute for the provider's guarded mutation boundary.

**Scope/files:** Create `action-decision/deliver.mjs`. Modify `verbs/deliver.mjs`, `lib/delivery-preflight.mjs`, `lib/delivery-authority.mjs`, and existing delivery dependency adapters only where extraction requires it. Create `scripts/tests/integration/task-tracker/lib/action-deliver.test.mjs`.

**Interfaces:** Reuse `validateDeliveryPreflight`, `validateMergedDeliveryPreflight`, `validateHistoricalReconstructionPreflight`, **`validateHistoricalRecoveryPreflight`**, and the existing no-commit lane's predicates. The recovery validator remains execution authority for its existing explicit reconcile/recovery lane; v1 default `deliver` explanation does not offer that lane automatically. Until that lane's collector passes parity, its targeted variant is `action-not-explain-ready`/indeterminate with no recovery command inferred from prose. Preserve the existing sanctioned provider-action contract and exact expectedHeadSha binding.

- [ ] **Step 1 — Add failing parity cases** for open/merged PRs, no-commit delivery, attribution/base/method mismatch, current CI, protected branch authority, exact-head human approval, delivery records, missing provider capability, and required-read failure. Include every normal/reconcile lane found reachable by the inventory; optional recovery explanations may remain unsupported but cannot be labeled ready.

```js
const decision = await fixture.evaluate('deliver', 'approval-for-old-head');
assert.equal(decision.status, 'blocked');
assert.ok(decision.blockers.every((b) => b.remediation || b.noAutomaticRemediation));
assert.equal(fixture.calls.providerAction, 0);
assert.deepEqual(fixture.effects, []);
```

- [ ] **Step 2 — Run VC9 to RED**, including stale explain followed by changed PR HEAD and revoked approval before the provider boundary.
- [ ] **Step 3 — Extract collection/predicates from `runDeliver`.** Collect immutable PR/CI/review/record authority with provenance. Route all pre-effect delivery conditions through shared predicates, retaining existing mutation-specific payload construction and provider transport. Never convert a missing sanctioned provider capability into shell merge guidance.
- [ ] **Step 4 — Revalidate at each existing delivery effect boundary.** No reuse of explanation authority or prior subprocess reads. Classify transport/write failures after ready as execution failures; preserve idempotent already-delivered behavior and historical reconstruction protections.
- [ ] **Step 5 — Run VC9 to GREEN and commit**, with stable coded dispositions and no expanded legacy allowance.

**Acceptance criteria:**

- [ ] Delivery explanation covers full current authorization across supported lanes without invoking a provider or writing records. <!-- aitm-verified vc-list="vc:9" -->
- [ ] Execution still binds current exact-HEAD authority and refuses changes after explanation. <!-- aitm-verified vc-list="vc:9" -->

### Task 10: Share close readiness and complete lifecycle parity

**User story:**

As an agent finishing an issue,
I want to inspect every close requirement before attempting the transition,
So that delivery, approval, child disposition, and completion checks remain enforceable.

**Scope/files:** Create `action-decision/close.mjs`. Modify `verbs/close.mjs`, `lib/close-gates.mjs`, `lib/trunk-ref.mjs`, `lib/commit-attribution.mjs`, `lib/review-exit-close-gates-guard.mjs`, `lib/close-delivery-receipt.mjs`, and shared readiness seams in `lib/evidence-v2/{close-machine,close-runner}.mjs`. Create `scripts/tests/integration/task-tracker/lib/action-close.test.mjs` and `action-parity.test.mjs`.

**Interfaces:** Completes the close adapter and the v1 registry readiness inventory, including the read-only remote-tip/object-completeness attribution seam specified in Task 4. Consumes Task 5 persistence/readback, Task 9 delivery predicates, and existing close guards rather than flattening special close lanes into a new policy.

- [ ] **Step 1 — Add failing parity cases** for ordinary and epic close, missing/current human approval, incomplete DoD, delivery not recorded, dirty workspace, wrong lineage, evidence-v2, incorporated/no-commit lanes, and closed/reopened convergence reachable by ordinary close. Explicit force/supersede/recovery mutations are never selected by remediation output.

```js
const comparison = await fixture.compareEvaluationAndExecution('close-delivery-missing');
assert.equal(comparison.evaluated.status, 'blocked');
assert.deepEqual(comparison.evaluated.blockers, comparison.executed.readiness.blockers);
assert.deepEqual(comparison.explainEffects, []);
assert.equal(fixture.calls.githubClose, 0);
```

- [ ] **Step 2 — Run VC10 to RED.** Run an aggregate conformance table for all seven actions across ready, blocked, indeterminate, changed authority, and named post-ready infrastructure failures. For every reachable refusal, require a stable typed or inventoried manual disposition; no reason parsing.
- [ ] **Step 3 — Extract full close readiness before effects.** Include verb, guards, lower mutator, delivery/approval, and per-lane requirements. Evaluate projected DoD, persist only after ready, read back actual provenance, and refuse further effects on failure. Keep close timing flush, finalization, cascades, board writes, and GitHub close on the execution side.
- [ ] **Step 4 — Complete the navigation and conformance registry.** Generic Review navigation can recommend the sanctioned close action only after current Review selection logic agrees; required delivery appears as a blocker/remediation. Done has no forward recommendation. No untested lane can inherit readiness merely because its action ID is registered.
- [ ] **Step 5 — Run VC10 to GREEN and commit.** Capture comparable authority counts/median/p95 against Task 1 and initial CI regression ceilings with at least 20% unused headroom. Keep deterministic counts and service-latency measurements separate. Review the residual legacy inventory and its explicit human-only work before completing A2.

Add an epic fixture with a child approval requirement: root result remains parent/close; blocker remediation and human request identify child/promote through the registry. Include multiple children and reject mismatched inferred targets. Acting on the child still requires its own binding and fresh evaluation; returning the request does not authorize either issue's mutation.

**Acceptance criteria:**

- [ ] Close and all v1 lifecycle paths pass unchanged-authority readiness/refusal parity, drift revalidation, and no-effect explanation tests. <!-- aitm-verified vc-list="vc:10" -->
- [ ] Parent approval/delivery/DoD/child and alternate-lane protections remain intact; force/bypass is unreachable from guidance. <!-- aitm-verified vc-list="vc:10" -->
- [ ] Residual legacy manual work and post-extraction authority-cost evidence are explicit and CI-enforced. <!-- aitm-verified vc-list="vc:10" -->

### Task 11: Validate guidance syntax, schema, references, and field locations

**User story:**

As a guidance maintainer,
I want to validate a complete catalog with precise independent diagnostics,
So that malformed or ambiguous YAML never becomes operational instruction.

**Scope/files:** Create `guidance/{positions,parse,validate,documentation,requirements,fingerprints}.mjs`, `instructions/aitm-guidance.schema.json`, a complete seed `instructions/aitm-guidance.yml`, `scripts/tests/helpers/guidance-fixtures.mjs`, and `scripts/tests/unit/task-tracker/lib/guidance-validator.test.mjs`. Modify `package.json`/`package-lock.json` to move exact `js-yaml: "5.4.2"` from `devDependencies` to `dependencies` and explicit `instructions/` allowlist.

**Interfaces:** Produces `validateGuidance` and deterministic normalized entries/digests with source ranges. Completeness comes from core-required guidance IDs/bindings in `requirements.mjs`, not from the candidate catalog declaring itself complete. The seed contains every required lifecycle entry; Task 15 migrates richer human content and proves source-rule coverage.

- [ ] **Step 1 — Prove the parser contract with failing fixtures.** Use `parseEvents` to inspect syntax and field ranges before `constructFromEvents`. Test nested sequences/mappings, quoted/block scalars, duplicate keys/IDs, explicit tags, anchors/aliases, and literal/quoted merge keys. Strictly reject malformed UTF-8 before parsing. Build the line index over the same normalized JavaScript string used by the parser.

```js
const source = 'human: { explanation: "😀", bad: true }\r\n';
const diagnostic = fixture.validateUnknownField(source, 'human.bad');
assert.equal(diagnostic.line, 1);
assert.equal(diagnostic.column, 29); // UTF-16 units; emoji occupies two.
assert.equal(
  diagnostic.column,
  fixture.validateUnknownField(source.replaceAll('\r\n', '\n'), 'human.bad').column
);
```

The position fixture wraps this mapping in a valid entry while retaining an explicit expected full-source line/column. Also assert raw range offsets independently of decoded scalar values; accented, combining, lone-CR, and folded/escaped scalar cases must pass. Confirm the literal column in the fixture from the exact source string when implementing, rather than weakening the assertion to match parser output.

- [ ] **Step 2 — Run VC11 to RED**, then record the parser selection evidence. Planning confirmed the 5.4.2 event API exports; this task must prove full syntax/range behavior with tests. If complete contract testing uncovers a blocker, stop and reopen parser selection with a failing fixture and manual plan review before Tasks 12–13; do not silently substitute a second parser. Never use plain `load()` as an alternate runtime path.
- [ ] **Step 3 — Implement all ten validation stages.** Accumulate independent errors; dependent stages skip unusable nodes rather than invent values. Reject unknown keys and arbitrary instruction values. Validate action/guard/remediation/prohibition references against Task 1 vocabulary, typed human examples, required summary/explanation, and package-relative shipped documentation paths. Resolve explicit HTML anchors and GitHub-compatible heading slugs, including duplicate suffixes; reject traversal and escaping symlinks. Keep this resolver distinct from the curated `lint:doc-anchors` check.
- [ ] **Step 4 — Define bounded catalog limits in the schema/library.** Proposed v1 engineering limits: 1 MiB normalized source, 512 entries, 128-character IDs, 64 instructions per entry, 64 bindings per binding list, 32 KiB human explanation, and 2 KiB diagnostic excerpts. Proposed proxy limits are 1,000 per agent block, 16,000 per human block, 17,000 per complete entry, 64,000 across agent blocks, 160,000 across human blocks, and 240,000 for the normalized complete catalog. Record the complete seed's measurements against these versioned constants with >=20% unused headroom; these catalog-storage limits do not replace §20.2 response ceilings. Prove limit+1 failures and aggregate diagnostics. Changes to these schema choices require review, not runtime catalog overrides.
- [ ] **Step 5 — Compute the five spec fingerprints.** Canonicalize maps deterministically, preserve semantic list order, normalize raw newlines, and include the exact §10 projections. Agent digest excludes human text; human digest excludes agent text; file digest includes comments. Test comment-only/human-only/agent edits and deterministic key-order normalization.
- [ ] **Step 6 — Run VC11 to GREEN and commit.** Validate the packaged seed and schema offline, including registry completeness and shipped documentation references. No operational entrypoint uses an incomplete seed.

**Acceptance criteria:**

- [ ] One parser/validator rejects forbidden syntax and unknown grammar with deterministic complete diagnostics and correct normalized UTF-16 positions. <!-- aitm-verified vc-list="vc:11" -->
- [ ] Vocabulary, completeness, documentation anchors, fingerprints, field limits, and catalog budgets are enforced offline. <!-- aitm-verified vc-list="vc:11" -->
- [ ] The selected parser is available in production dependencies, with contract-selection evidence. <!-- aitm-verified vc-list="vc:11" -->

### Task 12: Enforce guidance source trust and operational admission

**User story:**

As a project maintainer,
I want to adopt guidance explicitly and have invalid or tampered sources block operations,
So that the running package cannot silently substitute a different instruction catalog.

**Scope/files:** Create `guidance/{source,admission,annotation}.mjs`, `instructions/aitm-guidance.release.json`, `scripts/task-tracker/guidance.mjs`, and `scripts/maintenance/generate-guidance-release.mjs`. Modify `bin/{aitm,aitm-registry,cli}.mjs`, `scripts/task-tracker/task-tracker.mjs`, `lib/command-surface/{catalog,entrypoints,routing}.mjs`, lifecycle success boundaries, `package.json`, and `.github/workflows/ci.yml`. Create `scripts/tests/integration/task-tracker/lib/guidance-admission.test.mjs` and `scripts/tests/fixtures/1558/admission-surface.json`; extend `core/package-boundary.test.mjs` and `downstream-package-boundary.test.mjs`.

**Interfaces:** Produces active/candidate/published source profiles, trust classification, early admission, standalone validate/source CLI, and one post-success issue annotation. The admission API initially validates on each command; Task 13 replaces its internals with cache loading without changing refusals.

**Admission inventory (baseline, deliberately broader than explanation):** seven v1 explain actions are not the operational CLI allowlist. At this baseline `bin/aitm-registry.mjs` exposes **72 verb/alias tokens** and **21 standalone/router tokens**, not just the 21 cursor-trigger labels. Task 12 estimates and tests this entire surface, plus direct supported entrypoints. Record one row per route/subcommand in `admission-surface.json`: canonical route, aliases, entrypoint, pre-admission imports, first potential effect, gate call, exception classification, and fixture ID. An unclassified newly exposed route fails CI.

| Surface                    | Baseline tokens / entrypoints                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Timer/session              | `start`, `stop`, `pause`, `resume`, `update`, `log`, `words-count`; numeric issue binding through the dispatcher                                                                                                                                                                                                                                                                                  |
| Lifecycle/delivery         | `refine`, `promote`, `next`, `demote`, `shelve`, `park`, `cancel-plan`, `assign`, `transfer`, `unassign`, `test`, `review`, `deliver`, `evidence`, `reopen`, `incident-ledger`, `action-ledger`, `close`, `end`, `reconcile`, `supersede`, `pull-next`                                                                                                                                            |
| Planning                   | `new`, `plan`, `save-plan`, `save-draft`, `plan-approve`, `mirror-deep-dive`, `user-story`, `story`, `inflate-estimate`, `plan-estimate`, `decompose-check`, `split-plan`                                                                                                                                                                                                                         |
| Evidence/dependencies      | `ensureChecked`, `check`, `ensureUnchecked`, `ac-stamp`, `dod-stamp`, `commit-trace`, `evidence-markers`, `issue-body`, `comment`, `workflow-exception`, `workflow-preflight`, `adopt-github-records`, `approve`, `reject`, `block`, `unblock`, `migrate-dependencies`                                                                                                                            |
| Configuration/reporting    | `status`, `config`, `board`, `kind`, `epic-reconcile`, `cancel`, `auto`, `chore-mode`, `fleet`, `occupancy`, `report`, `discover`, `brainstorm`, `migrate`                                                                                                                                                                                                                                        |
| Standalone/router          | `aitm`, `ai-task-manager`, `create-issue`, `preflight-issue`, `capture-actions`, `set-priority`, `set-rank`, `update-event-fields`, `project-tether`, `log-issue-time`, `verify-develop`, `verify-delivery-incident-reconciliation`, `value-report`, `measure-context`, `heal-backlog`, `ensure-wave-parent`, `dispatch-prep`, `cut-epic-branch`, `cut-child-worktree`, `merge-back`, `sync-epic` |
| Package CLI                | `bin/cli.mjs` install/init/repair/statusline/configure/memory-resync; version/help recovery and task-verb delegation are distinct routes                                                                                                                                                                                                                                                          |
| Internal/direct boundaries | `scripts/task-tracker/task-tracker.mjs`, `scripts/gh/move-state.mjs`, and supported direct maintenance/migration entrypoints from `EXECUTABLE_ENTRYPOINTS`; classify hook/library/test-only entries explicitly so they cannot become alternate operational entrypoints                                                                                                                            |
| Recovery only              | guidance validate/source, top-level and command help, version; guidance human explain is **not** an invalid-catalog exception                                                                                                                                                                                                                                                                     |

`force`, `bind`, `rebind`, `review-probe`, and `callback` in the cursor-trigger map are not all registered bare CLI commands at this baseline. Enumerate actual routed forms/flags and internal callback effects; do not invent commands from that map. `next` is a current VERBS alias but has no independent `routeIdentityForVerb` mapping; explicitly wire its explain form to the canonical route and test it rather than deriving routing from cursor labels. New explain/guidance routes introduced here must be added to the same inventory. Shared dispatch admission may cover many aliases, but fixture coverage still demonstrates each canonical path and every alias reaching that gate before effects, including force/supersede and approval variants. If this enumerated scope exceeds the atomic estimate, **split Task 12 before implementation** into source/trust/recovery admission and entrypoint/annotation integration children, with separate verifiers and a pinned WBS revision; B1 remains incomplete until both are delivered. Enumeration is not an estimate waiver.

- [ ] **Step 1 — Add failing source/profile tests.** Cover source checkout, linked worktree, scoped install, global/npx-like relocated install, symlinked package, supported virtual resolution, missing source/fingerprint, root-level ignored catalog, untracked/staged/modified override, whole-catalog shadowing, and invalid override with valid package present. Verify module-relative package identity; unreadable/unsupported resolution fails by name rather than searching another package.

```js
const result = await fixture.runOperational('promote', { catalog: 'invalid-project' });
assert.equal(result.code, 'guidance-catalog-invalid');
assert.equal(result.compactDiagnosticCount, 1);
assert.deepEqual(fixture.callsBeforeRefusal, []); // network/lock/session/guards/provider
assert.equal((await fixture.runGuidance(['validate', '--file', fixture.candidate])).valid, true);
assert.equal(fixture.githubWrites.length, 0);
```

- [ ] **Step 2 — Run VC12 to RED**, against the explicit admission inventory below, including every operational command kind in command-surface enumeration and direct supported task-tracker/installer entrypoints. Inventory imports and startup paths for effects before `buildContext`, action-capture environment preparation, and guard dispatch. Move effectful startup behind admission; a module import cannot escape the gate. Validate/source/help/version must remain usable without building operational context.
      Add invalid-catalog cases with `TT_SKIP_NETWORK=1` and every inventoried startup/admission-affecting flag: admission still refuses before guard/session/lock/provider effects, independently of network availability or skip configuration. With a valid catalog, required skipped authority remains `authority-read-skipped`/indeterminate as in Task 6; a skip never disables catalog validation or supplies successful evidence. Inventory remaining behavioral controls by their actual effect, not a blanket bypass label.

- [ ] **Step 3 — Implement source/trust and release fingerprints.** Check tracked status with Git, allow staged/modified tracked content with provenance warnings, and never auto-create an override. Compare normalized raw file bytes to the installed published baseline. Editing provenance cannot classify project content as published. Generate the checked-in release manifest only through an explicit maintenance command; runtime never restamps it. Record `parser: { name: "js-yaml", version: "5.4.2" }` as separate compiler metadata; do not redefine the published raw-file fingerprint to include dependency bytes. CI recomputes and rejects disagreement, and packing includes catalog/schema/manifest and referenced docs.
- [ ] **Step 4 — Implement recovery CLI.** Support validate with `--json`, `--file`, `--published`, `--refresh`; source reports absolute selected path, selection reason, and trust without contents. Candidate profile validates content/references/completeness/budgets normatively and reports placement/tracking as non-blocking activation diagnostics. Default/published profiles enforce their operational trust requirements. No GitHub calls. Operational failure prints precisely the compact spec refusal; detailed diagnostics are explicit validator output only.
- [ ] **Step 5 — Add divergence audit integration.** After a successful lifecycle mutation, while issue mutation serialization still protects the annotation check/write, inspect all comment pages once for a versioned hidden `aitm-guidance-override:v1` marker. If absent, post the spec's single visible annotation with source/digest metadata. Later catalog edits cannot add another visible annotation. Failed mutations/read-only commands never annotate. Post-success annotation failure returns named `guidance-annotation-failed` audit warning without rollback. Test retries, concurrency under the existing lock, pagination, and failure; do not assume a distributed GitHub compare-and-swap guarantee.
- [ ] **Step 6 — Run VC12 to GREEN and commit.** Record per-command B1 cold parse/validation timings and exact packed-entry delta. Adjust the package ceiling only with measured, reviewed runtime additions. Add a release assertion that refuses an operational-loader consumer release while B2 cache certification is absent; no temporary release bypass. Production-only packed installation must validate successfully and `init` must leave the override absent.

**Acceptance criteria:**

- [ ] Source resolution/trust and complete shadowing work across layouts; invalid guidance blocks every operational route before effects while recovery remains usable. <!-- aitm-verified vc-list="vc:12" -->
- [ ] Diverged guidance creates at most one serialized issue annotation, with visible audit failure and no read-only writes. <!-- aitm-verified vc-list="vc:12" -->
- [ ] Package/release checks ship and verify required assets, production parser, cold baseline, and the mandatory B2 release gate. <!-- aitm-verified vc-list="vc:12" -->

### Task 13: Compile and cache valid and invalid guidance results

**User story:**

As a user of one-shot AITM commands,
I want to reuse validated static guidance across processes,
So that unchanged invocations avoid parsing YAML without retaining stale authority.

**Scope/files:** Create `guidance/{compile,cache-identity,cache}.mjs`; modify guidance admission and CLI to use them. Create `scripts/tests/unit/task-tracker/lib/guidance-cache.test.mjs`, `scripts/tests/integration/task-tracker/lib/guidance-cache-process.test.mjs`, and `scripts/tests/fixtures/1558/cache-budgets.json`. Extend the Task 12 release/package gate.

**Interfaces:** Produces `loadGuidance` and the four split artifact schemas from §12. Agent-index lookup is direct by guidance ID; it contains no human block. Invalid manifest loads need no diagnostics artifact unless explicitly requested.

- [ ] **Step 1 — Add failing separate-process tests.** Compile once, launch fresh consumers with parser/semantic-validator invocation traps, and check manifest-only, agent, human, and invalid-diagnostic paths. A counter that resets in the same process is insufficient evidence.

```js
await fixture.compileInChildProcess();
const warm = await fixture.loadInChildProcess({ need: 'agent', forbidParseAndValidate: true });
assert.equal(warm.stdout, '');
assert.equal(warm.loadedHumanCatalog, false);
assert.equal(warm.parserCalls, 0);
assert.equal(warm.validatorCalls, 0);
```

- [ ] **Step 2 — Run VC13 to RED.** Test source replacement with preserved mtime, chmod/ctime changes, missing stat fields, index tracking changes, explicitly selected index, linked `.git` file, split-index dependency, package/schema/validator/registry/published-digest change, deletion/adoption of override, and forced refresh.
- [ ] **Step 3 — Implement cache identity and conservative fallbacks.** Use realpath/device/inode/size/nanosecond mtime+ctime/source type/runtime versions (including `js-yaml@5.4.2` and the `guidance/parse.mjs` adapter version)/vocabulary/published digest/worktree index identity. Resolve Git paths through `rev-parse --git-dir` and `--git-path index`, respecting selected and split indexes. Missing reliable fields trigger content hashing and fresh tracking checks, or an indeterminate refusal; never compare missing fields as equal. Include validation profile and explicit candidate path in validation-cache identity so candidate success cannot authorize an active untracked override.
- [ ] **Step 4 — Compile deterministically and publish atomically.** Stat/read/stat, retry once on change, then refuse indeterminate. Normalize and build minified agent/human or invalid diagnostic artifacts with digests. Write unique temporary files and rename; publish manifest last. A concurrent source generation or interrupted publication can only yield a digest-checked miss and rebuild, never a mixed accepted catalog. Use the stable spec filenames; readers retry from source on a cross-generation mismatch. Successful cold/warm operation is silent, and no live authority appears in the cache.
- [ ] **Step 5 — Verify corruption recovery and cost.** Corrupt/truncate/remove each artifact and mismatch every schema/digest. Rebuild silently without manual cache cleanup. Ordinary invalid calls read only the manifest and compact refusal; validator loads diagnostics. Memoize parsed indexes only for the current process. Benchmark all five §20.1 cases against B1 cold measurements and commit CI-derived budgets with >=20% unused headroom; assert relative cold/warm behavior and zero warm parser/validator calls.
- [ ] **Step 6 — Run VC13 to GREEN and commit.** Make B2 certification a required release test, satisfying the gate installed in Task 12 through passing tests rather than deleting the gate.

**Acceptance criteria:**

- [ ] Valid/invalid catalogs compile deterministically into split artifacts; concurrent writers and corrupt/stale cache files recover safely. <!-- aitm-verified vc-list="vc:13" -->
- [ ] Unchanged cross-process warm calls are silent and skip YAML parsing/semantic validation with worktree-aware tracking identity. <!-- aitm-verified vc-list="vc:13" -->
- [ ] Runtime benchmarks and production-package cache certification satisfy the B1+B2 consumer-release requirement. <!-- aitm-verified vc-list="vc:13" -->

### Task 14: Expose routine explanations, receipts, and explicit diagnostics

**User story:**

As an agent choosing the next action,
I want compact fresh operational guidance and explicit access to evidence when investigation needs it,
So that repeated instructions and unused provenance do not inflate routine context.

**Scope/files:** Create `verbs/explain.mjs`, `guidance/protocol.mjs`, `scripts/tests/integration/task-tracker/lib/guidance-explain.test.mjs`, and `scripts/tests/unit/task-tracker/lib/guidance-receipts.test.mjs`. Modify guidance CLI, dispatcher/command-surface routing, `verbs/{promote,review,close,help,help-data}.mjs`, and command self-doc data. Consume Task 3 projection/envelope validation and Task 13 static cache. Add real CLI captures to Task 1's preserved scenario artifacts without overwriting the legacy baseline.

**Interfaces:** `aitm explain N [--action ID] [--known ID@DIGEST] [--known-source RECEIPT] [--diagnostic] --json`. Repeatable `--known` and source receipt are caller attestations, never session/disk state. `--known-source` is the explicit transport selected for §17 receipts. Generic/next/review/close explain forms call the same engine; `--diagnostic` is a boolean declared v1 mode, not an open debug channel. Route explanation before mutation-oriented context/preflight setup, after safe guidance admission.

**Source-receipt transport choice for manual review:** Section 17 requires a response receipt but does not name its JSON member. Declare optional top-level `sourceReceipt` in the initial closed envelope schema as a string matching `aitm-guidance-source:project-owned-diverged:sha256:<64 lowercase hex digits>`. It is present exactly when an unsuppressed typed source-divergence warning is returned, uses that warning's full digest, and is absent otherwise; malformed/mismatched values fail validation. Both declared modes use the same rule. The adapter renders §17's fixed warning from the typed source warning and emits the receipt; count the actual rendered warning/receipt as well as CLI traffic in each applicable transcript, without counting the same emission twice. This is not a free-form evidence or warning-text field, nor permission for future unversioned envelope additions. Task 1 candidate fixtures and Task 3 envelope tests must use this initial choice so feasibility does not omit its cost.

- [ ] **Step 1 — Add failing actual-CLI tests and run VC14 to RED.** Cover generic navigation, seven explicit actions, five registered-pending actions, unknown `workflow.promote`/`rebind`, terminal Done, unknown/conflicting state, collection failures before guards, all aliases, and all mode/shape rejection cases. Check full stdout/stderr and routine logging for evidence-only fields, raw messages and human text. Actual typed SHA args remain visible. Effect traps must cover network writes, locks, session changes, Git ref mutation, tests/review/provider actions and evidence stamps.

```js
const first = await fixture.cli(['explain', '1558', '--action', 'promote', '--json']);
const entry = first.json.guidance[0];
const repeat = await fixture.cli([
  'explain',
  '1558',
  '--action',
  'promote',
  '--known',
  `${entry.id}@${entry.digest}`,
  '--json',
]);
assert.equal(repeat.json.guidance[0].status, 'not-modified');
assert.equal(Object.hasOwn(repeat.json.guidance[0], 'agent'), false);
assert.ok(repeat.authorityReadCount > 0);
assert.deepEqual(repeat.effects, []);
assert.equal(Object.hasOwn(first.json, 'fullDecision'), false);
assert.equal(Object.hasOwn(first.json, 'decision'), false);
```

- [ ] **Step 2 — Wire routine serialization and receipts.** Evaluate once per command, project the completed decision, resolve all required guidance entries, and validate the entire closed envelope before output. Only matching ID/agentDigest suppresses instruction text. Preserve `aitm-guidance-loaded:ID:DIGEST` protocol and independent `aitm-guidance-source:project-owned-diverged:sha256:...` source receipts using the closed `sourceReceipt` transport specified below. Human-only edits preserve agent digest; agent edits expand; comment-only source changes can re-warn independently. Irrelevant/malformed/mismatched receipts cannot omit needed instructions. Matching stale attestation may suppress text, as documented, but never suppress fresh evaluation or permit changed guards to execute.
- [ ] **Step 3 — Implement diagnostics from the same evaluation.** Explicit mode includes the same result/guidance plus the full unabridged internal decision and required diagnosticMessages (empty array when none). It performs no second authority collection/evaluation solely for diagnostics. Raw messages are untrusted text, never execution guidance. Under fixed authority/receipt inputs compare operational equality and read counts across modes. A subsequent diagnostic command always collects fresh authority: test a routine timeout followed by successful diagnostics, retaining the original routine typed failure in its original output and making no claim to retrieve it. No diagnostic persistence/archive. Never automatically add diagnostics for blocked/indeterminate results; an agent may explicitly investigate an appropriate typed disposition, and every such request/output must be counted.
- [ ] **Step 4 — Test compaction, human detail and recovery.** Compliant adapters discard all known/source receipts after compaction, clear, fresh worker or sentinel invalidation, even if summary text contains markers. No CLI memory-loss detector or ledger restoration. Explicit `guidance explain ID` loads human catalog and source/trust/summary/explanation/triggers/execution/examples/references/fingerprints without readiness evaluation. Invalid catalog still allows source/validate/help/version, not human explain. `workflow-preflight` remains distinct with its unchanged JSON contract.
- [ ] **Step 5 — Replay the pinned scenario before further migration.** Capture complete real CLI traffic for first/repeat/change/compaction and required investigations. Compare candidate/actual operational semantics and all typed fields. Actual routine clean/blocked cases must meet 240/400; combine actual traffic with explicitly identified proposed static adapter text to recheck 4,000/5,600 end-state feasibility and lower total than the preserved equivalent legacy baseline. Also publish current un-slimmed totals separately. A breach stops Task 15 for correction within the spec; a modeled static projection is not final release evidence. Cross-check extracted read requirements/cardinalities against Task 1 inventory.
- [ ] **Step 6 — Run VC14 to GREEN and commit.** Confirm mutation still performs independent fresh guarded evaluation after any explanation. Preserve full evidence internally, enforce no routine stdout/stderr/debug leakage, and pin actual capture identities for final comparison.

**Acceptance criteria:**

- [ ] Generic/targeted/alias CLI modes use fresh shared readiness with no effects; routine result preserves operations and omits evidence-only material throughout visible output. <!-- aitm-verified vc-list="vc:14" -->
- [ ] Explicit diagnostics expose complete same-invocation evidence/messages without extra reads; later diagnostics are fresh, never implicit retrieval or fallback. <!-- aitm-verified vc-list="vc:14" -->
- [ ] Receipt/source suppression and compaction invalidation follow the spec; explicit human help/recovery remain separate and invalid receipts never weaken execution. <!-- aitm-verified vc-list="vc:14" -->
- [ ] Actual traffic replaces candidate serialization before content migration, with honest current versus modeled-static totals and enforced intermediate feasibility. <!-- aitm-verified vc-list="vc:14" -->

### Task 15: Hydrate the guidance catalog and migrate human documentation

**User story:**

As a maintainer reviewing lifecycle instructions,
I want to inspect terse agent guidance and its complete human explanation in one catalog,
So that slimming the skill does not discard workflow obligations or conceal local customization.

**Scope/files:** Modify `instructions/aitm-guidance.yml`, regenerate its release fingerprint, extend `guidance/requirements.mjs`, and create `scripts/tests/fixtures/1558/rule-guidance-map.json` plus `scripts/tests/unit/task-tracker/lib/guidance-rule-coverage.test.mjs`. Complete `docs/guides/ask-the-script.md`; update `docs/guides/{workflow,guard-architecture}.md` and add only the Epic A supersession pointer to `docs/superpowers/specs/2026-09-08-aitm-yml-pipeline-engine-design.md`.

**Interfaces:** Produces a complete required-entry map from current router/pickup and lifecycle Tier-2 paragraphs to executable enforcement, structured catalog guidance, or explicit human documentation. Receipt protocol obligations remain in adapters, not catalog-authored shell content.

- [ ] **Step 1 — Add failing coverage tests.** Enumerate obligations from bind/resume/state-walk/test/review/deliver/close/commit-trail content and pickup. Every operational obligation needs an enforcement reference or a retained boundary prohibition; moving it only into human prose cannot preserve necessary agent behavior.

```js
for (const row of mapping) {
  assert.ok(row.sourcePath && row.sourceAnchor);
  assert.ok(row.enforcementPath || row.retainedProtocolRule);
  assert.ok(catalog.entries.some((entry) => entry.id === row.guidanceId));
}
assert.equal(validateGuidance(publishedRequest).valid, true);
```

- [ ] **Step 2 — Run VC15 to RED.** Include completeness failures from deleting an entry/binding and broken shipped documentation anchors. Map only executable vocabulary from Task 2; no new catalog operation without a schema revision.
- [ ] **Step 3 — Hydrate content.** Write terse closed agent instruction sequences and descriptive human fields with triggers, execution, examples, and docs. Preserve provenance, exception/waiver distinctions, human/provider boundaries, and the residual legacy manual dispositions. References target shipped guides, not unshipped tests or historical specs.
- [ ] **Step 4 — Document adoption and failure recovery.** Show `npx aitm guidance source`, explicit human copy of its reported path, and Git tracking; never prescribe an assumed scoped/global path. Explain all trust classes, comment-only divergence, validator profiles, blocked-operation repair, independent source/instruction receipts, compaction limitations, annotation failures, and cache disposal. Add the accepted Epic A pointer without altering #1559/#1560/#1561 decisions in the historical design.
- [ ] **Step 4a — Revalidate the static feasibility assumption.** Once `rule-guidance-map.json` is complete, derive obligation-complete proposed router/pickup/adapter bytes for both adapters without yet removing installed prose. Rerun `node scripts/maintenance/measure-guidance-candidate.mjs --all --assert-feasible --json` with these exact bytes and Task 14 actual CLI traffic; update the single feasibility decision and comparison with the new map/static/capture digests. Every deleted operational obligation needs enforcement or a retained protocol rule. Failure blocks Task 16 and skill migration; correct within the budgets and remeasure. Keep Task 1a baseline immutable, and retain prior candidate reports as historical inputs rather than overwriting their provenance.
- [ ] **Step 5 — Run VC15 to GREEN and commit.** Keep current operational skill prose intact at this stage. Verify packaged catalog and references plus release fingerprint after the final content edit.

**Acceptance criteria:**

- [ ] Every migrating lifecycle obligation maps to enforcement/protocol and complete validated catalog content, with human documentation preserved. <!-- aitm-verified vc-list="vc:15" -->
- [ ] Adoption, trust, recovery, attestation limitations, and scoped historical supersession are documented accurately. <!-- aitm-verified vc-list="vc:15" -->

### Task 16: Capture paired CLI transcripts, tokenizer calibration, and authority costs

**User story:**

As a release reviewer,
I want an equivalent complete before/after context comparison and separately measured authority cost,
So that claimed reduction cannot hide command traffic, required investigation, or additional reads.

**Scope/files:** Create `scripts/task-tracker/measure-guidance-context.mjs`, `scripts/task-tracker/lib/context-budgets.mjs`, and `scripts/tests/integration/task-tracker/lib/guidance-context.test.mjs`. Extend Task 1's preserved runner and fixtures; add `scripts/tests/fixtures/1558/{lifecycle-transcript,context-budgets,tokenizer-calibration,authority-after}.json` and update the distinct `context-comparison.json` with actual CLI capture identities. Pin an appropriate real tokenizer development dependency/lock version; no runtime dependency is needed for calibration. Make existing `measure-context.mjs` and the new tool import the same scoped constants.

**Interfaces:** `--all --json` records complete honest reports; `--all --assert-budgets --json` is the final context/reduction gate used in Task 17. Deterministic authority/effect injection is test-harness only, never a production bypass flag. Reuse Task 1a’s isolated transport mechanism, reconcile every behavioral-flag disposition and test-only relocation affecting measured paths, and fail on an unclassified inherited control; do not limit this rule to newly added code. Preserve the baseline's source/fixture/runner identities and file bytes; current adapter changes cannot inflate or recapture the historical baseline as if unchanged.

- [ ] **Step 1 — Add failing accounting/comparability tests; run VC16 to RED.** Replay the same scenario/state/evidence/remediation transitions for both workflows and adapters. Require complete loaded text, commands, stdout/stderr, warning and receipt input/output, repeated metadata and any diagnostic investigation. Catch removal of legacy output, mismatched scenario/authority hashes, omitted compaction, selecting only JSON fields, double counting categories, and false substitution of current text for frozen baseline bytes. Distinguish preparation-only modeled text from actual loaded final text.

```js
assert.equal(report.uncountedAgentVisibleBytes, 0);
assert.equal(
  report.proxyTokens,
  report.staticFiles.reduce((sum, file) => sum + Math.ceil(file.characters / 4), 0) +
    Math.ceil(report.trafficCharacters / 4)
);
assert.equal(report.repeated.agentInstructionCharacters, 0);
assert.equal(report.compaction.expandedRequiredEntries, true);
assert.deepEqual(report.baseline.scenarioDigest, report.candidate.scenarioDigest);
assert.deepEqual(report.baseline.authorityFixtureDigest, report.candidate.authorityFixtureDigest);
```

- [ ] **Step 2 — Implement the paired comparison.** Emit both source commits, adapter/tool versions, scenario/fixture digests, ordered transcript paths, per-category exact characters/UTF-8 bytes/proxy counts, total, delta, and fixed-budget verdicts. Candidate mode must identify actual CLI traffic and whether static text is final or modeled. Legacy dynamic output is not zero. Original full streams reconcile to category totals. Compare total work, not symmetric categories. Neither reduced static text alone nor a small first query can satisfy the gate. Count full explicit diagnostics required in the representative lifecycle, even though standalone diagnostic detail is outside routine 300/500 response ceilings.
- [ ] **Step 3 — Calibrate real tokens and report heavy cases.** Record tokenizer package/version/encoding, response bytes, actual tokens, proxy and ratio for clean/blocked/repeated/full lifecycle and explicit diagnostics, for each supported calibration scope. Never label proxy as model tokens or one encoding as universal. Measure the reachable heavy scenario and actual per-action cardinalities with finite inputs and unbounded dimensions called out. Vary evidence-only observation size (routine invariant) and operational content (must remain present); no digest truncation of typed operational args or omission of diagnostic evidence. No universal heavy-case ceiling is invented.
- [ ] **Step 4 — Enforce authority accounting.** Compare explain with the corresponding executor read-only phases under unchanged inputs: no extra physical requests, zero in-attempt duplicates except documented refresh, zero policy collection on a baseline pass, scoped enrichment only on waivable failures. Count pagination/retries separately. Explain then execute collects independently, and same-invocation diagnostics adds no reads. Annotation overhead remains a post-success lookup with all pages counted and at most one write if absent. Report deterministic request counts, local cache timings, stub transport and controlled live median/p95 separately. Establish reviewed CI timing ceilings with >=20% headroom; exact request invariants must not become loose timing thresholds.
- [ ] **Step 5 — Run VC16 to GREEN and commit the pre-slim report.** Accounting tests may pass while final context gate is red for retained legacy instructions; report that explicitly. Task 14's intermediate candidate/actual-traffic feasibility remains required. Task 17 must turn on the strict gate and regenerate final actual evidence; no final acceptance from this intermediate report.

**Acceptance criteria:**

- [ ] Reproducible paired reports count complete equivalent workflows for both adapters and preserve the original baseline; actual versus modeled evidence is explicit. <!-- aitm-verified vc-list="vc:16" -->
- [ ] Real-tokenizer calibration and complete diagnostic/heavy-case costs are recorded without truncation, hidden traffic, or universal-bound claims. <!-- aitm-verified vc-list="vc:16" -->
- [ ] Authority request/refresh/diagnostic invariants and separately identified timing budgets pass; final context/reduction acceptance stays gated on Task 17. <!-- aitm-verified vc-list="vc:16" -->

### Task 17: Slim both adapter protocols and certify the consumer release

**User story:**

As an AITM agent,
I want to retain only the boundary/query/receipt protocol and load guidance when needed,
So that a complete governed lifecycle fits the fixed context budget without weakening execution.

**Scope/files:** Modify `skill/shared/router.md`, `skill/adapters/{codex,claude}/SKILL.md`, `templates/{pickup-directive,session-boot}.md`, lifecycle files under `skill/shared/rules/`, `measure-context.mjs` scenarios and budget selection, shared `lib/context-budgets.mjs`, package/release CI gates, and `docs/guides/ask-the-script.md`. Update generated/installed template mirrors using `scripts/sync-templates.mjs` and inspect its diff. Extend `core/{measure-context,session-boot,worker-context-contract,package-boundary}.test.mjs`; create `scripts/tests/integration/task-tracker/lib/guidance-release.test.mjs`.

**Interfaces:** Retains the spec's five permanent rules, hard boundary prohibitions, canonical command pointers, receipt emission, and explicit post-compaction invalidation. Existing skill sentinels remain a separate namespace. Both adapters use the same protocol; preserve any additional installed adapter compatibility rather than silently breaking its shared router.

- [ ] **Step 1 — Add failing end-state tests.** Require both adapter variants to fit working maxima 4,000/240/400/5,600, with fixed absolute ceilings 5,000/300/500/7,000. Assert the five permanent rules, no second state walk, exact command/help pointers, and no automatic human prose load. Test compaction summaries and disk ledgers cannot be used as instruction-source restoration by the documented adapter protocol.

```js
for (const adapter of ['codex', 'claude']) {
  const report = await fixture.measureAdapter(adapter);
  assert.ok(report.routerPlusPickup.proxy <= 4000);
  assert.ok(report.clean.proxy <= 240);
  assert.ok(report.blockedRepresentative.proxy <= 400);
  assert.ok(report.fullLifecycle.proxy <= 5600);
  assert.ok(report.fullLifecycle.proxy < report.legacyEquivalentLifecycle.proxy);
  assert.equal(report.comparison.captureKind, 'actual-cli-and-loaded-static');
}
assert.equal(fixture.postCompactRequest.known.length, 0);
assert.equal(fixture.staleAttestationBypassesGuards, false);
```

- [ ] **Step 2 — Run VC17 to RED**, preserving the pre-slim report from Task 16. Identify the precise router/pickup/Tier-2 text responsible; raising token ceilings is not a fix. Replace independent in-scope `BUDGETS`/`SCENARIO_BUDGETS` literals with imports from `context-budgets.mjs`: add an explicit invoked-plus-pickup static scenario (ceiling 5,000, working maximum 4,000), cap the static bind/full-lifecycle instruction subset at 7,000/5,600, and apply the headroom check to these in-scope scenarios. Preserve separately labeled idle/parallel scenarios unless deliberately re-scoped. A static instruction subset is necessary but insufficient evidence: it cannot stand in for the captured request/response lifecycle. VC17 requires both static and full-transcript gates. Their overlapping ceilings come from the same constants; a test changes one shared fixture to exceed its limit and proves both applicable consumers fail. The existing command chain's final nonzero exit already blocks the aggregate; do not describe one legacy tool's green output as aggregate success.
- [ ] **Step 3 — Slim operational prose using the Task 15 map.** Replace lifecycle state-walk and procedure content with query/receipt pointers after parity and mapping checks pass. Keep governed mutation requirements and hard prohibitions needed to reach the script boundary. Query after bind/resume, at unsettled lifecycle decisions, refusal/drift, compaction, and external approval/merge; never mandate a query before every read/edit/test/Git command. Invalidate receipts in Codex and Claude boot/pickup/compaction instructions, including fresh worker starts; no CLI compaction-detection claim.
- [ ] **Step 4 — Run the fixed transcript and release gates.** Regenerate complete paired context-comparison evidence after slimming, using actual final loaded files and CLI traffic. Both adapter totals must be lower than the preserved equivalent Markdown baseline and satisfy all fixed working maxima; no modeled final text or candidate serializer remains in release evidence. If responses exceed ceilings, reduce repeated serialization/catalog verbosity without omitting required operational fields or leaking evidence-only provenance. Exercise valid/default/tracked/diverged/invalid catalogs, tampered package, recovery CLI, warm cache, true production-only tarball install, and init-without-override. Verify help, source paths, shipped assets, package count delta, and refusal inventory. Run existing unit and integration lanes for all changed lifecycle areas. Certify result/guidance/mode validation in both adapters and next/review/close aliases; recheck the #1561 full-contract boundary independently of the compact presentation.
- [ ] **Step 5 — Run VC17 to GREEN and commit final evidence.** Parent completion requires every row of the traceability table below, accepted manual plan review, complete child/WBS coverage, shared-contract compatibility with #1561, recorded benchmark/tokenizer evidence, and B1+B2 release certification. Keep the release gate as a permanent regression test. Do not publish or hydrate issues as an incidental effect of running these tests.

**Acceptance criteria:**

- [ ] Both adapter/router/pickup and full captured lifecycle fixtures meet fixed ceilings with >=20% unused headroom, including repeat/change/compaction and required diagnostics, and demonstrate lower complete total cost than the equivalent preserved Markdown baseline. <!-- aitm-verified vc-list="vc:17" -->
- [ ] Minimal protocol preserves hard boundary protections, query schedule, receipt invalidation, and distinct workflow-preflight semantics. <!-- aitm-verified vc-list="vc:17" -->
- [ ] Production package, invalid admission, full lifecycle parity, cache certification, and context/authority regression gates pass together before consumer release. <!-- aitm-verified vc-list="vc:17" -->

## Verification Commands

These are implementation-time verifiers, not claims that new test files already exist or have passed while authoring this plan. Each hydrated child receives its relevant exact command in its own root Verification Commands section and local AC citations. Run the focused command once to prove the intended failure and again after implementation; a missing import is an initial RED signal, but the final test must exercise the behavior described in the task. Existing test helpers use repository-local scratch directories, never system temporary paths. Add the hydrated child's `@story` tag to every new test.

- [ ] `node --test scripts/tests/unit/task-tracker/lib/guidance-legacy-baseline.test.mjs scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` <!-- id=1 -->
- [ ] `node --test scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs && node scripts/maintenance/measure-guidance-candidate.mjs --all --json` <!-- id=18 -->
- [ ] `node --test scripts/tests/unit/task-tracker/lib/action-decision-contract.test.mjs && node scripts/maintenance/lint-action-refusals.mjs` <!-- id=2 -->
- [ ] `node --test scripts/tests/unit/task-tracker/lib/action-presentation.test.mjs` <!-- id=3 -->
- [ ] `node --test scripts/tests/unit/task-tracker/lib/action-observations.test.mjs scripts/tests/integration/task-tracker/lib/action-evaluator.test.mjs` <!-- id=4 -->
- [ ] `node --test scripts/tests/unit/task-tracker/lib/functional-dod-project.test.mjs scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs scripts/tests/unit/task-tracker/lib/review-derive-rescan.test.mjs` <!-- id=5 -->
- [ ] `node --test scripts/tests/integration/task-tracker/lib/action-session-promote.test.mjs scripts/tests/unit/task-tracker/lib/lifecycle-policy.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-early-stages.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-plan-develop.test.mjs` <!-- id=6 -->
- [ ] `node --test scripts/tests/integration/task-tracker/lib/action-test.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-mid-stages.test.mjs scripts/tests/unit/task-tracker/lib/test-407-binding-survives.test.mjs` <!-- id=7 -->
- [ ] `node --test scripts/tests/integration/task-tracker/lib/action-review.test.mjs scripts/tests/unit/task-tracker/lib/review-preflight.test.mjs scripts/tests/unit/task-tracker/lib/review-preflight-epic-aware.test.mjs scripts/tests/unit/task-tracker/lib/review-verb-timing-order.test.mjs` <!-- id=8 -->
- [ ] `node --test scripts/tests/integration/task-tracker/lib/action-deliver.test.mjs scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs scripts/tests/unit/task-tracker/lib/delivery-real-pr-evidence.test.mjs scripts/tests/unit/task-tracker/lib/manual-code-review-delivery.test.mjs` <!-- id=9 -->
- [ ] `node --test scripts/tests/integration/task-tracker/lib/action-close.test.mjs scripts/tests/integration/task-tracker/lib/action-parity.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-review-done.test.mjs scripts/tests/unit/task-tracker/lib/close-gate-order.test.mjs` <!-- id=10 -->
- [ ] `node --test scripts/tests/unit/task-tracker/lib/guidance-validator.test.mjs` <!-- id=11 -->
- [ ] `node --test scripts/tests/integration/task-tracker/lib/guidance-admission.test.mjs scripts/tests/unit/task-tracker/core/package-boundary.test.mjs scripts/tests/integration/task-tracker/lib/downstream-package-boundary.test.mjs` <!-- id=12 -->
- [ ] `node --test scripts/tests/unit/task-tracker/lib/guidance-cache.test.mjs scripts/tests/integration/task-tracker/lib/guidance-cache-process.test.mjs` <!-- id=13 -->
- [ ] `node --test scripts/tests/integration/task-tracker/lib/guidance-explain.test.mjs scripts/tests/unit/task-tracker/lib/guidance-receipts.test.mjs` <!-- id=14 -->
- [ ] `node --test scripts/tests/unit/task-tracker/lib/guidance-rule-coverage.test.mjs && node scripts/task-tracker/guidance.mjs validate --published --refresh --json` <!-- id=15 -->
- [ ] `node --test scripts/tests/integration/task-tracker/lib/guidance-context.test.mjs && node scripts/task-tracker/measure-guidance-context.mjs --all --json` <!-- id=16 -->
- [ ] `node --test scripts/tests/integration/task-tracker/lib/guidance-release.test.mjs scripts/tests/unit/task-tracker/core/measure-context.test.mjs scripts/tests/unit/task-tracker/core/session-boot.test.mjs scripts/tests/unit/task-tracker/core/worker-context-contract.test.mjs && node scripts/task-tracker/measure-context.mjs --all --adapter codex && node scripts/task-tracker/measure-context.mjs --all --adapter claude && node scripts/task-tracker/measure-guidance-context.mjs --all --assert-budgets --json && npm run test:unit && npm run test:integration` <!-- id=17 -->

Tasks add their new tests to the existing lane/layout/story-tag conventions. Every runtime addition also updates required package-entry assertions and records its measured packed-entry delta; Task 12 and Task 17 are aggregate package checks, not permission for earlier commits to silently break that boundary. Run scoped formatting/lint and repository-required CI for each child; parent release acceptance includes all new verifiers and existing applicable guard/verb regressions.

**Separate foundation gate (Task 1b completion record and mandatory prerequisite to Task 2):** `node scripts/maintenance/measure-guidance-candidate.mjs --all --assert-feasible --json`. An accurate NO-GO can pass VC18, but must fail this command. Record its exit status explicitly. VC17 is the final actual-evidence context/reduction gate, not a substitute for this early decision.

Before committing or assigning review hashes to any plan/spec/review artifact, run Prettier and Markdown lint directly on its bytes, bypassing ignore exclusions. Recompute SHA-256 only after those checks; do not change already pinned review bytes without a new documented revision.

## Parent acceptance traceability

| Spec requirement                                 | Tasks             | Required evidence                                                                                     |
| ------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------- |
| §26 AC1 shared complete evaluation               | 1, 2, 4–10        | Seven-action source inventory and verb/delegate/mutator parity                                        |
| AC2 stable complete dispositions                 | 2–10              | Closed code/producer/args definitions, refusal inventory/lint, multi-refusal fixtures                 |
| AC3 free-text and bypass boundary                | 2, 3, 11, 14      | Grammar/typed-remediation rejection and raw-message containment                                       |
| AC4 inspectable catalog                          | 11, 15            | Agent/human catalog, schema, obligation map                                                           |
| AC5–6 override and init                          | 12, 17            | Module layout, tracking/shadowing, actual production install/init                                     |
| AC7 complete diagnostics                         | 11, 12            | Ten stages, precise UTF-16 ranges, independent diagnostic accumulation                                |
| AC8 early invalid admission                      | 12, 17            | Exhaustive operational entrypoint/effect traps and recovery allowlist                                 |
| AC9 compiled valid/invalid cache                 | 13, 17            | Cross-process parser/validator traps, invalidation/concurrency/corruption                             |
| AC10 divergence                                  | 3, 12, 14         | Typed warning/source receipt and serialized paginated annotation cases                                |
| AC11 compact dynamic explanation                 | 1, 3, 14, 16, 17  | Closed operational projection, actual CLI fidelity and fixed response budgets                         |
| AC12 receipt/compaction                          | 14, 16, 17        | Repeat/change/reload/stale-attestation tests with fresh guarded execution                             |
| AC13 explicit human detail                       | 13–17             | Split artifacts and complete output capture                                                           |
| AC14 fresh mutation authority                    | 4–10, 14          | Drift, retry/readback, subprocess and provider boundary tests                                         |
| AC15 minimal adapter protocol                    | 15–17             | Obligation map, both adapter/router/pickup text and installed mirrors                                 |
| AC16 context/authority reduction                 | 1, 10, 13, 16, 17 | Paired context-comparison, fixed headroom, tokenizer, request and timing evidence                     |
| §§13.2/15.2 failure/warning/request completeness | 1–4, 6–10, 14     | Typed causes, preserved order/duplicates, policy-human mapping and cross-issue scope                  |
| §15.2 closed modes/versioning                    | 2, 3, 14, 17      | Missing/unknown field rejection, result/guidance recertification, #1561 compatibility                 |
| §15.5 explicit diagnostics                       | 3, 14, 16, 17     | Same-invocation full decision/messages, no additional reads or automatic fallback, fresh later query  |
| §§13.5/23.2 normalization                        | 5–10              | Staged pure derivation, intent identity, ready-only versioned writes and actual readback provenance   |
| §20.2 pre-foundation evidence                    | 1, 2              | Paired baseline, candidate semantics, explicit GO prerequisite before runtime changes                 |
| §§20.2/23.3 reduction proof                      | 1, 14, 16, 17     | Reproducible preserved legacy runner, equivalent actual total comparison, required diagnostic traffic |
| §§2/22 scope and joint release                   | 12, 13, 15, 17    | Epic A pointer only; no B1-only operational-loader release                                            |

Task 1b candidate success is not parent completion. VC1 certifies inventory/baseline; VC18 certifies clause-complete candidate accounting; the sole `--assert-feasible` command additionally requires GO, and Task 15 reruns it after the obligation map. Parent acceptance requires all new verifiers, applicable existing regressions, no residual unclassified changed refusal/warning sites, accepted manual plan review, complete native child/WBS coverage, actual paired reduction for both adapters, fixed working maxima, and joint package/cache certification. Remaining unchanged legacy manual dispositions must be explicit; they may not fabricate automatic remediation or discard operational warning detail.

## Manual plan review and handoff

The human arranges Claude review and relays response paths. Do not invoke the peer-review skill, spawn reviewers, hydrate backlog issues, or start implementation from this draft. New reviewer/author responses under `docs/superpowers/reviews/1558/plan/` must identify this replacement path, its post-format SHA-256, the source-spec digest, role/round, stable findings, dispositions, and recommendation. Historical plan agreement does not approve this replacement.

Review focus: exact operational preservation (including indeterminate causes, warnings and cross-issue human requests); closed envelope/result/guidance modes; meaningful current-versus-new baseline; early feasibility before extraction; actual evidence before cutover; no authority/diagnostic leakage or automatic fallback; and retained evaluator, normalization, source/admission, parser, cache, package, and effect boundaries. Module splits, candidate/report tooling, catalog storage limits and source-receipt transport are explicit implementation choices for review. Numeric context ceilings and executable authority are unchanged.
