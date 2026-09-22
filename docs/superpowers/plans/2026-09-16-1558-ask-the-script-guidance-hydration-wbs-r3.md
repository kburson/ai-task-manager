# #1558 Ask-the-Script Guidance Hydration WBS — Revision 3

> **Status:** Proposed response to manual WBS round 2. Not accepted; do not hydrate or implement from this revision until the human accepts the reviewed commit and digest. Codex handles revisions; Sol5.6 drafted revision 1. No runtime or workflow changes are made by this document.

## Authority and scope

- Parent: `#1558`.
- Technical baseline: `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md` at `a168753999617066d98bbc1227c4b5d97fa531c5`, SHA-256 `9300f7f8730110e41d8ff2e0022f2d85d893e2f32549e0f9ddbe8f672b8ba635`.
- Ratified spec: `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`, SHA-256 `2e121b01863952df69ac13bb373bf9c2d671e1e04027b047289f96647d9eea78` at the same commit.
- Superseded hydration proposal: `2026-09-16-1558-ask-the-script-guidance-hydration-wbs.md`, round-1 input SHA-256 `0d86d3af4be89c21a599520ed767a10f19be673f79ade851b2ff33e4de063422`. Its historical proposal is not hydration authority.

Revision 2 remains preserved at commit `f4970b17a8296d789f220fb020aa59ff101cc54a`, SHA-256 `bc58ab2116b1f0f86acbf3b37e5052dca5c65686670b41088c319bd1b3a09f82`; this revision supersedes it only after acceptance.

This revision is the proposed **expanded source plan for hydration**, with 26 unique numeric task headings. On acceptance, parent and child `Source-plan` fields select this file and its accepted commit. The original replacement plan remains the pinned technical baseline, recorded separately as `Baseline-plan`, `Baseline-plan-commit`, and `Baseline-plan-section`. Do not point child `Source-plan-section` back at duplicate original headings. The shipped checker ignores Source-WBS fields and cannot extract the original 1a/1b headings: this revision resolves that upstream representation defect without editing the agreed plan, adding a checker feature, or granting a waiver.

In this file, **WBS N** means its numeric heading. **Baseline Task N** means the original plan identity. Copied technical task bodies retain their original Task references; those references always mean baseline tasks, resolved through the mapping below. Original global constraints, interfaces, steps, parent traceability and release gates remain normative; splitting reallocates ownership only. Where this revision makes hydration/closure requirements stricter, they apply in addition.

Fixed context ceilings remain 5,000 / 300 / 500 / 7,000 proxy tokens and working maxima remain 4,000 / 240 / 400 / 5,600. Planning labor estimates below do not change context budgets. B1 and B2 still ship together. No runtime Task 2–17 begins before the single feasibility GO.

## Counting and sizing

An implementation unit is a distinct capability or independently rejectable certification deliverable with its own assertions. Writing its failing tests, implementing it, running its checks, formatting and committing are phases of that unit, not five separate units. An aggregate cross-action certification is separate from a single-action adapter. Lists below name the units and include task-local testing in the hours; queue time and later lifecycle review are excluded. These are estimates, not measured productivity or Backlog field values.

| Baseline scope           | Hours | Units | Uncertainty | Review decision                                                                                                                                                      |
| ------------------------ | ----: | ----: | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a inventory/flags       |    12 |     2 | Medium      | WBS 1; below review trigger                                                                                                                                          |
| 1a harness plus baseline |    44 |     8 | High        | Split independently into WBS 2–4: 16/3 + 16/3 + 12/2                                                                                                                 |
| Combined 1a              |    56 |    10 | High        | Four serial children; no combined issue                                                                                                                              |
| Combined 1b              |    52 |     9 | High        | Four serial children: 16/3 + 16/3 + 12/2 + 8/1                                                                                                                       |
| 4                        |    20 |     3 | High        | Retain after review: immutable observation attempt 6 h; full two-pass evaluator 8 h; pure derived-result/promote migration and parity 6 h                            |
| 8                        |    16 |     3 | Medium-high | Retain after review: complete shared Review preflight 8 h; evidence-dependent navigation 4 h; direct/delegated integration certification 4 h                         |
| 10                       |    32 |     4 | High        | Split: close collector/readiness 10 h; close navigation/parity 6 h; seven-action aggregate conformance 8 h; authority-cost plus residual-inventory certification 8 h |
| 12                       |    44 |     6 | High        | Split into source/trust 10 h, recovery 6 h, release identity/refusal 6 h; entrypoint integration 10 h, annotation 6 h, aggregate package/cold certification 6 h      |

Review at **16 hours OR 3 units**; mandatory split at **24 hours OR 4 units**, including either half and combined characterization scope. Six parent-level Step headings do not imply six independent capabilities: RED/GREEN/commit phases are attached to the capabilities they prove. Task 10 has four substantive capabilities even after that distinction and is split. Task 12 has six because it has six distinct behavior/certification boundaries, not because it has six Step headings. Task 4's promote/derived-result migration must remain atomic with removal of the existing mutation channel; Task 8's direct/delegated parity cannot certify an incomplete Review preflight.

The ten estimated children at or above the review threshold receive this explicit retention decision: **retain their stated bounded capability sets; these ten estimates are below both mandatory split thresholds**. They are WBS 2, 3, 5, 6, 11, 15, 17, 18, 20 and 21. The twelve retained children without pre-hydration estimates — WBS 9, 10, 12, 13, 14, 16, 19, 22, 23, 24, 25 and 26 — are sized at Refine under the same stop conditions; no below-threshold claim is made for them. Mandatory pre-hydration sizing applies to the baseline scopes named in the table; this does not introduce a new pre-hydration estimate requirement for all other scopes. WBS 20/21 are 22-hour high-uncertainty estimates with only 2 hours below the mandatory threshold; their route/layout assumptions require early confirmation. At Refine and before starting any expanded scope, re-estimate hours and count units. An estimate reaching 24 hours, a fourth unit, an unresolved estimate, or a changed boundary stops execution and requires a reviewed split/revision before continuing. The same rule applies to retained WBS 11/15 and every other child; neither this document nor a successful review is a permanent size waiver.

## AC allocation and aggregate ownership

Original AC numbers below are their order in each baseline task. A split AC is partitioned by behavior; an aggregate owner reruns component proofs without acquiring a second implementation claim. No original AC text is blindly duplicated onto siblings.

| Baseline criterion | Exclusive implementation allocation                                                                                                               | Final aggregate owner |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1a AC1             | WBS 1: complete source/effect/flag inventory                                                                                                      | WBS 4 / VC1           |
| 1a AC2             | WBS 2: physical interception, shapes, escape/package proof; WBS 3: coherent authority, real predicates and per-lane positive reconciliation       | WBS 4 / VC1           |
| 1a AC3             | WBS 4: both frozen full baselines, replay and timing provenance                                                                                   | WBS 4 / VC1           |
| 1b AC1             | WBS 5: pinned inputs/index/traceability integrity; WBS 6: complete executed semantics and mutation proofs                                         | WBS 8 / VC18          |
| 1b AC2             | WBS 6: evidence-cardinality invariance; WBS 7: paired costs/sensitivity/heavy-case/timing inputs; WBS 8: honest final verdict                     | WBS 8 / VC18          |
| 1b AC3             | WBS 8: sole GO assertion and open-issue NO-GO hold                                                                                                | WBS 8 / VC27          |
| 10 AC1             | WBS 17: close-specific parity/drift/effects; WBS 18: all-seven conformance                                                                        | WBS 18 / VC10         |
| 10 AC2             | WBS 17: parent/approval/delivery/DoD/child and alternate close protections                                                                        | WBS 18 / VC10         |
| 10 AC3             | WBS 18: residual manual inventory and CI authority-cost evidence                                                                                  | WBS 18 / VC10         |
| 12 AC1             | WBS 20: source/trust, admission API and single recovery classification; WBS 21: all operational entrypoint wiring and coverage                    | WBS 21 / VC12         |
| 12 AC2             | WBS 21: serialized one-time annotation and audit failure                                                                                          | WBS 21 / VC12         |
| 12 AC3             | WBS 20: identity/assets and B2-absent release refusal; WBS 21: actual package/install/init, per-command cold baseline and aggregate release proof | WBS 21 / VC12         |

