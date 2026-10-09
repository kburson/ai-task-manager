# Unified artifact references and durable review records implementation plan

> **For agentic workers:** Use `subagent-driven-development` or `executing-plans` only after this preparation handoff is accepted and implementation is separately started. Complete each child's verification and review before dependent work. Checkboxes below describe future work.

**Goal:** Give workspace operators concise artifact and review records while every agent and workflow gate resolves the same verified evidence, and provide an explicitly authorized historical repair service.

**Architecture:** A protected issue-body reference record feeds a common branded resolver and generated display. Git publication envelopes feed one owned summary per artifact kind and actual review method through a serialized production transaction. Historical repair uses a distinct maintenance-task capability, published originals and a durable effect journal.

**Tech stack:** Node.js ESM, Node test runner, raw Git objects, existing GitHub transports, AITM runtime storage and issue mutation locks, standalone ai-peer-review public API.

**Spec:** [Accepted specification](https://github.com/kburson/ai-task-manager/blob/108de3369e9ba93c2d314f747d44b3bcb4099aab/docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md), raw SHA-256 `d0ef19327c13690f2aa4345d4d635cf430973a728271738abbd7f5fbe982d1bc`. Local path: `docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md`.

**Status:** Initial draft for plan SPR and XPR. No plan acceptance, approval, implementation verification or historical apply is claimed.

## Scope

Implement the accepted #1939 specification: protected artifact identity, common operational resolution, grouped display, durable manual/sealed review publication, standalone producer integration and opt-in historical backheal. Keep review algorithms, timing calculation, human approval policy and linked-only deep-dive support outside scope. This preparation ends with reviewed-plan hydration, bounded children at Ready for Planning and the parent admitted to Develop. It does not begin implementation or historical mutation.

## Context and inspected evidence

AITM draft base is `10237f2711dcfefc3c94ce5fa3a9de43b15f8dd6`. The specification's final XPR manifest is committed under `docs/peer-reviews/1939/spec/xpr/`; its three rounds end in accepted reviewer consensus. The earlier manual Astra SAR accepted predecessor bytes, and retains its independent subject. The live parent has completed Refine with XL, P2, provisional 96 joint hours and existing board Rank 1. Native sub-issue enumeration on October 9 returned no children. Re-enumerate before hydration; this observation is not continuing authority.

Inspected seams include `metadata-section.mjs`, `plan-metadata.mjs`, `decomposition-policy.mjs`, `governed-plan-policy.mjs`, `user-story-quality.mjs`, `story-intent-source.mjs`, decomposition exit/coverage/readiness, both split-plan modules, `owned-comment.mjs`, `issue-body-mutate.mjs`, body invariants, runtime storage, capabilities, installed execution context and the canonical issue lock. Existing owned-comment discovery uses GraphQL node IDs; the new inventory must additionally capture correlated numeric REST comment IDs for stable URLs and exact-ID retirement.

Standalone repository `kburson/ai-peer-review` was inspected at trunk commit `a3f05b87f20cea346e745ff4099b74cd7819efa8`. Its public API exports `applyReviewRecord`, `planReviewRecord`, `renderReviewHistory`, `statusReview` and phase manifest functions; it does not yet export the new publication envelope. Its repository version and the locally installed review runtime are separate facts. Pin the actual compatible producer deliverable and tarball digest at integration; do not infer compatibility from a version string or install an unreviewed moving branch.

## Global constraints

- Authority marker schema is `aitm.artifact-references/v1`; publication envelope is `ai-peer-review.review-publication/v1`; migration authorization is `aitm.artifact-migration-authorization/v1`.
- Digests use `sha256:` plus 64 lowercase hexadecimal digits over raw bytes. Immutable references use configured repository, full commit, tracked relative path and blob digest; equal bytes at different identities remain distinct.
- One live authority marker in root Plan Metadata; maximum complete marker 16 KiB UTF-8, 32 artifact entries and 64 lightweight review references. Reject duplicate JSON keys and unsupported authority fields before ordinary JSON decoding loses them.
- Artifact insertion/update, enrollment and backheal final bodies are limited to 57,344 UTF-8 bytes and 57,344 Unicode scalar characters. Include the canonical next body-version marker. Ordinary unrelated lifecycle writes retain current size behavior.
- Publication manifest maximum is 256 KiB UTF-8, 128 instances and 64 document references; identifiers are at most 128 characters with the accepted grammar, paths at most 1,024 UTF-8 bytes.
- Complete summaries fit 32,768 bytes and scalar characters; reserve 1,024 bytes for ownership framing. Deterministic full, superseded-instance and history-range tiers preserve every original round in Git; overflow never creates a second summary.
- Groups use standalone bold labels and flat bold-label bullets. New projection fields use `Display-`; retain legacy operational fields until complete consumer parity and producer integration permit removal.
- Declared invalid/lost/conflicting authority never falls back. Legacy unpinned behavior remains explicitly unpinned where existing policy permits it. Preserve A/B/C child conflicts and the specified stricter Source-plan/Plan legacy precedence diagnostic.
- No fabricated review method, acceptance, participant/model/effort, timing, original commit, disposition or approval. Finalized protocol verifier evidence and recorded manual consensus remain distinct assurance classes.
- Reuse configured physical runtime authority and canonical locks. `evidence-v2/journal-authority.mjs` remains rehearsal-only. No caller UUID, private lock, lease expiry or Full-Auto setting confers production publication/migration authority.
- Historical targets stay closed/state-equivalent and never accrue maintenance timing. Apply/retire/rollback each need exact authenticated human authorization; this plan grants none.
- Preserve substantive deep-dive body prose, all protected markers, timing/commit/transition comments and AC/VC/DoD evidence.

## Review Focus

1. A legacy child inherited from plan A selects a task while active B and accepted C differ: display preserves C and WBS preserves A, but executable intent/approval refuses. Task 2 and Task 3 own this fixture.
2. A body already above the enrollment ceiling still needs a timing or approval write: Task 1 refuses enrollment without imposing the new ceiling on unrelated writers.
3. An interrupted review or uncommitted original has no response/disposition/commit: Task 5 and Task 6 preserve actual absence and later archival chronology.
4. A delayed writer, lost create response or live long-held lock must not overwrite newer managed publication: Task 7 and Task 8 reconcile pending effects and refuse unfenced transfer.
5. A historical own-effect changes the baseline before interruption, while a human changes another field: Task 11 advances only verified own baselines and stops on unrelated drift, with independently authorized rollback.

## Acceptance Criteria

- [ ] Every inventoried consumer resolves identical verified identity for the same semantic role across legacy, mixed and v1-only bodies; role differences and conflicts remain explicit.
- [ ] Generated metadata exposes three groups and immutable review-first links, independent of display order, without hiding operational fields before rollout eligibility.
- [ ] Every actual manual/sealed review outcome, round, disposition and revision remains reachable; the same stable summary updates under guarded production authority.
- [ ] A real compatible standalone producer exports and verifies the envelope; legacy-only and unsupported negotiations preserve existing evidence and do not enable replacement publication.
- [ ] Offline historical repair proves preview, published backups, exact authorization, guarded effects, retirement, resume, rollback limits and verified second-run no-op while preserving lifecycle/timing.
- [ ] #1901-derived fixtures show exactly four summaries and all original rounds; adapter/template regressions preserve substantive deep dive.

## Plan Metadata

- **Priority:** P2
- **Size:** XL
- **Estimate:** 127 joint hours proposed: 124 bounded-child hours plus 3 parent integration/orchestration hours; supersedes provisional 96 only after plan review and sanctioned estimate update.
- **Labels:** enhancement
- **Governing-spec:** docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md
- **Estimate basis:** Scope-based engineering estimate, not measured performance or elapsed forecast. The unconstrained dependency longest path is 100 child hours; at one-worker capacity all 124 child hours plus 3 parent hours are sequential effort. Waves describe dependencies, not guaranteed parallel speedup. Review/CI variability remains for the forecast gate.

## Story Intent

- **Beneficiary:** workspace operator reviewing planned and historical work
- **Capability:** navigate concise artifact and review records while agents resolve the same authoritative evidence
- **Need:** duplicated metadata and per-round issue comments obscure reviewed versions and clutter story histories
- **Value or failure prevented:** assess readiness and review changes without losing durable evidence or breaking automated workflow consumers

## File ownership and interfaces

All unqualified paths are in AITM. Existing lib paths below are relative to `scripts/task-tracker/lib/`; test paths are explicit per task. New modules are proposals, not claims they exist. Keep test fixtures/helper ownership with Task 12; earlier tasks create their local minimal fixtures under their own test directory until the final shared reference capture.

| Task | Hours | Depends on     | Wave | Exclusive responsibility                                                    |
| ---- | ----: | -------------- | ---: | --------------------------------------------------------------------------- |
| 1    |    10 | none           |    1 | marker codec, protection, artifact writer and consumer inventory            |
| 2    |    12 | 1              |    2 | immutable resolver and legacy observation adapter                           |
| 3    |    12 | 2              |    3 | all operational reader and split-plan migrations                            |
| 4    |     8 | 3, 7           |    4 | metadata projection and validated enrollment writer                         |
| 5    |    12 | 1              |    2 | standalone producer deliverable and AITM compatibility bridge               |
| 6    |    10 | 2, 5           |    3 | manual-record validation and summary generation                             |
| 7    |    12 | 1              |    2 | production authority, lock safety and durable effect store                  |
| 8    |    10 | 4, 6, 7        |    5 | ordered live review publication and discovery transaction                   |
| 9    |    10 | 7, 8           |    6 | historical inventory, proposal and published exact backup                   |
| 10   |    10 | 9              |    7 | authenticated migration admission and exact-ID retirement                   |
| 11   |    12 | 10             |    8 | backheal apply/resume/rollback saga and CLI                                 |
| 12   |     6 | 3, 4, 5, 8, 11 |    9 | reference fixtures, rollout policy, canonical docs/adapters and integration |

Shared legacy files have sequential owners: Task 1 protects `body-invariants.mjs` and `gh-edit-guard.mjs`; Task 10 extends their protected authorization/retirement checks. Task 3 migrates consumers behind a disabled production activation switch and creates the runtime assembly shell; Task 8 completes that shell with real evidence services and proves the operational gate path before activation. Task 4 uses migrated APIs and additionally depends on Task 7 for durable enrollment. Task 7 owns generic lock hardening; Task 8 changes `owned-comment.mjs` and `issue-body-mutate.mjs` only after that seam is stable; Task 10 later adds the private migration admission path. Task 12 owns final canonical template/guidance changes. No concurrent branch edits to these shared files.

Observation API proposal: `resolveArtifactReference({body, repository, issueNumber, role, projectDir, requireWorkingCopy, evidenceServices, deps})` returns frozen `{ok, observation, diagnostics}`; successful observations live in a module-private WeakMap. `assertArtifactObservation(observation, context)` rejects reserialized/cross-body/cross-role values. `validateArtifactRecord(rawMarker)` returns a validated record or typed refusal. Task 2 defines injected `evidenceServices.resolveAcceptance({subject, reviewReferences})` and `evidenceServices.readEnrollment({repository, issueNumber})`; the former must return Task 6 branded verification, the latter Task 7 durable enrollment evidence. Their absence refuses acceptance/lost-authority-dependent resolution. Identity-only draft resolution needs no acceptance service. No fixture service is eligible for production activation. `renderArtifactMetadata({observations, reviewRecords, legacyFields, policy})` renders display only; it never mints authority.

Publication API proposal: standalone `buildReviewPublication({authority, publicationContext})` and `verifyReviewPublication({envelope, authority})` produce an envelope and exact-subject verification result. AITM `validateReviewPublication({envelope, verifier, subject, deps})` returns a branded validated record. `renderReviewSummary(record, {budget})` returns `{body, tier, reachableDocuments}`. `publishReviewRecord({ownerContext, record, expectedRemote, deps})` requires authenticated admission, verified remote documents and an effect reservation.

Historical API proposal: `inventoryArtifactBackheal({ownerContext, targets, deps})`, `previewArtifactBackheal(inventory, transformation)`, `publishArtifactBackup(proposal, deps)`, `authorizeArtifactMigration({ownerContext, humanEvidence, proposal, backup, effects, expiresAt})`, and `runArtifactBackheal({ownerContext, operationId, mode, deps})`. Private capabilities are non-exportable and scoped to one freshly admitted effect; serialized authorization JSON alone cannot call transaction cores.

## Implementation Tasks

### Task 1: Protect the versioned artifact contract and inventory its readers

#### Story Intent

- **Beneficiary:** workspace operator relying on issue artifact references
- **Capability:** retain one bounded machine record through ordinary issue edits
- **Need:** metadata normalizers can discard comments and contradictory records can claim different authority
- **Value or failure prevented:** prevent silent loss or corruption of the evidence agents use to assess work

#### Delivery

**Estimate:** 10 hours. **Dependencies:** none. **Files:** Create `scripts/task-tracker/lib/artifact-reference-contract.mjs`, `scripts/task-tracker/lib/artifact-reference-write.mjs`, `docs/design/1939-artifact-consumer-inventory.md`; modify `scripts/task-tracker/lib/body-invariants.mjs` and `scripts/task-tracker/lib/gh-edit-guard.mjs`. Create `scripts/tests/unit/task-tracker/lib/artifact-reference-contract.test.mjs`; extend existing body-invariants and gh-edit-guard-body suites.

**Steps:**

- [ ] Write fixtures for duplicate JSON keys before decode; multiple live markers versus fenced/quoted examples; unsupported keys/schema; wrong roles/status; traversal, terminators and entry/byte limits. Assert no effect on each refusal.
- [ ] Implement the bounded structural codec with escaped less-than/greater-than/ampersand; validate IDs, field grammar and immutable-reference shapes. Retain unknown values only in the documented non-authoritative extensions object.
- [ ] Register marker protection and exact genesis/next/no-op advancement in both canonical invariant paths. Test loss, regression, same-revision divergence, invalid rebinding and preservation of unrelated lifecycle markers.
- [ ] Implement the validated artifact-specific writer using the canonical fresh-base body transaction; measure the complete proposed next-version body before any reservation. Test multibyte/scalar limits and an oversized legacy body's unrelated timing write.
- [ ] Record every operational reader/writer and its semantic role using repository searches plus existing gate/template inventory. Include enrollment-loss detection ownership and initial-default policy; commit with the actual child issue ID.

**Interfaces:** Produces `validateArtifactRecord`, structural parse/serialize helpers, `writeArtifactReferences` with exact-base advancement and scoped budgets. The inventory is the checklist for Task 3 and Task 12; do not claim a repository-wide migration from a partial search.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/artifact-reference-contract.test.mjs scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs scripts/tests/unit/task-tracker/lib/gh-edit-guard-body.test.mjs
```

### Task 2: Resolve immutable artifact roles and explicit legacy conflicts

#### Story Intent

- **Beneficiary:** workspace operator comparing planned and accepted artifacts
- **Capability:** resolve the exact artifact revision for each operational role
- **Need:** independent legacy precedence and display links can select stale or unrelated bytes
- **Value or failure prevented:** avoid executing or approving work against the wrong specification or plan

#### Delivery

**Estimate:** 12 hours. **Dependencies:** Task 1. **Files:** Create `scripts/task-tracker/lib/artifact-reference-resolver.mjs` and `scripts/task-tracker/lib/artifact-reference-legacy.mjs`; extend `scripts/tests/unit/task-tracker/lib/artifact-reference-contract.test.mjs`; create `scripts/tests/unit/task-tracker/lib/artifact-reference-resolver.test.mjs`.

- [ ] Write temporary real-Git fixtures for root/epic/child roles, accepted predecessor C, inherited A/Task 2 and active B. Assert the exact requested observation identity and role, with no accepted-status upgrade from an equal digest.
- [ ] Implement argument-array object reads, full/prefix commit resolution, blob mode and component-symlink checks, raw hashing and configured-repository immutable URL validation. Missing/ambiguous/non-commit pins and inline/separate mismatches must refuse.
- [ ] Adapt recognized legacy fields losslessly; distinguish absent, legacy-unpinned, invalid and lost enrolled authority. Source-plan A plus Plan B reports former Source A selection and `legacy-precedence-conflict`; identical aliases preserve unambiguous behavior.
- [ ] Brand successful observations to exact body/repository/role/selection/content; reject copied objects and wrong-context reuse. Working-copy drift is a separate explicit diagnostic; immutable historical reads need no checkout.
- [ ] Define and unit-test the injected evidence-service boundary without implementing production acceptance or enrollment providers in this child. Exact-subject acceptance and enrolled-authority checks refuse when their required service is absent; pure identity/legacy resolution is independently complete. Task 8 owns production wiring and authentic approval/Story Intent integration using Tasks 5/6/7. Keep existing production legacy consumers unchanged until that activation gate passes.

**Interfaces:** Produces the observation API defined above and a typed legacy diagnostic record including original inline abbreviation, full expansion and observed object inventory. Defines the explicit evidence-service injection contract above. This child finishes as a non-enabled identity/legacy component with refusal tests, not a claim that production accepted-artifact resolution works. Task 8 supplies and verifies the real providers; fixture seams never grant live authority.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/artifact-reference-contract.test.mjs scripts/tests/unit/task-tracker/lib/artifact-reference-resolver.test.mjs
```

### Task 3: Migrate operational consumers and bounded split-plan provenance

#### Story Intent

- **Beneficiary:** workspace operator preparing executable backlog stories
- **Capability:** make plan approval, child intent and decomposition use the same verified sources
- **Need:** current readers independently select paths and inherited task metadata
- **Value or failure prevented:** prevent inconsistent child scope, false WBS coverage and approval of stale work

#### Delivery

**Estimate:** 12 hours. **Dependencies:** Task 2. **Files:** Create `scripts/task-tracker/lib/artifact-reference-runtime.mjs` as the disabled production assembly shell; modify `scripts/task-tracker/lib/decomposition-policy.mjs`, `governed-plan-policy.mjs`, `user-story-quality.mjs`, `story-intent-source.mjs`, `decomposition-wbs-coverage.mjs`, `decomposition-plan-exit-guard.mjs`, `decomposition-delivery-readiness.mjs`, `split-plan.mjs`, `scripts/task-tracker/verbs/split-plan.mjs` and `scripts/task-tracker/backfill-plan-metadata.mjs`. Update the inventory and their existing named unit suites.

- [ ] Add a role-consumer matrix test using one raw pinned subject across legacy/mixed/v1 bodies. Assert consumer outputs reference the same branded observation rather than applying separate precedence.
- [ ] Route active plan policy/approval and Story Intent to active role; preserve exact source task for WBS and inherited governing spec for child creation. Declared invalid spec blocks generic creation fallback.
- [ ] Require unique task heading/number and pinned plan content in split-plan; reject duplicate, renamed and missing tasks before any child creation. Preserve parent decomposition plan identity distinct from child active plan.
- [ ] Add A/B/C root/epic/child fixtures and refusal diagnostics. Do not silently clear inherited selectors or create own-plan rebind semantics. Preserve legacy unpinned approval restrictions.
- [ ] Prepare every inventoried backfill/reader to consume the observation through `artifact-reference-runtime.mjs`, with explicit `readSupportEnabled: false` by default and the existing legacy behavior retained while disabled. A v1 marker never bypasses missing services. Test Display- fields in either order cannot affect legacy or v1 selection. Mark consumer integration pending until Task 8 proves production approval/Story Intent with real evidence and enrollment providers.

**Interfaces:** Existing public wrappers retain compatibility for unrelated callers but delegate authority selection to the common resolver. New consumers must accept only branded observations; no raw reference strings substitute for them. Task 4 depends on complete component-level reader migration plus Task 7; production activation remains Task 8's bounded deliverable and Task 12's rollout decision.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs scripts/tests/unit/task-tracker/lib/story-intent-source.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-delivery-readiness.test.mjs scripts/tests/unit/task-tracker/lib/user-story-quality.test.mjs scripts/tests/unit/task-tracker/verbs/split-plan.test.mjs scripts/tests/unit/task-tracker/core/backfill-plan-metadata.test.mjs scripts/tests/unit/task-tracker/core/coverage-backfill-plan-metadata.test.mjs
```

### Task 4: Render grouped metadata and enroll only compatible issues

#### Story Intent

- **Beneficiary:** workspace operator reading planning readiness
- **Capability:** see meaningful grouped review and artifact links without duplicated operational prose
- **Need:** readable links currently coexist uneasily with parser-required bare paths
- **Value or failure prevented:** reduce visual clutter without breaking machine discovery or hiding revision differences

#### Delivery

**Estimate:** 8 hours. **Dependencies:** Task 3 and Task 7. **Files:** Create `scripts/task-tracker/lib/artifact-record-renderer.mjs` and `scripts/task-tracker/lib/artifact-reference-enrollment.mjs`; modify `scripts/task-tracker/lib/plan-metadata.mjs`, `metadata-section.mjs` and `plan-exit-plan-metadata-guard.mjs`. Create `scripts/tests/unit/task-tracker/lib/artifact-record-renderer.test.mjs`; extend plan-metadata-lib, plan-metadata-exit-guard and agent-review body-sections suites.

- [ ] Write exact flat-grammar fixtures with the three bold groups, actual review-first fields and immutable encoded links. Assert semantic identity determines sharing, while distinct role revisions remain labeled.
- [ ] Implement reserved Display- fields, deliberate draft/unresolved status and projection-drift diagnostics. Decorative/reordered links never change authority; unknown prose survives transformation.
- [ ] Build enrollment preview against migrated observations and lossless originals. Invalid legacy precedence, absent historical pins or any incompatible consumer prevents enrollment and operational-field removal.
- [ ] Use Task 1's validated artifact writer and body budget; register durable enrollment in Task 7 before treating later marker absence as authority loss. Failure after reservation remains pending for reconciliation.
- [ ] Test epic Display-Decomposition-plan plus bare Decomposition-plan in both orders, and a hand-edited Display- link. Gate acceptance must remain tied to real planning output, not fabricated projection fields.

**Interfaces:** Produces `renderArtifactMetadata` and `prepareArtifactEnrollment({body, observations, compatibility})`; no renderer is an authority writer. Rendering and enrollment-preview APIs can be verified without enabling production reads. Task 8 assembles authentic providers and publishes the resulting body only with reserved production effects; no v1 enrollment executes before that assembly gate passes.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/artifact-record-renderer.test.mjs scripts/tests/unit/task-tracker/lib/plan-metadata-lib.test.mjs scripts/tests/unit/task-tracker/lib/plan-metadata-exit-guard.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/body-sections.test.mjs
```

### Task 5: Deliver the standalone producer contract and verify its AITM bridge

#### Story Intent

- **Beneficiary:** workspace operator relying on peer-review acceptance
- **Capability:** consume the real producer's exact-subject review envelope with declared compatibility
- **Need:** a local task skill cannot change standalone producer output or prove finalized protocol authority
- **Value or failure prevented:** prevent unsupported review records from appearing accepted or enabling replacement publication

#### Delivery

**Estimate:** 12 hours, including the coordinated standalone deliverable. **Dependencies:** Task 1. **AITM files:** Create `scripts/task-tracker/lib/peer-review-publication-adapter.mjs` and `scripts/tests/integration/task-tracker/lib/peer-review-producer-compatibility.test.mjs`.

**Standalone deliverable:** During hydration enumerate existing related issues in `kburson/ai-peer-review`, then create or explicitly link one bounded repository-owned implementation issue using that repository's sanctioned workflow. This AITM child coordinates/accepts that artifact; it does not authorize editing a foreign checkout while bound to AITM. Record the foreign issue, reviewed PR/commit, package artifact and digest as native dependency evidence before this child's Develop admission. The foreign worker binds its own issue and uses its own elapsed clock; count the estimated work once in the parent rollup.

**Standalone owned paths:** Add `src/publication/envelope.mjs`, `src/publication/verify.mjs`, `test/unit/review-publication.test.mjs` and `test/integration/review-publication.test.mjs`; modify `src/public-api.mjs`, `src/collateral/review-record-core.mjs`, `src/manifest/render.mjs` and protocol service only at existing finalized-authority boundaries. Verify these seams against the pinned trunk and refresh changed baselines before implementation. Preserve original event/manifest records; this envelope supplements their verifier interface.

- [ ] Implement/export `buildReviewPublication` and `verifyReviewPublication` from the actual standalone package. Bind issue/kind/method, protocol instances, raw artifact revisions, finalized acceptance, complete dispositions and evidence sources to event authority.
- [ ] Add exact raw JSON previousRecord chain fixtures including different whitespace/newline bytes. Enforce closed shapes, caps, variant absence and raw prior-manifest digest, with no self-hash or semantic reserialization.
- [ ] Cover nonterminal/failure/cancellation, supersession and uncommitted reviewedInput followed by later preservation. Reject retroactive source commits and unfinalized manifest assertions.
- [ ] Implement AITM negotiation `compatible-v1`, `legacy-only`, `unsupported`; unsupported/opaque schema refuses new publication, legacy-only keeps prior emitters and operational fields.
- [ ] Run the standalone unit/integration/package/smoke/lint/format checks in its own governed task; use its verified packed tarball in the AITM integration test to call the real exported producer/verifier. Do not replace the integration with a hand-authored envelope fixture.

**Interfaces:** The AITM bridge returns exact schema/verifier/capability versions and branded verifier result bound to subject/document digests. Compatibility alone proves no particular review acceptance. Pin the delivered package before rollout; no auto-publish or automatic registry release is part of preparation.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/peer-review-producer-compatibility.test.mjs
```

### Task 6: Validate manual evidence and render complete bounded review summaries

#### Story Intent

- **Beneficiary:** workspace operator assessing review outcomes
- **Capability:** read one concise history that preserves actual rounds, subjects and uncertainty
- **Need:** per-round comments obscure lineage and missing evidence can be mistaken for acceptance
- **Value or failure prevented:** assess changes without losing findings or attributing acceptance to later bytes

#### Delivery

**Estimate:** 10 hours. **Dependencies:** Task 2 and Task 5. **Files:** Create `scripts/task-tracker/lib/review-publication-contract.mjs`, `manual-review-record.mjs`, `review-summary-renderer.mjs` and `scripts/tests/unit/task-tracker/lib/review-record-publication.test.mjs`.

- [ ] Validate the same closed envelope for manual-consensus and sealed-protocol, retaining actual assurance, requested/observed selections and unavailable observations. Human-only acceptance has method null/no instances and never renders a review summary.
- [ ] Test no response before provider failure, findings before interruption, explicit versus missing no-change dispositions and this spec SAR's uncommitted r0 later archived. Assert attempted input remains present and no document/decision is invented.
- [ ] Validate predecessor SPR versus later XPR subjects and complete required-finding closure; manual consent cannot satisfy a stronger sealed gate. Unrelated active instances require explicit governed selection.
- [ ] Render File Under Review first, actual outcome/identity/effort, qualified joint elapsed and ordered immutable round/disposition/manifest links using stable kind/method keys.
- [ ] Implement deterministic three-tier compaction and byte/scalar accounting including owned framing. Assert every input round remains reachable at every tier and minimal overflow causes zero transport calls.

**Interfaces:** Produces branded `validateReviewPublication`, `adaptManualReviewRecord` and `renderReviewSummary`; verification records identify authentic evidence sources rather than self-attesting generated prose. Task 8 consumes only branded records and verified remote documents.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/review-record-publication.test.mjs
```

### Task 7: Establish production publication authority and durable effect fencing

#### Story Intent

- **Beneficiary:** workspace operator sharing issue publication across worktrees
- **Capability:** serialize managed writers and reconcile uncertain effects before another write
- **Need:** private locks or stale requests can overwrite newer review records
- **Value or failure prevented:** preserve ordered review history during concurrent work and process failure

#### Delivery

**Estimate:** 12 hours. **Dependencies:** Task 1. **Files:** Create `scripts/task-tracker/lib/artifact-publication-authority.mjs`, `artifact-publication-store.mjs`, `scripts/tests/integration/task-tracker/lib/artifact-publication-authority.test.mjs`; modify runtime-storage/path/capability assembly only for declared new storage paths, and `scripts/task-tracker/issue-mutator-lock.mjs` for held-process safety.

- [ ] Prove existing installed context/runtime identity admission from genuine native authority, configured shared root and enrolled store. A caller-supplied host UUID, unavailable root or scratch-only store must refuse.
- [ ] Add durable enrollment, forward cursor and pending-effect records with atomic storage under the resolved physical authority. Use canonical issue mutation locking, never a new independent lock namespace.
- [ ] Write cross-worktree production-facade tests and correct lock reclamation so an authenticated live holder cannot be reclaimed solely because its mtime exceeds the backstop. Foreign-host ambiguity stays fenced pending explicit authority reconciliation.
- [ ] Reserve effect identity, expected before digest, proposed digest, revision and previous-record chain before transport; reject stale/divergent reuse. A verified identical effect is a live-read no-op.
- [ ] Refuse new effect/host transfer until unresolved actions are reconciled and the old publisher is demonstrably terminated/fenced. Lease expiry alone is insufficient. Never import rehearsal journal-authority into production.

**Interfaces:** Produces `admitArtifactPublisher(ownerContext)`, `withArtifactPublicationAuthority(admission, effect, callback)` and durable `reserve/read/reconcile/verify` store operations. Authority objects and reserved effects are branded; Task 8/10 cannot synthesize them from JSON.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/artifact-publication-authority.test.mjs scripts/tests/integration/task-tracker/lib/runtime-storage.test.mjs
```

### Task 8: Publish one ordered summary and immutable body discovery record

#### Story Intent

- **Beneficiary:** workspace operator following an active review
- **Capability:** see the same owned summary updated through real review revisions
- **Need:** retries, stale requests and independent emitters can create duplicate or regressed comments
- **Value or failure prevented:** retain a dependable review entry point without losing prior evidence or human edits

#### Delivery

**Estimate:** 10 hours. **Dependencies:** Task 4, Task 6 and Task 7. **Files:** Create `scripts/task-tracker/lib/review-record-publication.mjs`; complete `artifact-reference-runtime.mjs` created by Task 3; modify `owned-comment.mjs`, `issue-body-mutate.mjs`, `scripts/task-tracker/verbs/comment.mjs` only through guarded optional publication preconditions. Create `scripts/tests/integration/task-tracker/lib/review-record-publication.test.mjs` and `scripts/tests/integration/task-tracker/lib/artifact-reference-production.test.mjs`; extend existing comment unit tests.

- [ ] Complete the canonical production factory `createArtifactReferenceRuntime({ownerContext, config, producer, transport})` in `artifact-reference-runtime.mjs`: inject Task 6 branded exact-subject acceptance validation using Task 5's actual producer verifier, and Task 7 durable enrollment reads. Refuse absent, fixture-only, foreign or unsupported providers and leave read support disabled on failed assembly. Test canonical Plan approval and Story Intent routes with a real pinned producer package, finalized protocol fixture authority and real configured temporary shared runtime store; this is a production-factory test, not an injected fake acceptance result.
- [ ] Verify every referenced record/blob against immutable origin before rendering; compare exact raw bytes from a disposable Git remote in tests. Successful push output alone is not durable evidence.
- [ ] Extend canonical owned-comment transaction to bind expected numeric/node identity or explicit absence, expected prior body digest, proposed digest, publication revision and previousRecordDigest. Correlate both ID forms and exhaustively discover before/after transport.
- [ ] Under Task 7 admission/lock, reserve the effect, create/update/no-op the one key, then exact-read-back and update body discovery through Task 1's validated writer. Journal verified partial completion across both objects.
- [ ] Cover stale round 2 after round 3, two managed publishers, ambiguous create/restart, duplicates, external concurrent creation and human edit before/after write. Detect available drift, preserve observed originals/proposals and never claim multi-object/global CAS.
- [ ] Cap guarded attempts at three per effect; reconcile uncertainty before another call. Activate replacement emitters only when the actual compatible producer and consumer handshake both pass. Preserve legacy emitters otherwise.

**Interfaces:** Produces `publishReviewRecord`. Ordinary comment/body callers keep current active-target/timer checks; publication preconditions tighten that boundary. Task 10 introduces a private alternative admission for historical metadata effects, never a public bypass flag. This child alone completes production acceptance/enrollment assembly; Tasks 2/3/4 are staged non-enabled components until its assembly regression passes. Task 12 authorizes default read/writer rollout only from the resulting eligibility report.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/verbs/comment.test.mjs scripts/tests/unit/task-tracker/lib/review-record-publication.test.mjs scripts/tests/integration/task-tracker/lib/review-record-publication.test.mjs scripts/tests/integration/task-tracker/lib/artifact-reference-production.test.mjs
```

### Task 9: Preview explicit historical scope and publish exact originals

#### Story Intent

- **Beneficiary:** workspace operator considering historical record repair
- **Capability:** inspect exact proposed changes and recoverable originals before authorizing effects
- **Need:** incomplete history or ambiguous ownership makes bulk cleanup unsafe
- **Value or failure prevented:** prevent deletion or rewriting of unverified historical evidence

#### Delivery

**Estimate:** 10 hours. **Dependencies:** Task 7 and Task 8. **Files:** Create `scripts/task-tracker/lib/artifact-backheal-inventory.mjs`, `artifact-backheal-preview.mjs`, `artifact-backheal-backup.mjs`, `scripts/tests/unit/task-tracker/lib/artifact-backheal-preview.test.mjs`.

- [ ] Inventory only supplied issue IDs with complete pagination, exact body/version/digest, comment node/numeric IDs, timestamps/ownership/state and artifact sources. Keep unknown human content and missing/ambiguous authority as diagnostics.
- [ ] Produce deterministic metadata/summary diffs and explicit effect/retirement IDs, stable operation ID and proposal digest. No discovery query implicitly expands apply scope.
- [ ] Archive exact original bytes and source acquisition provenance for every affected body/comment and linked original being rewritten. Do not mistake derived reference fixtures for exact historical snapshots.
- [ ] Commit and verify backup manifest/objects at immutable origin before marking backup-published; local scratch or push success does not permit mutation. Zero writes on source, pagination or hash failure.
- [ ] Store preview/backup state durably using Task 7 storage. Renewal of drifted scope creates a new proposal rather than silently rebasing an authorized one.

**Interfaces:** Produces immutable inventory/proposal/backup identities for Task 10 admission and Task 11 saga. Proposal lists exact effects and protected originals; preview itself confers no capability.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/artifact-backheal-preview.test.mjs
```

### Task 10: Admit authenticated historical effects and preserved exact-ID retirement

#### Story Intent

- **Beneficiary:** workspace operator authorizing limited historical repair
- **Capability:** permit only named metadata effects and preserved comment retirements
- **Need:** ordinary writers require an active target while historical stories must retain their state and timing
- **Value or failure prevented:** prevent maintenance authorization from becoming a general lifecycle or deletion bypass

#### Delivery

**Estimate:** 10 hours. **Dependencies:** Task 9. **Files:** Create `scripts/task-tracker/lib/artifact-migration-admission.mjs`, `artifact-comment-retirement.mjs`, `scripts/tests/integration/task-tracker/lib/artifact-migration-admission.test.mjs`; modify canonical body/comment transaction admission internally and body/guard protection for the new authorization record.

- [ ] Validate a fresh supported-host human transcript or authenticated human GitHub record against the printed exact owner task, target IDs, proposal, published backup, allowed effects/retirement IDs and deadline. Unsupported hosts, generic consent and Full-Auto cannot mint authorization.
- [ ] Protect the durable authorization on the owning active maintenance task with authenticated issuer/receipt, status, expiry and effect consumption. Serialized records are evidence, not injectable capabilities.
- [ ] Privately admit one effect against current owner session/worktree, authority, exact baseline and fresh authorization. Allow only metadata body changes, named summaries and separately listed retirement IDs.
- [ ] Retire exact numeric/node-correlated comments only after verified preservation; refuse timing, transition, commit, review-approval, unknown content and incomplete originals. Record delete ambiguity and read-back receipts.
- [ ] Test two closed targets under a different active maintenance task, ordinary wrong-target refusal, expiry/revocation/wrong scope/backup/proposal/retirement IDs and refusal to bind/tick/advance historical targets.

**Interfaces:** Authorization validator remains private to service admission; canonical transaction cores accept branded migration effects only from this service. No public `--skip-session`, `allowInactive` or raw capability injection is introduced. Task 11 consumes verified effect receipts.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/artifact-migration-admission.test.mjs scripts/tests/unit/task-tracker/lib/gh-edit-guard-protected-comments.test.mjs scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs
```

### Task 11: Execute resumable backheal and separately authorized rollback

#### Story Intent

- **Beneficiary:** workspace operator performing an approved historical repair
- **Capability:** resume verified effects and restore permitted originals after partial failure
- **Need:** GitHub body and comment mutations are separate operations that can fail or race independently
- **Value or failure prevented:** avoid duplicate records, lost evidence and accidental rewriting of later human changes

#### Delivery

**Estimate:** 12 hours. **Dependencies:** Task 10. **Files:** Create `scripts/task-tracker/lib/artifact-record-backheal.mjs`, `scripts/task-tracker/verbs/artifact-backheal.mjs` and `scripts/tests/integration/task-tracker/lib/artifact-record-backheal.test.mjs`; register the new governed verb/help through the current command catalog during implementation.

- [ ] Implement inventoried, previewed, backup-published, applying, applied, retiring, verified, complete, conflict, rollback-pending and rolled-back transitions under shared authority. Reserve before transport and persist exact after-state/created IDs only after read-back.
- [ ] Freshly verify the entire live target baseline, protected evidence and closure/state before each effect. Advance expected baseline solely for verified own effects, including canonical body-version changes.
- [ ] Reconcile ambiguous create/update/delete before retry. A completed second run verifies remote state and no-ops; later human drift is conflict rather than success. Other independent completed targets retain their receipts.
- [ ] Add rollback authorization distinct from apply: bind originals, exact current after digests and restoration/recreation effects. A deleted numeric ID cannot be restored; authorized recreation records old/new identity and actual timestamps honestly.
- [ ] Expose governed CLI modes inventory/preview/apply/resume/rollback/status with explicit targets and operation IDs. Dry-run defaults never authorize mutation. Test expiry/revocation during partial completion and no historical timing/lifecycle mutation.

**Interfaces:** Produces `runArtifactBackheal` and versioned diagnostic/effect reports; CLI accepts proposal/authorization references but never raw branded capability. This service does not reopen or demote historical issues.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/artifact-record-backheal.test.mjs scripts/tests/unit/task-tracker/core/backfill-plan-metadata.test.mjs scripts/tests/unit/task-tracker/core/coverage-backfill-plan-metadata.test.mjs
```

### Task 12: Prove reference parity and roll out canonical future workflows

#### Story Intent

- **Beneficiary:** workspace operator using new and historical stories across providers
- **Capability:** receive consistent artifact and review records with a proven compatible rollout
- **Need:** local formatting guidance and synthetic snapshots alone cannot establish operational parity
- **Value or failure prevented:** avoid premature removal of legacy fields or accidental enabling of historical mutation

#### Delivery

**Estimate:** 6 hours. **Dependencies:** Task 3, Task 4, Task 5, Task 8 and Task 11. **Files:** Create `scripts/tests/fixtures/artifact-records/1901/`, `scripts/tests/integration/task-tracker/lib/artifact-record-workflow.test.mjs`, `docs/design/1939-artifact-record-rollout.md`; update canonical `templates/`, mirrored `.ai-task-manager/templates/`, shared task guidance and supported `skill/adapters/codex/` and Claude adapters according to the inventory. Regenerate package-owned mirrors through existing install/setup flows rather than divergent local edits.

- [ ] Capture reference index/consolidation inputs through GitHub at `5f35cf08c41bb8d9c482963e16a5313f44a973f6` and assert raw digests `42b09b9beab7860ef795f6f7b38fe953aa0ac7c3d212c194151d8a4b61b54214` and `53e8854c78bec8c8ea16e1590418bdb280cbcb668462ee60bb7ea04cd8a60a55`. Capture referenced archived inputs with identity/digest provenance; label all derived bodies as synthetic.
- [ ] Run the complete offline fixture from discovery to grouped display and exactly four stable summaries, verifying every original round and predecessor acceptance remains reachable and substantive deep dive survives.
- [ ] Exercise supported provider adapters and installed consumer setup with legacy-only, mixed and compatible-v1 producer paths. Update authoritative writers/schema validation first, then templates/guidance; local skill text alone is insufficient.
- [ ] Record rollout stages: read support/conflict inventory, dual-compatible writers, all-reader parity and real producer handshake, then optional legacy-field removal. Historical apply remains disabled without a separate authorized pilot; no pilot is executed by this implementation fixture.
- [ ] Run root integration, full unit/slow/lint/format gates once after prerequisite children reach Review and before this child enters Review; the parent verifies/reuses the resulting exact-SHA evidence once this child also reaches Review. Capture exact SHA/commands and unresolved limitations; do not repeat the full suite for each child.

**Interfaces:** Produces reproducible raw-source fixture provenance and rollout eligibility report linked to the consumer inventory, verified producer package and final integration SHA. A rollout report cannot mint historical authorization.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/artifact-record-workflow.test.mjs
```

## Cross-repository and estimate controls

Task 5's dependency must be tracked in its owning standalone repository and linked before execution; hydrate no duplicate standalone issue. Its source deliverable runs `npm test`, `npm run test:integration`, `npm run test:packaging`, `npm run test:smoke`, lint and format checks in that repository. A paused live-broker test is not live proof. AITM's fixture consumes the delivered packed package and authentic protocol fixture authority; it does not need live paid providers or registry publishing for deterministic acceptance.

The 124 child-hour sum includes that work exactly once. Parent orchestration/integration allowance is 3 hours. Dependencies define waves, but tasks sharing files remain sequential. The proposed dependency critical path is Task 1→2→3→4→8→9→10→11→12 = 100 hours; the Task 5/6 and Task 7 branches must also complete before Task 8. Use the longest path calculation in the forecast rather than subtracting parallel time from total joint effort. Estimates remain reviewable forecasts, not promises of elapsed execution.

## Plan review and preparation recipe

1. Commit this draft against #1939 after formatting and canonical task/story extraction checks; preserve generation start/end evidence without inventing elapsed intervals.
2. Run distinct-session Astra plan SPR, then Claude plan XPR with actual requested selections and normal commit-mode provenance. Preserve every finding/disposition and acceptance subject. Material XPR changes require honest predecessor lineage rather than transferring SPR acceptance.
3. Commit/publish full collateral and verify remote blobs. Update one stable plan SPR and one stable plan XPR summary and immutable accepted-plan metadata using governed writers; do not create per-round comments.
4. Conduct and post accepted-plan/spec repository deep dive, retain substantive body text, enumerate native children again, classify the parent appropriately and hydrate via sanctioned split-plan/create-issue. Capture the standalone dependency deliverable explicitly.
5. Answer all seven semantic story questions for root and each child from source evidence. Refine children one step at a time to Ready for Planning with current ranks/dependencies, sizes and estimates; do not start their implementation.
6. Reconcile reviewed WBS total/overhead, native child coverage, JIT forecast and exact source binding. Use current `plan-approve` and guarded promotion; no forged approval or state skip.
7. Stop preparation at parent Develop and children Ready for Planning. Hand implementation to fresh correctly bound workers only when separately started. No historical apply is authorized.

## Semantic self-review and coverage

The root's actor, capability, need and counterfactual value are copied from the accepted specification. Each task names a distinct operational safeguard and beneficiary supported by the same scope. The seven semantic questions are affirmative for this draft: real stakeholder; behavior/safeguard rather than completion; explicit need; concrete counterfactual; source grounding; distinct sibling contribution; standalone readability. Re-review these claims during plan reviews and hydration rather than treating this author statement as an approval marker.

| Parent AC                               | Implementation owners    |
| --------------------------------------- | ------------------------ |
| 1: versioned reference contract         | 1, 2, 4                  |
| 2: human metadata groups                | 4, 12                    |
| 3: operational consumer parity          | 2, 3, 8                  |
| 4: accurate consolidated records        | 5, 6, 8                  |
| 5: idempotent authoritative publication | 7, 8                     |
| 6: backheal/resume/no-op                | 9, 10, 11                |
| 7: non-destructive diagnostics          | 1, 2, 5, 6, 8, 9, 10, 11 |
| 8: protected lifecycle and rollback     | 1, 7, 10, 11             |
| 9: canonical writers/adapters/producer  | 3, 4, 5, 8, 12           |
| 10: #1901 parity and deep dive          | 12                       |

All new suites are future deliverables. Existing parent VC groups remain required, supplemented by these task-owned executable suites. No feature verifier has passed merely because this plan names it. Planning checks validate prose, task extraction and references only.