Of the fourteen retained baseline contracts, thirteen preserve the original substantive body and WBS 9 preserves that body plus its disclosed additional foundation-entry AC. Their literal component commands and arguments are preserved; forbidden shell chains are expanded into separate required entries as described below. Revision 3 normalizes story fragments to the renderer’s required three-line syntax and remaps AC citation metadata to issue-local IDs; no baseline requirement or implementation step is removed. These bodies are therefore not claimed byte-identical to the baseline. All original VC1–VC18 identities survive; stage verifiers VC19–VC26 and the existing foundation command labeled VC27 supplement them. New test files are future implementation deliverables, not claims of current passing runtime tests. Aggregate suites must execute their component assertions, not merely check that their files exist.

## Verifier names and issue-local citation IDs

`VC1`–`VC27` in narrative and the hydration map are cross-document **plan names**, not issue IDs. Each child supplies its commands in the displayed `Run:` order. New issue IDs start at 1. The renderer rejects `&&` command chains, so this revision expands each baseline chain into its individual literal commands, preserving their order and arguments and requiring every component to pass. No command is removed or replaced by a wrapper. An AC that formerly cited a compound verifier now cites **all** of its component IDs; one passing component cannot satisfy the conjunction.

| WBS ranks       | Plan name to issue-local ID mapping    |
| --------------- | -------------------------------------- |
| 8               | VC18 → `vc:1 vc:2`; VC27 → `vc:3`      |
| 9               | VC2 → `vc:1 vc:2`; VC27 → `vc:3`       |
| 24              | VC15 → `vc:1 vc:2`                     |
| 25              | VC16 → `vc:1 vc:2`                     |
| 26              | VC17 → `vc:1 vc:2 vc:3 vc:4 vc:5 vc:6` |
| All other ranks | Their one plan verifier → `vc:1`       |

WBS 8’s GO closure and WBS 9’s GO entry cite `vc:3`, the foundation assertion. The renderer may append ordinary DoD commands after the supplied commands; these do not change the supplied IDs. Every child AC marker below already uses the issue-local ID(s). Preserve those markers when creating a fresh child. Stable IDs are not renumbered later: when resuming an already-created issue, inspect its actual IDs by exact command text and preserve their identity. An existing body with a different allocation is a stop condition for this revision's strict fresh-body check; review a revised mapping before proceeding rather than rewriting its stable IDs to make the check pass.

`--verification-commands-file` contains bare executable command strings, one command per line. Strip display labels (`Plan verifier name`, `Run:`), Markdown backticks, checkbox wrappers and heading/ID comments. Copy the already expanded `Run:` lines exactly; do not recombine them with `&&`. For WBS 8 the entire fragment is:

```text
node --test scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs
node scripts/maintenance/measure-guidance-candidate.mjs --all --json
node scripts/maintenance/measure-guidance-candidate.mjs --all --assert-feasible --json
```

WBS 9 likewise has three lines; WBS 24/25 have two and WBS 26 has six. Every other child has one. `--ac-file` contains the child's existing `- [ ]` lines, including local `vc-list` markers, without a heading or additional wrapper; the renderer preserves checkbox lines. `--user-story-file` contains exactly the three displayed heading-free lines beginning `As a/an`, `I want to`, and `So that`. No instruction or example prose belongs in these fragments.

After the offline render and again after creation, parse the root Verification Commands with `parseVerificationCommands`, parse every AC marker with `parseProofMarker`, and pass its `vc-list` to `resolveVcListStrict`. Require the resolved literal command(s) to equal that AC’s complete intended command set, not merely to exist. WBS 8 closure and WBS 9 entry must resolve to the third command, the GO assertion. Never stamp evidence to compensate for an unresolved or misdirected citation. The post-hydration command below performs these checks too. Running each component separately changes command packaging, not acceptance: all original components must pass before the child can advance.

## Hydration map

Sequence is the required rank. Map each WBS sequence to its newly created issue number before writing dependencies; sequence numbers are not GitHub issue numbers. Every runtime child also directly depends on WBS 8, so an unresolved or reopened feasibility decision is visible to every runtime child rather than only transitively through WBS 9.

| Rank / WBS | Baseline identity | Native prerequisite WBS ranks | Required verifier IDs |
| ---------: | ----------------- | ----------------------------- | --------------------- |
|          1 | 1a-i              | None                          | VC19                  |
|          2 | 1a-ii-a           | 1                             | VC20                  |
|          3 | 1a-ii-b           | 2                             | VC21                  |
|          4 | 1a-ii-c           | 3                             | VC1                   |
|          5 | 1b-i              | 4                             | VC22                  |
|          6 | 1b-ii             | 5                             | VC23                  |
|          7 | 1b-iii            | 6                             | VC24                  |
|          8 | 1b-iv             | 7                             | VC18 and VC27         |
|          9 | 2                 | 8                             | VC2 and VC27          |
|         10 | 3                 | 8, 9                          | VC3                   |
|         11 | 4                 | 8, 10                         | VC4                   |
|         12 | 5                 | 8, 11                         | VC5                   |
|         13 | 6                 | 8, 11, 12                     | VC6                   |
|         14 | 7                 | 8, 11, 12                     | VC7                   |
|         15 | 8                 | 8, 13, 14                     | VC8                   |
|         16 | 9                 | 8, 11                         | VC9                   |
|         17 | 10a               | 8, 12, 15, 16                 | VC25                  |
|         18 | 10b               | 8, 17                         | VC10                  |
|         19 | 11                | 8, 9                          | VC11                  |
|         20 | 12a               | 8, 13, 14, 15, 16, 18, 19     | VC26                  |
|         21 | 12b               | 8, 20                         | VC12                  |
|         22 | 13                | 8, 21                         | VC13                  |
|         23 | 14                | 8, 10, 18, 22                 | VC14                  |
|         24 | 15                | 8, 23                         | VC15                  |
|         25 | 16                | 8, 24                         | VC16                  |
|         26 | 17                | 8, 25                         | VC17                  |

## Child contracts

### Task 1: Inventory lifecycle sources, effects, refusals, and behavioral flags

**Baseline-plan-section:** `### Task 1a: Inventory source/effects/flags and freeze the legacy workflow baseline`. Former WBS identity: `1a-i`.

**User story:**

As a characterization maintainer,
I want to have fingerprinted authority and flag inventories,
So that no unclassified path or bypass can distort measurement.

**Estimate and units:** 12 hours; Source/effect and authority inventory (6 h); behavioral-flag classification and disposition (6 h). Owner: this child.

**Scope/files and boundary:** Own `scripts/tests/fixtures/1558/action-observation-inventory.json`, `behavioral-flags.json`, and `authority-baseline.json`; create `guidance-legacy-inventory.test.mjs` in the unit test directory above. Apply baseline Task 1a Step 1 in full, including transitive, indexed, aliased and destructured environment reads. No process harness, fixture execution or runtime edits.

**Handoff and verification behavior:** The inventory is the input contract for all subsequent characterization. Test completeness by deleting an observed source/flag row, not just by validating JSON shape.

**Acceptance criteria:**

- [ ] All seven paths enumerate predicates, resource subjects, conditional authority, known refusals, warnings, human obligations, locks and first effects with source symbols/fingerprints. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Every reachable production behavioral environment read has default/nondefault behavior, predicate/effect classification, baseline policy, disposition, rationale, owner and verifier. Removing a read/flag row or changing a fingerprint fails; legitimate operator controls are not blanket-retired. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC19; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/unit/task-tracker/lib/guidance-legacy-inventory.test.mjs`

### Task 2: Build and prove whole-process transport interception

**Baseline-plan-section:** `### Task 1a: Inventory source/effects/flags and freeze the legacy workflow baseline`. Former WBS identity: `1a-ii-a`.

**User story:**

As a harness maintainer,
I want to have all physical transport intercepted before production imports,
So that the unchanged CLI can be exercised without external effects.

**Estimate and units:** 16 hours; Launcher and sanitized environment (4 h); low-level interception, custom-promise shapes and nested/direct-network coverage (8 h); positive transport ledger and package exclusion (4 h). Owner: this child.

**Scope/files and boundary:** Own initial `scripts/tests/helpers/guidance-legacy-cli.mjs`, `guidance-legacy-preload.mjs`, and `guidance-legacy-transport.mjs`; own `guidance-legacy-transport.test.mjs`. The CLI module owns `captureLegacyWorkflow({ sourceCommit, adapter, scenario, authorityFixture, scratchRoot })`; transport owns callback/custom-promise dispatch and the physical ledger; preload alone patches process/network ports and synchronizes ESM exports. No lifecycle authority scenarios or frozen baseline.

**Handoff and verification behavior:** Serialize this child before WBS 3. WBS 3 may extend the launcher only to connect coherent scenarios; it does not replace this child’s dispatch or preload symbols. This test suite uses small explicit request/response fixtures, so it does not require WBS 3’s whole-lifecycle store.

**Acceptance criteria:**

- [ ] The launcher sanitizes inherited bypass/fake/fault flags, installs preload before imports, and confines local Git/filesystem/session/lock effects to isolated repositories. Unknown subprocess/network attempts fail in an outer ledger even if production catches the exception; production gains no bypass switch. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Callback execFile, exec, custom-promisify, aliased nodePexec/defaultExecFile, synchronous/spawn forms, nested children and direct HTTP have inventoried handling. Custom replacements preserve stdout/stderr, error code/streams and promise.child; restoring a native custom symbol fails positive ledger evidence with local canaries. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Positive local transport fixtures reconcile every declared request to physical ledger rows on Node 24 and development Node 26; empty ledger is rejected. Package tests exclude all harness code. Lifecycle-specific fixture expectations are reserved to WBS 3. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC20; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/unit/task-tracker/lib/guidance-legacy-transport.test.mjs scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`

### Task 3: Model coherent authority fixtures and lifecycle scenarios

**Baseline-plan-section:** `### Task 1a: Inventory source/effects/flags and freeze the legacy workflow baseline`. Former WBS identity: `1a-ii-b`.

**User story:**

As a baseline maintainer,
I want to have coherent lifecycle authority fixtures,
So that intercepted transport exercises actual production readiness rather than mocked successful results.

**Estimate and units:** 16 hours; Isolated repository and deterministic authority store (6 h); ordered success/refusal scenarios (6 h); expected-request and effect reconciliation (4 h). Owner: this child.

**Scope/files and boundary:** Create `scripts/tests/helpers/guidance-legacy-authority.mjs` and `guidance-legacy-authority.test.mjs`; own deterministic store/scenario builders under `scripts/tests/fixtures/1558/legacy-workflow/`. Extend the existing captureLegacyWorkflow launcher to use these fixtures. Consume, do not redefine, WBS 2 transport/preload functions. No frozen loaded text or candidate model.

**Handoff and verification behavior:** WBS 2 → WBS 3 is mandatory. WBS 3 owns lifecycle store/request expectations and authority tests; WBS 2 remains owner of interception symbols. Baseline aggregate tests are introduced only by WBS 4. Task 16 later extends the WBS 2 runner using the complete frozen generation published by WBS 4.

**Acceptance criteria:**

- [ ] The store supplies deterministic issue/board/approval/PR/provider authority and advances simulated remote state only when an actual unchanged CLI command reaches its intercepted mutation transport. <!-- aitm-verified vc-list="vc:1" -->
- [ ] All seven success/refusal lanes preserve real production predicates/formatting; approved and missing-approval counterparts differ by authority alone. Declared conditional reads, pages and retries reconcile expected identities to actual transport and store accesses; missing/extra observations fail. <!-- aitm-verified vc-list="vc:1" -->
- [ ] No validator, readiness result, guard, routing or complete successful verb result is mocked. A refused action leaves the store unchanged and full streams/effects remain available to the capture runner. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC21; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/unit/task-tracker/lib/guidance-legacy-authority.test.mjs`

### Task 4: Capture and freeze both legacy adapter baselines

**Baseline-plan-section:** `### Task 1a: Inventory source/effects/flags and freeze the legacy workflow baseline`. Former WBS identity: `1a-ii-c`.

**User story:**

As a measurement maintainer,
I want to have complete frozen legacy adapter traces,
So that candidate comparisons use identical governed work.

**Estimate and units:** 12 hours; Capture and fingerprint both ordered adapter workflows (8 h); independent completeness review and controlled timing record (4 h). Owner: this child.

**Scope/files and boundary:** Own `guidance-legacy-baseline.test.mjs`, `scripts/tests/fixtures/1558/legacy-baseline.json`, and frozen loaded-text/authority/transcript artifacts under `legacy-workflow/`. The aggregate baseline suite executes the inventory, transport and authority assertions from WBS 1–3. No candidate or production changes.

**Handoff and verification behavior:** This child owns baseline Task 1a Step 5 and publishes the single pinned input generation consumed by WBS 5 and baseline Task 16. It certifies the composition of prior child proofs without reassigning their implementation ownership.

**Acceptance criteria:**

- [ ] Both unchanged pinned CLI workflows retain every loaded file and complete ordered command input/stdout/stderr, effects, physical/logical request identity, pages/retries and source/runtime/runner/scenario/fixture digests; omitting any lane or output fails. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Controlled read-only live median/p95 observations record runtime/sample count separately from fixture transport timing, with no live mutations. Replay preserves original source and runner bytes after migration. <!-- aitm-verified vc-list="vc:1" -->
- [ ] The completion record confirms all seven lanes, known refusals, source/effect/flag coverage and the mandatory separate/combined sizing review. VC1 runs prior stage assertions; no candidate work begins until this frozen generation is complete. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC1; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/unit/task-tracker/lib/guidance-legacy-baseline.test.mjs scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`

### Task 5: Index normative clauses and validate oracle traceability

**Baseline-plan-section:** `### Task 1b: Certify candidate semantics and measure the single feasibility decision`. Former WBS identity: `1b-i`.

**User story:**

As a semantic reviewer,
I want to have a spec-derived clause index independent of serializer fields,
So that an incomplete oracle cannot certify itself.

**Estimate and units:** 16 hours; Verify frozen baseline inputs (4 h); independently transcribe normative clause index (8 h); implement assertion registry and traceability integrity checks (4 h). Owner: this child.

**Scope/files and boundary:** Own `scripts/tests/fixtures/1558/spec-clause-index.json`, initial `oracle-traceability.json`, `scripts/tests/helpers/guidance-clause-index.mjs`, and `guidance-clause-index.test.mjs`. No full candidate serializer, costs or final feasibility decision.

**Handoff and verification behavior:** Do not claim the full oracle has passed at this stage. WBS 5 owns the immutable clause vocabulary/runner; WBS 6 supplies the complete registered assertions/fixtures and final traceability outcomes without deriving the index from its implementation.

**Acceptance criteria:**

- [ ] WBS 4 baseline inputs and inventory/source/runner digests verify; bypass-derived success, missing transport evidence, stale sources or uncaptured outputs refuse candidate certification. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Every individually testable normative clause in baseline Task 1b Step 2 is independently transcribed from the pinned spec and mapped to positive/adversarial fixture and executable assertion identities. A reviewer checks the index against the actual spec. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Traceability integrity checks reject missing/duplicate clauses, stale digests and unknown or unexecuted assertion/fixture identities. Small probe assertions demonstrate missing generation and validation failures; the complete seven-action semantic executions remain WBS 6’s responsibility. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC22; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/unit/task-tracker/lib/guidance-clause-index.test.mjs`

### Task 6: Build complete candidate decisions and presentation fixtures

**Baseline-plan-section:** `### Task 1b: Certify candidate semantics and measure the single feasibility decision`. Former WBS identity: `1b-ii`.

**User story:**

As a candidate maintainer,
I want to have clause-complete decision and presentation fixtures,
So that size measurements never reward missing instructions or obligations.

**Estimate and units:** 16 hours; Complete decision and strict semantic oracle (6 h); routine/diagnostic serializer with policy-enriched seven-action fixtures (6 h); clause execution and generation/validation mutation proofs (4 h). Owner: this child.

**Scope/files and boundary:** Create candidate semantics in `scripts/tests/helpers/guidance-characterization.mjs`, `guidance-candidate-oracle.test.mjs`, and `scripts/tests/fixtures/1558/action-decision-fixtures/{bind,resume,promote,test,review,deliver,close}.json`. Complete WBS 5’s traceability outcome mappings. No production schemas/evaluators, cost comparison or gate writer.

**Handoff and verification behavior:** This child owns the full semantic oracle and serializer. WBS 5 supplies traceability infrastructure, not a second serializer. Later production conformance consumes the same frozen clause index and all candidate cases.

**Acceptance criteria:**

- [ ] All seven actions have reachable ready/blocked/indeterminate, warning, normalization and effective-policy human-request cases. Strict routine/diagnostic candidates preserve every normative operational field and full required digest with no valid-empty substitution. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Every indexed clause executes positive and adversarial assertions; deleting required generated human requests or their validator requirements fails before any feasibility decision. Unknown/missing members, arrays/nulls, subjects, modes, dispositions and producer arguments are rejected. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Increasing evidence-only cardinality leaves routine bytes identical; genuine operational blockers, warnings and subjects remain complete. Candidates are explicitly labeled test models, never production evaluator results. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC23; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/unit/task-tracker/lib/guidance-candidate-oracle.test.mjs`

### Task 7: Measure sensitivity and assemble paired comparison artifacts

**Baseline-plan-section:** `### Task 1b: Certify candidate semantics and measure the single feasibility decision`. Former WBS identity: `1b-iii`.

**User story:**

As a feasibility analyst,
I want to have complete paired costs and sensitivity evidence,
So that a smaller selected fragment cannot masquerade as a smaller workflow.

#### Story Intent

- **Beneficiary:** feasibility analyst
- **Capability:** compare complete paired costs and sensitivity evidence across both adapters
- **Need:** selected fragments can understate end-to-end workflow context by omitting operational traffic or obligations
- **Value or failure prevented:** a smaller selected fragment cannot masquerade as a smaller workflow

#### Files and delivery boundary

**Estimate and units:** 12 hours; Complete candidate workflow capture and paired cost categories (8 h); cardinality, sensitivity and reachable heavy-case accounting (4 h). Owner: this child.

**Scope/files and boundary:** Extend comparison functions in `guidance-characterization.mjs`; own `guidance-candidate-measurement.test.mjs`, `action-cardinality.json`, `serialization-sensitivity.json`, `context-comparison.json` and ordered `candidate-workflow/` artifacts. No authoritative verdict or production changes.

**Handoff and verification behavior:** This child produces comparison artifacts only. Its favorable totals cannot authorize runtime work. WBS 8 alone combines semantic, completeness and budget results into the authoritative verdict.

**Acceptance criteria:**

- [ ] Both adapters compare complete loaded proposed text and serialized command/receipt/stdout/stderr traffic to WBS 4’s equivalent frozen work, including repeat/change/stale receipt/compaction/remediation and required diagnostic requests. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Observed per-fixture cardinality, simultaneous reachability, fan-out, finite heavy inputs and unbounded dimensions are explicit; sensitivity uses actual serialized bytes/characters/proxy rather than average multiplication or shortened fingerprints. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Paired reports link exact source/scenario/fixture/tool identities and disclose the provisional static obligation assumption and remaining margins. Removing an output/category, guessing reads or treating fixture latency as service timing fails. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC24; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/unit/task-tracker/lib/guidance-candidate-measurement.test.mjs`

### Task 8: Record the sole feasibility decision and enforce the foundation gate

**Baseline-plan-section:** `### Task 1b: Certify candidate semantics and measure the single feasibility decision`. Former WBS identity: `1b-iv`.

**User story:**

As a maintainer funding runtime extraction,
I want to have a reproducible feasibility verdict with an enforced GO prerequisite,
So that an honest negative result cannot release runtime work.

#### Story Intent

- **Beneficiary:** maintainer funding runtime extraction
- **Capability:** reproduce one feasibility verdict and enforce it as the sole foundation prerequisite
- **Need:** favorable fragments can hide incomplete or over-budget workflow context and must not authorize downstream runtime work
- **Value or failure prevented:** only an evidence-complete, semantically faithful, budget-feasible candidate can release runtime extraction while an honest negative result blocks it

#### Files and delivery boundary

**Estimate and units:** 8 hours; Validate all pinned inputs and publish the single decision plus foundation assertion (8 h). Owner: this child.

**Scope/files and boundary:** Own `scripts/maintenance/measure-guidance-candidate.mjs`, aggregate `guidance-characterization.test.mjs`, and `scripts/tests/fixtures/1558/feasibility-decision.json`. Aggregate tests execute WBS 5–7 checks. No budget changes, runtime extraction or competing gate.

**Handoff and verification behavior:** Additional required verifier: VC27. The NO-GO procedure below is part of this child’s acceptance criteria; green accounting alone never satisfies closure. Revisions within the existing spec/budgets repeat the same measurement; contract changes return to manual review.

**Acceptance criteria:**

- [ ] The versioned decision pins every source, baseline, runner, clause/fixture/oracle, serializer, proposed static text and measurement input; all completeness/fidelity and fixed ceiling/headroom/reduction verdicts reproduce for both adapters. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] VC18 accepts honest NO-GO accounting while VC27 exits nonzero for it; missing or stale inputs cannot pass either completeness or GO. WBS 8 remains the sole writer/owner of the decision and foundation assertion. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] Closure requires VC27 exit 0 for the recorded accepted input generation. NO-GO commits measured evidence but leaves this issue OPEN in Develop; all runtime native dependencies on it remain unresolved. <!-- aitm-verified vc-list="vc:3" -->

**Verification Commands:**

Plan verifier name: VC18; issue-local IDs: `vc:1`, `vc:2`.

Run: `node --test scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs`

Run: `node scripts/maintenance/measure-guidance-candidate.mjs --all --json`

Plan verifier name: VC27; issue-local ID: `vc:3`.

Run: `node scripts/maintenance/measure-guidance-candidate.mjs --all --assert-feasible --json`

### Task 9: Establish the complete shared decision and typed vocabulary contract

**Baseline-plan-section:** `### Task 2: Establish the complete shared decision and typed vocabulary contract`. All Task references in the copied body below retain baseline numbering.

**User story:**

As a lifecycle maintainer,
I want to inspect one versioned action and refusal contract,
So that core execution, explanation, and future gate producers cannot disagree about authority.

#### Story Intent

- **Beneficiary:** lifecycle maintainer
- **Capability:** inspect one versioned action and refusal contract
- **Need:** core execution, explanation, and future gate producers currently lack one shared typed authority surface
- **Value or failure prevented:** prevent those consumers from disagreeing about lifecycle authority

#### Files and delivery boundary

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

- [ ] All seven v1 actions use one bare-ID registry and one versioned decision contract; #1561 has a documented consumption boundary. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] Every inventoried refusal is coded or explicitly manual, and new/changed unclassified sites fail CI. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] The closed blocker/warning/request schemas enforce producer, args, status, scope and policy invariants while preserving complete internal evidence; Task 1 GO is a checked prerequisite. <!-- aitm-verified vc-list="vc:1 vc:2" -->

**Additional foundation entry acceptance criterion:**

- [ ] Before runtime work, the recorded decision and input digests match current accepted artifacts and VC27 exits 0; stale/missing/NO-GO evidence blocks entry regardless of issue closure state. <!-- aitm-verified vc-list="vc:3" -->

**Verification Commands:**

Plan verifier name: VC2; issue-local IDs: `vc:1`, `vc:2`.

Run: `node --test scripts/tests/unit/task-tracker/lib/action-decision-contract.test.mjs`

Run: `node scripts/maintenance/lint-action-refusals.mjs`

Plan verifier name: VC27 (entry prerequisite); issue-local ID: `vc:3`.

Run: `node scripts/maintenance/measure-guidance-candidate.mjs --all --assert-feasible --json`

### Task 10: Validate and project the compact operational result

**Baseline-plan-section:** `### Task 3: Validate and project the compact operational result`. All Task references in the copied body below retain baseline numbering.

**User story:**

As an agent choosing a lifecycle action,
I want to have all operationally necessary information without repeated evidence metadata,
So that routine guidance remains small while explicit investigation can inspect complete evidence.

#### Story Intent

- **Beneficiary:** agent choosing a lifecycle action
- **Capability:** receive all operationally necessary action information without repeated evidence metadata
- **Need:** routine guidance currently repeats evidence provenance even though action selection needs only the validated operational projection
- **Value or failure prevented:** keep routine guidance small while preserving complete evidence for explicit investigation

#### Files and delivery boundary

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

- [ ] Strict shared validation and allowlist projection preserve every operational field while removing only specified diagnostic provenance; no valid-empty substitution hides content. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Typed failures, ordered warnings, effective-policy human requests, cross-issue subject mapping, and deterministic nonrecursive failure output match the amended spec. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Routine/diagnostic modes are closed, evidence growth alone does not grow routine output, and complete diagnostic data remains available without becoming execution input. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC3; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/unit/task-tracker/lib/action-presentation.test.mjs`

### Task 11: Extract immutable authority collection and complete guard evaluation

**Baseline-plan-section:** `### Task 4: Extract immutable authority collection and complete guard evaluation`. All Task references in the copied body below retain baseline numbering.

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

- [ ] Complete guards, conditional policy enrichment, provenance, and contiguity refresh share one read-only evaluation path with mutation. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Required-read failures, incompatible evidence, malformed results, and pending adapters never become ready; explanation performs no effects. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Read reuse is bounded to one attempt and does not remove execution refreshes. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC4; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/unit/task-tracker/lib/action-observations.test.mjs scripts/tests/integration/task-tracker/lib/action-evaluator.test.mjs`

### Task 12: Project Functional DoD and persist it only after readiness

**Baseline-plan-section:** `### Task 5: Project Functional DoD and persist it only after readiness`. All Task references in the copied body below retain baseline numbering.

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

- [ ] Explanation uses the same pure ordered projection as execution and discloses pending writes without performing them. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Concurrent edits trigger complete recomputation; failed writes/readbacks stop all subsequent effects. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Decision identity excludes timestamps/marker bytes, while execution readback checks actual provenance and idempotence. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC5; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/unit/task-tracker/lib/functional-dod-project.test.mjs scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs scripts/tests/unit/task-tracker/lib/review-derive-rescan.test.mjs`

### Task 13: Share bind, resume, and early promotion readiness

**Baseline-plan-section:** `### Task 6: Share bind, resume, and early promotion readiness`. All Task references in the copied body below retain baseline numbering.

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

- [ ] Bind/resume and early forward edges expose all required session, verb, and mutator checks with stable dispositions. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Shared navigation preserves lifecycle policy, terminal Done, and indeterminate unknown state without a second state walk. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Changed authority after explanation is refused by fresh execution checks. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC6; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/integration/task-tracker/lib/action-session-promote.test.mjs scripts/tests/unit/task-tracker/lib/lifecycle-policy.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-early-stages.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-plan-develop.test.mjs`

### Task 14: Share Test entry readiness without running tests in explanation

**Baseline-plan-section:** `### Task 7: Share Test entry readiness without running tests in explanation`. All Task references in the copied body below retain baseline numbering.

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

- [ ] Test and its promote delegate agree on all knowable readiness checks; explanation runs no test/sandbox/provider effect. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Execution refreshes authority and reports post-ready test outcomes truthfully. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC7; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/integration/task-tracker/lib/action-test.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-mid-stages.test.mjs scripts/tests/unit/task-tracker/lib/test-407-binding-survives.test.mjs`

### Task 15: Share Review readiness and evidence-dependent navigation

**Baseline-plan-section:** `### Task 8: Share Review readiness and evidence-dependent navigation`. All Task references in the copied body below retain baseline numbering.

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

- [ ] Direct/delegated Review and explanation share complete evidence, projection, policy, and transition checks. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Incomplete Review is navigated consistently; explanation never performs reviewer, probe, approval, or evidence effects. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC8; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/integration/task-tracker/lib/action-review.test.mjs scripts/tests/unit/task-tracker/lib/review-preflight.test.mjs scripts/tests/unit/task-tracker/lib/review-preflight-epic-aware.test.mjs scripts/tests/unit/task-tracker/lib/review-verb-timing-order.test.mjs`

### Task 16: Share delivery readiness without invoking providers

**Baseline-plan-section:** `### Task 9: Share delivery readiness without invoking providers`. All Task references in the copied body below retain baseline numbering.

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

- [ ] Delivery explanation covers full current authorization across supported lanes without invoking a provider or writing records. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Execution still binds current exact-HEAD authority and refuses changes after explanation. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC9; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/integration/task-tracker/lib/action-deliver.test.mjs scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs scripts/tests/unit/task-tracker/lib/delivery-real-pr-evidence.test.mjs scripts/tests/unit/task-tracker/lib/manual-code-review-delivery.test.mjs`

### Task 17: Share close readiness and preserve close-specific protections

**Baseline-plan-section:** `### Task 10: Share close readiness and complete lifecycle parity`. Former WBS identity: `10a`.

**User story:**

As an agent finishing an issue,
I want to have complete close readiness and fresh guarded execution,
So that explaining close cannot bypass delivery or approval.

**Estimate and units:** 16 hours; Close readiness, read-only attribution and object-completeness extraction (10 h); close navigation and close-specific execution parity (6 h). Owner: this child.

**Scope/files and boundary:** Own baseline Task 10 production file changes and `action-close.test.mjs`; preserve existing guard-parity-review-done and close-gate-order suites. No aggregate seven-action certification or A2 completion declaration.

**Handoff and verification behavior:** Covers baseline Task 10 Steps 1, 3 and the close-specific portion of Step 4. The read-only attribution seam is part of close readiness, not a fourth independently certified cross-action deliverable.

**Acceptance criteria:**

- [ ] Close readiness collects all ordinary/epic/alternate-lane authority, including read-only remote-tip/object completeness; preserves approval/delivery/DoD/child protections, projection/readback, changed-authority checks and no-effect explanation. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Close navigation respects current Review selection, delivery remediation and terminal Done. Parent/close results retain typed child/promote requests for multiple children and reject inferred mismatched targets. Force/supersede/recovery mutations are never selected. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Close-specific ready/blocked/indeterminate and post-ready failures are truthful; timing flush, finalization, cascades, board writes and GitHub close remain execution-only. A2 and full registry certification remain pending WBS 18. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC25; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/integration/task-tracker/lib/action-close.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-review-done.test.mjs scripts/tests/unit/task-tracker/lib/close-gate-order.test.mjs`

### Task 18: Certify seven-action parity and authority-cost regression limits

**Baseline-plan-section:** `### Task 10: Share close readiness and complete lifecycle parity`. Former WBS identity: `10b`.

**User story:**

As a lifecycle maintainer,
I want to have all seven extracted actions certified together,
So that local close success is not mistaken for complete A2 parity.

**Estimate and units:** 16 hours; Aggregate seven-action conformance and complete registry (8 h); authority-cost ceilings and residual legacy disposition certification (8 h). Owner: this child.

**Scope/files and boundary:** Own `scripts/tests/integration/task-tracker/lib/action-parity.test.mjs`, authority-count/timing evidence and residual legacy review record under `scripts/tests/fixtures/1558/`; complete conformance registry metadata after all action suites pass. Consume WBS 17 close implementation.

**Handoff and verification behavior:** Covers baseline Task 10 Step 2, aggregate portion of Step 4 and Step 5. Splitting does not relax any original VC10 command or AC; downstream work that required completed Task 10 now waits for WBS 18.

**Acceptance criteria:**

- [ ] All seven actions pass ready/blocked/indeterminate, changed-authority and named post-ready failure parity with stable typed or explicitly inventoried manual dispositions and no explanation effects. VC10 runs close regressions as well as the aggregate table. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Deterministic authority counts and separate controlled service median/p95 evidence compare to WBS 4; CI regression ceilings retain at least 20% unused headroom and are asserted by action-parity.test.mjs. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Residual legacy manual work is explicitly reviewed; unknown migrated refusals/warnings fail conformance. Complete the v1 registry and A2 only after this aggregate certification, never at WBS 17 closure. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC10; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/integration/task-tracker/lib/action-close.test.mjs scripts/tests/integration/task-tracker/lib/action-parity.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-review-done.test.mjs scripts/tests/unit/task-tracker/lib/close-gate-order.test.mjs`

### Task 19: Validate guidance syntax, schema, references, and field locations

**Baseline-plan-section:** `### Task 11: Validate guidance syntax, schema, references, and field locations`. All Task references in the copied body below retain baseline numbering.

**User story:**

As a guidance maintainer,
I want to validate a complete catalog with precise independent diagnostics,
So that malformed or ambiguous YAML never becomes operational instruction.

#### Story Intent

- **Beneficiary:** guidance maintainer
- **Capability:** validate a complete catalog with precise independent diagnostics
- **Need:** malformed YAML, ambiguous references, or incomplete entries can otherwise be mistaken for usable guidance
- **Value or failure prevented:** invalid guidance cannot be silently accepted, partially loaded, or mislocated during repair

#### Files and delivery boundary

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

- [ ] One parser/validator rejects forbidden syntax and unknown grammar with deterministic complete diagnostics and correct normalized UTF-16 positions. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Vocabulary, completeness, documentation anchors, fingerprints, field limits, and catalog budgets are enforced offline. <!-- aitm-verified vc-list="vc:1" -->
- [ ] The selected parser is available in production dependencies, with contract-selection evidence. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC11; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/unit/task-tracker/lib/guidance-validator.test.mjs`

### Task 20: Enforce guidance source trust and recovery admission

**Baseline-plan-section:** `### Task 12: Enforce guidance source trust and operational admission`. Former WBS identity: `12a`.

#### Story Intent

- **Beneficiary:** Maintainer adopting guidance in a project
- **Capability:** Select and validate an explicitly trusted catalog while retaining offline recovery
- **Need:** An invalid or tampered project catalog could otherwise be silently replaced by package guidance or reach operational effects
- **Value or failure prevented:** Operations fail before effects and a partial loader cannot ship without its required cache certification

#### Files and delivery boundary

**User story:**

As a maintainer adopting guidance,
I want to have explicit source trust and usable recovery with a joint-release guard,
So that invalid sources cannot be silently replaced or shipped alone.

**Estimate and units:** 22 hours; Source/layout/trust selection and validation API (10 h); recovery allowlist and CLI (6 h); release identity, packaging and B2-absent refusal (6 h). Owner: this child.

**Scope/files and boundary:** Own `guidance/{source,admission}.mjs`, `scripts/task-tracker/guidance.mjs`, release manifest/generator, `guidance-source-trust.test.mjs` and `guidance-release-refusal.test.mjs`, plus initial package-boundary assertions. Define the single recovery allowlist here. No operational route enumeration/wiring or annotation; no B2 cache implementation.

**Handoff and verification behavior:** B1 remains incomplete through WBS 21 and cannot ship without baseline Task 13/WBS 22 B2 certification. This child installs the refusal before any loader-adjacent merge. It can merge development code whose focused negative release tests pass; the consumer release remains blocked. WBS 21 extends packaging/admission assertions, never introduces the refusal for the first time.

**Acceptance criteria:**

- [ ] All baseline Task 12 Step 1 source/layout cases enforce module-relative selection, tracking, whole-catalog shadowing and trust; invalid or unsupported resolution fails by name rather than falling back. The admission API refuses before effects, including with network-skip flags. <!-- aitm-verified vc-list="vc:1" -->
- [ ] One exported recovery classification covers validate/source, top-level and command help, and version. Recovery does not build operational context or call GitHub; human explain is not an exception. WBS 21 consumes this classification unchanged. <!-- aitm-verified vc-list="vc:1" -->
- [ ] The manifest generator pins raw catalog identity and parser metadata; CI rejects restamping/disagreement and package assets/parser/docs are verified. Install a release assertion now that refuses an operational-loader consumer release without B2 certification; its negative-path suite passes by proving refusal. No bypass or premature B1-only release exists. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC26; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/integration/task-tracker/lib/guidance-source-trust.test.mjs scripts/tests/integration/task-tracker/lib/guidance-release-refusal.test.mjs scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`

### Task 21: Integrate exhaustive entrypoint admission and success annotation

#### Story Intent

- **Beneficiary:** Operational CLI user and issue maintainer
- **Capability:** Admit every supported command before effects and record one divergence notice after a successful mutation
- **Need:** Aliases, direct entrypoints, and startup imports could bypass source trust while repeated edits could duplicate audit comments
- **Value or failure prevented:** Invalid guidance cannot act through an unclassified route and a diverged source leaves a single visible audit trail

#### Files and delivery boundary

**Baseline-plan-section:** `### Task 12: Enforce guidance source trust and operational admission`. Former WBS identity: `12b`.

**User story:**

As an operational CLI user,
I want to have every route admitted before effects and divergence audited once,
So that aliases or startup imports cannot evade source trust.

**Estimate and units:** 22 hours; Complete route/import/effect inventory and dispatcher integration (10 h); serialized paginated annotation audit (6 h); full package, cold timing and aggregate admission certification (6 h). Owner: this child.

**Scope/files and boundary:** Own `scripts/tests/fixtures/1558/admission-surface.json`, command/alias/direct-entrypoint wiring, `guidance/annotation.mjs`, aggregate `guidance-admission.test.mjs`, downstream package tests and CI integration. Consume WBS 20’s source/trust API and recovery allowlist; no cache internals.

**Handoff and verification behavior:** Owns completeness of admission-surface.json and the unclassified-route CI failure. Estimate assumes registry-driven enumeration and parameterized fixtures for all 72 verb/alias and 21 standalone/router tokens plus supported direct routes, not 93 hand-written copies. At Refine, manually audit every distinct pre-import/effect boundary: if that exceeds the stated envelope, split before implementation rather than reduce coverage.

**Acceptance criteria:**

- [ ] The complete inventory records every canonical route/subcommand, alias, direct supported entrypoint, pre-admission import, first effect, gate call, exception classification and fixture. Each route/alias reaches admission before any effect, even with inventoried skip flags; a newly exposed unclassified route fails CI. <!-- aitm-verified vc-list="vc:1" -->
- [ ] All operational dispatcher/startup/installer paths consume WBS 20’s single recovery classification. No half-inventory or separate allowlist is introduced. Aggregate admission tests include source/trust/recovery and full-surface invalid-catalog regressions. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Successful lifecycle mutations perform at most one serialized paginated divergence annotation; edits/retries/concurrency cannot duplicate it. Failed/read-only operations never annotate and post-success audit failure is visible without rollback. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Production-only installation validates, init leaves overrides absent, required assets/docs/parser and exact packed delta pass, and cold per-command timings are recorded. B2-absent release refusal remains enforced; this child’s tests prove rejection until WBS 22 supplies certification. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC12; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/integration/task-tracker/lib/guidance-admission.test.mjs scripts/tests/unit/task-tracker/core/package-boundary.test.mjs scripts/tests/integration/task-tracker/lib/downstream-package-boundary.test.mjs`

### Task 22: Compile and cache valid and invalid guidance results

**Baseline-plan-section:** `### Task 13: Compile and cache valid and invalid guidance results`. All Task references in the copied body below retain baseline numbering.

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

- [ ] Valid/invalid catalogs compile deterministically into split artifacts; concurrent writers and corrupt/stale cache files recover safely. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Unchanged cross-process warm calls are silent and skip YAML parsing/semantic validation with worktree-aware tracking identity. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Runtime benchmarks and production-package cache certification satisfy the B1+B2 consumer-release requirement. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC13; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/unit/task-tracker/lib/guidance-cache.test.mjs scripts/tests/integration/task-tracker/lib/guidance-cache-process.test.mjs`

### Task 23: Expose routine explanations, receipts, and explicit diagnostics

**Baseline-plan-section:** `### Task 14: Expose routine explanations, receipts, and explicit diagnostics`. All Task references in the copied body below retain baseline numbering.

**User story:**

As an agent choosing the next action,
I want to have compact fresh operational guidance and explicit access to evidence when investigation needs it,
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

- [ ] Generic/targeted/alias CLI modes use fresh shared readiness with no effects; routine result preserves operations and omits evidence-only material throughout visible output. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Explicit diagnostics expose complete same-invocation evidence/messages without extra reads; later diagnostics are fresh, never implicit retrieval or fallback. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Receipt/source suppression and compaction invalidation follow the spec; explicit human help/recovery remain separate and invalid receipts never weaken execution. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Actual traffic replaces candidate serialization before content migration, with honest current versus modeled-static totals and enforced intermediate feasibility. <!-- aitm-verified vc-list="vc:1" -->

**Verification Commands:**

Plan verifier name: VC14; issue-local ID: `vc:1`.

Run: `node --test scripts/tests/integration/task-tracker/lib/guidance-explain.test.mjs scripts/tests/unit/task-tracker/lib/guidance-receipts.test.mjs`

### Task 24: Hydrate the guidance catalog and migrate human documentation

**Baseline-plan-section:** `### Task 15: Hydrate the guidance catalog and migrate human documentation`. All Task references in the copied body below retain baseline numbering.

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

- [ ] Every migrating lifecycle obligation maps to enforcement/protocol and complete validated catalog content, with human documentation preserved. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] Adoption, trust, recovery, attestation limitations, and scoped historical supersession are documented accurately. <!-- aitm-verified vc-list="vc:1 vc:2" -->

**Verification Commands:**

Plan verifier name: VC15; issue-local IDs: `vc:1`, `vc:2`.

Run: `node --test scripts/tests/unit/task-tracker/lib/guidance-rule-coverage.test.mjs`

Run: `node scripts/task-tracker/guidance.mjs validate --published --refresh --json`

### Task 25: Capture paired CLI transcripts, tokenizer calibration, and authority costs

**Baseline-plan-section:** `### Task 16: Capture paired CLI transcripts, tokenizer calibration, and authority costs`. All Task references in the copied body below retain baseline numbering.

**User story:**

As a release reviewer,
I want to have an equivalent complete before/after context comparison and separately measured authority cost,
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

- [ ] Reproducible paired reports count complete equivalent workflows for both adapters and preserve the original baseline; actual versus modeled evidence is explicit. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] Real-tokenizer calibration and complete diagnostic/heavy-case costs are recorded without truncation, hidden traffic, or universal-bound claims. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] Authority request/refresh/diagnostic invariants and separately identified timing budgets pass; final context/reduction acceptance stays gated on Task 17. <!-- aitm-verified vc-list="vc:1 vc:2" -->

**Verification Commands:**

Plan verifier name: VC16; issue-local IDs: `vc:1`, `vc:2`.

Run: `node --test scripts/tests/integration/task-tracker/lib/guidance-context.test.mjs`

Run: `node scripts/task-tracker/measure-guidance-context.mjs --all --json`

### Task 26: Slim both adapter protocols and certify the consumer release

**Baseline-plan-section:** `### Task 17: Slim both adapter protocols and certify the consumer release`. All Task references in the copied body below retain baseline numbering.

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

- [ ] Both adapter/router/pickup and full captured lifecycle fixtures meet fixed ceilings with >=20% unused headroom, including repeat/change/compaction and required diagnostics, and demonstrate lower complete total cost than the equivalent preserved Markdown baseline. <!-- aitm-verified vc-list="vc:1 vc:2 vc:3 vc:4 vc:5 vc:6" -->
- [ ] Minimal protocol preserves hard boundary protections, query schedule, receipt invalidation, and distinct workflow-preflight semantics. <!-- aitm-verified vc-list="vc:1 vc:2 vc:3 vc:4 vc:5 vc:6" -->
- [ ] Production package, invalid admission, full lifecycle parity, cache certification, and context/authority regression gates pass together before consumer release. <!-- aitm-verified vc-list="vc:1 vc:2 vc:3 vc:4 vc:5 vc:6" -->

**Verification Commands:**

Plan verifier name: VC17; issue-local IDs: `vc:1`, `vc:2`, `vc:3`, `vc:4`, `vc:5`, `vc:6`.

Run: `node --test scripts/tests/integration/task-tracker/lib/guidance-release.test.mjs scripts/tests/unit/task-tracker/core/measure-context.test.mjs scripts/tests/unit/task-tracker/core/session-boot.test.mjs scripts/tests/unit/task-tracker/core/worker-context-contract.test.mjs`

Run: `node scripts/task-tracker/measure-context.mjs --all --adapter codex`

Run: `node scripts/task-tracker/measure-context.mjs --all --adapter claude`

Run: `node scripts/task-tracker/measure-guidance-context.mjs --all --assert-budgets --json`

Run: `npm run test:unit`

Run: `npm run test:integration`

## NO-GO containment and execution entry

WBS 8 owns both the decision and its gate. The ordinary command records honest accounting; the distinct foundation command requires GO:

```bash
node scripts/maintenance/measure-guidance-candidate.mjs --all --json
node scripts/maintenance/measure-guidance-candidate.mjs --all --assert-feasible --json
```

On NO-GO, commit the truthful measurement and record both exit statuses and input digests. WBS 8 remains **OPEN in Develop**, with its GO/closure AC unchecked and VC27 failing. Do not run `test`, declare Review complete, approve, close, cancel or mark it not planned. No backward transition is needed: the failure is found during Develop verification. If discovered later in Test/Review, keep the issue open in its current state and withhold approval/closure. Only when candidate code changes are actually needed, use the supported `npx aitm demote <feasibility-issue> --rework "Revise the candidate to resolve #1558 NO-GO"` path; evidence-only reruns do not justify demotion. `shelve`/`park` are not valid from Develop and are not the selected mechanism. Accounting may be complete while this issue's release of downstream work remains incomplete.

Every runtime child has a native dependency on that still-open issue. `pull-next` therefore cannot interpret green VC18 or a completed measurement as a terminal blocker. Closure requires VC27 exit 0 for current, pinned, semantically complete evidence and the usual lifecycle approval/delivery gates. At baseline Task 2/WBS 9 entry, verify the recorded decision/input digests and rerun VC27; stale/missing/nonzero evidence stops runtime work even if an issue was closed incorrectly. Copy this entry condition into its scope and AC fragments as an additional requirement. Later Task 15 recertification against obligation-complete text and actual CLI traffic remains mandatory.

Hydration itself never measures feasibility or closes WBS 8. If NO-GO already exists when hydration resumes, retain every runtime child in Backlog, retain every WBS 8 dependency and stop dispatch. Do not remove a blocker to make a board view appear ready. A revised candidate within the spec can be measured in the same open feasibility issue; a changed contract requires manual review first.

## Hydration procedure after acceptance

1. Record the reviewed file digest and the commit containing these exact bytes in the review closure. That commit is the immutable `WBS_COMMIT` below. Do not use the mutable branch name, current HEAD by assumption, or a hash computed before formatting. Verify the baseline plan/spec digests above too.
2. Update #1558's obsolete Epic A framing with the accepted goal, fixed constraints, 26-child map and single GO gate. Its active `Source-plan` is this revision. Remove stale competing active `Implementation-plan`/`Plan` fields that would select the historical plan; retain prior provenance under explicitly historical names. This document does not authorize a state advance.
3. Read current parent priority. Require a supported `p0`, `p1` or `p2`; an unset/unsupported value requires resolution, not invented inheritance. Pass that exact value explicitly for every child. Expected assignee is **unset**. Omit Size and Estimate; all 26 remain Backlog. Rank equals the numeric WBS sequence, 1–26.
4. Prepare repository-local fragment files for each task. Copy its user story, bounded scope, ACs and exact verifiers; retained bodies preserve their original technical contract. Split bodies use their child ACs above, not whole-parent criteria. Each original baseline step remains assigned according to the scope and AC map. Add the global constraints and applicable handoffs/entry conditions to the scope fragment. Use the exact fragment shapes in “Verifier names and issue-local citation IDs”: heading-free scope and three-line story, existing AC checkbox lines with local citation markers, and bare verification commands one per line in displayed order. Do not add an outer wrapper. Read back both the offline-rendered body and the created body; every AC citation must resolve to its intended literal command through `resolveVcListStrict`.
5. Under each child's root `## Plan Metadata`, set `Source-plan` to this revision's repository-relative path, `Source-plan-commit` to the accepted full commit, and `Source-plan-section` to the exact unique numeric heading. Child title is exactly the text after that heading's colon, including baseline Task 17's **consumer release** wording. Add `Baseline-plan`, `Baseline-plan-commit`, and `Baseline-plan-section` as historical technical provenance. `Source-WBS`/`Source-WBS-commit`, if retained, equal Source-plan values and are documentary only; they do not disambiguate sections in the checker. As with the parent, remove competing active `Implementation-plan`/`Plan` fields from each child; preserve historical references under historical names. Assert that `linkedPlanReference(child.body)` actually selects this Source-plan, not an assumed key.
6. Create each child using the supported invocation below, mapping WBS rank to the returned issue number. First render with `--dry-run`; inspect the body and strictly resolve every AC citation against its root Verification Commands, including exact intended-command equality. A duplicate-child refusal requires inspecting the existing sibling's title/provenance/scope: reuse only a matching already-created child, or revise a real overlap through review. Do not reflexively add `--allow-duplicate-child`.
7. After mapping issue numbers, call `npx aitm block <child-issue> --by <comma-separated-prerequisite-issue-numbers>` for each nonempty prerequisite set. The verb writes native dependencies and reconciles their project/body projections; do not write a legacy Blocked By text field as a substitute. The WBS 8 dependency applies to every runtime child. No creation flag supplies these edges automatically.
8. Read all created issue bodies and live project/native dependency data back. Run the coverage command below. Keep its JSON and the rank-to-issue map as hydration evidence. Verify 26/26 and all stated fields/edges; an exception or unreadable field fails the check. No progress/dispatch follows a partial result. Hydration coverage does not establish delivery readiness: refinement, branch authority and normal lifecycle gates remain future requirements. In particular, do not manufacture current refinement evidence for Backlog children merely to satisfy `evaluateMaterializedWbsReadiness`.

For one child, variables are populated from its reviewed section and live parent priority; they are not guessed defaults:

```bash
npx aitm create-issue --shape sub-issue --parent 1558 \
  --title "$CHILD_TITLE" --rank "$WBS_RANK" --priority "$PARENT_PRIORITY" \
  --user-story-file "$FRAGMENTS/user-story.txt" \
  --scope-file "$FRAGMENTS/scope.txt" \
  --ac-file "$FRAGMENTS/acceptance-criteria.txt" \
  --story-origin-file "$FRAGMENTS/story-origin.txt" \
  --plan-metadata-file "$FRAGMENTS/plan-metadata.txt" \
  --verification-commands-file "$FRAGMENTS/verification-commands.txt" \
  --dry-run
```

After inspecting the dry run, repeat the same invocation without `--dry-run`. Omit `--assignee`, `--size`, and `--estimate`. Use sanctioned issue-body mutation for metadata, not raw GitHub body replacement. Neither direct `gh issue create` nor direct state jumps are authorized.

## Exact post-hydration coverage command

Run from the repository root with `WBS_COMMIT` exported as the accepted full commit. This is an executable read-only command using the shipped section extractor and reconciler, not a proposed new production checker or a waived check. It reads the plan from Git, fetches the parent's complete native child list, reads native dependencies, compares exact title/provenance, and verifies live Backlog/rank/priority/unset fields. It does not promote issues. Before hydration, an offline fixture can verify the same section/claim mechanics, but cannot claim live 26/26 hydration. Before the first create operation, run a read-only live API shape probe of `gh api --paginate --slurp "repos/kburson/ai-task-manager/issues/1558/sub_issues?per_page=100"`: require page arrays and validate every returned row’s number/body/title/assignees/state types. An empty parent response proves only pagination shape, not row shape; the first created-child readback must prove row shape before creating more children. Missing fields, unexpected pagination or API incompatibility stops hydration for reviewed correction; do not patch the check mid-run or manufacture defaults. The final 26/26 command is a read-only verification, never a dry-run creation operation.

```bash
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { loadConfig } from './scripts/task-tracker/config.mjs';
import { loadProjectFieldDefs } from './scripts/task-tracker/project-fields.mjs';
import { projectValuesForIssue } from './scripts/gh/lib/github-projects.mjs';
import { readNativeDependencies } from './scripts/task-tracker/lib/native-dependencies.mjs';
import { extractPlanTasks, linkedPlanReference, selectDecompositionPlanSection } from './scripts/task-tracker/lib/decomposition-policy.mjs';
import { reconcileWbsCoverage } from './scripts/task-tracker/lib/decomposition-wbs-coverage.mjs';
import { parseVerificationCommands } from './scripts/task-tracker/lib/verification-commands.mjs';
import { parseProofMarker } from './scripts/task-tracker/lib/proof-marker.mjs';
import { resolveVcListStrict } from './scripts/task-tracker/lib/vc-ref.mjs';
import { parseAcceptanceCriteria } from './scripts/task-tracker/lib/acceptance-criteria.mjs';
const planPath = 'docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md';
const commit = process.env.WBS_COMMIT;
assert.match(commit || '', /^[a-f0-9]{40}$/);
const readPlanAtCommit = ({ planCommit, planPath }) =>
  execFileSync('git', ['show', `${planCommit}:${planPath}`], { encoding: 'utf8' });
const planText = readPlanAtCommit({ planCommit: commit, planPath });
const tasks = extractPlanTasks(planText);
assert.equal(tasks.length, 26);
const cfg = loadConfig();
assert.equal(cfg.repo, 'kburson/ai-task-manager');
const pages = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp',
  `repos/${cfg.repo}/issues/1558/sub_issues?per_page=100`],
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
assert.ok(Array.isArray(pages) && pages.every(Array.isArray));
const children = pages.flat();
for (const child of children) {
  assert.ok(child && Number.isSafeInteger(child.number) && child.number > 0);
  assert.equal(typeof child.body, 'string');
  assert.equal(typeof child.title, 'string');
  assert.equal(typeof child.state, 'string');
  assert.ok(Array.isArray(child.assignees));
}
assert.equal(new Set(children.map((child) => child.number)).size, 26);
assert.equal(children.length, 26);
const coverage = await reconcileWbsCoverage({
  tasks, acceptedPlanPath: planPath, acceptedPlanText: planText,
  children, readPlanAtCommit,
});
assert.equal(coverage.ok, true, JSON.stringify(coverage.blockers));
assert.equal(coverage.expectedCount, 26);
assert.equal(coverage.coveredCount, 26);
const fieldDefs = [...loadProjectFieldDefs(), { key: 'hydrationStatus' }];
const fieldCfg = { ...cfg, fieldIds: { ...cfg.fieldIds, hydrationStatus: cfg.kanbanFieldId } };
const parentFields = await projectValuesForIssue({ cfg: fieldCfg, fieldDefs, issueNumber: 1558 });
const priority = String(parentFields.priority || '').toLowerCase();
assert.match(priority, /^p[012]$/);
const byRank = new Map(coverage.matched.map(({ task, child }) => [task.number, child.number]));
const expected = new Map();
const table = planText.split('## Hydration map\n')[1].split('## Child contracts\n')[0];
for (const line of table.split('\n')) {
  const cells = line.split('|').map((cell) => cell.trim());
  if (!/^\d+$/.test(cells[1] || '')) continue;
  expected.set(Number(cells[1]), cells[3] === 'None' ? [] : cells[3].split(',').map(Number));
}
assert.equal(expected.size, 26);
for (const { task, child: claim } of coverage.matched) {
  assert.equal(claim.sourcePlanCommit, commit);
  const child = children.find((candidate) => candidate.number === claim.number);
  assert.equal(child.state, 'open');
  const activePlan = linkedPlanReference(child.body);
  assert.equal(activePlan?.key, 'Source-plan');
  assert.equal(activePlan.path, planPath);
  const selection = selectDecompositionPlanSection({
    body: child.body, planText, activePlanKey: activePlan.key,
  });
  assert.equal(selection.ok && selection.applied, true);
  const commands = parseVerificationCommands(child.body);
  for (const [index, command] of task.commands.entries()) {
    assert.equal(commands.find((entry) => entry.id === index + 1)?.command, command);
  }
  const plannedACs = [...task.body.matchAll(/^- \[ \] (.+<!-- aitm-verified vc-list="[^"]+" -->)\s*$/gm)];
  const actualACs = parseAcceptanceCriteria(child.body);
  assert.ok(plannedACs.length > 0 && Array.isArray(actualACs));
  assert.equal(actualACs.length, plannedACs.length);
  for (const [index, ac] of actualACs.entries()) {
    const planned = parseProofMarker(plannedACs[index][1]);
    const actual = parseProofMarker(ac.label);
    assert.equal(actual?.['vc-list'], planned['vc-list']);
    const intended = planned['vc-list'].split(/\s+/).map((ref) => {
      const ordinal = Number(ref.slice(3));
      assert.ok(ordinal >= 1 && ordinal <= task.commands.length);
      return task.commands[ordinal - 1];
    });
    assert.deepEqual(resolveVcListStrict(actual['vc-list'], commands), intended);
  }
  const ranks = expected.get(task.number);
  assert.ok(ranks.every((rank) => rank < task.number));
  const native = await readNativeDependencies({ issueNumber: child.number, repo: cfg.repo });
  assert.deepEqual(native.blockedBy,
    ranks.map((rank) => byRank.get(rank)).sort((a, b) => a - b));
  const fields = await projectValuesForIssue({ cfg: fieldCfg, fieldDefs, issueNumber: child.number });
  assert.equal(String(fields.hydrationStatus || '').toLowerCase(), 'backlog');
  assert.equal(fields.rank, task.number);
  assert.equal(String(fields.priority || '').toLowerCase(), priority);
  assert.ok(fields.size == null || fields.size === '');
  assert.ok(fields.estimate == null || fields.estimate === '');
  assert.deepEqual(child.assignees, []);
}
console.log(JSON.stringify({ ok: true, expectedCount: 26, coveredCount: 26,
  fieldsAndEdges: 'verified', citations: 'verified', parent: 1558, planCommit: commit }));
NODE
```

Expected result: exit 0 and JSON with `ok: true`, `expectedCount: 26`, `coveredCount: 26`, and `fieldsAndEdges: "verified"`, `citations: "verified"`. A Backlog child needs no current refinement snapshot for this coverage-only check. Later Plan-exit delivery readiness still uses the unmodified repository gate with its refinement/branch requirements.

## Review and acceptance

Review this revision against round 2, the unchanged technical baseline and spec, focusing on issue-local citation rendering, active-plan selection and safe live readback. The numeric authority mapping, 26-child graph, Task 10 split and fixed budgets remain unchanged. Agreement must identify the exact formatted/linted file digest and its containing commit. No current claim of acceptance, feasibility, hydration, or runtime completion is made. The human relays reviewer/author filepaths; do not invoke the automated peer-review skill. Format and lint new review bytes directly before hashing or committing. The next author response must account for every outstanding finding.
