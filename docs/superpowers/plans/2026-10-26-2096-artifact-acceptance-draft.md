# R0 immutable artifact acceptance implementation plan — #2096

> For agentic workers: execute this single cohesive native capability with executing-plans and test-driven-development. The root author owns all native mutations. Independent source review is required before delivery.

**Goal:** Genuinely accept an immutable artifact through every existing R0 acceptance boundary while preserving the actual operator context.

**Architecture:** Thread one optional artifactSubject containing canonical commitSha and treeSha separately from the existing operator observation. Explicit selection changes verification source, provenance ancestry and accepted-source comparisons; it never rewrites observed operator HEAD, root, ref, SID, binding or checkout. Reuse existing sandboxes, fingerprints, receipts, journals and exact-PR delivery authority. Omitted selection preserves the existing HEAD route.

**Tech Stack:** Existing Node ES modules, Git immutable objects and detached verification sandboxes, AITM native lifecycle and GitHub receipt/CI authority.

**Spec:** #2096 Scope and ACs; direct human six-hour focus on #2096 -> original #2090 -> #2098, ending 2026-10-26T23:04:47Z.

## Global constraints

No R1 context/timing/floor activation, new authority store, guard override, foreign identity, controller reset/branch move or duplicate merge of #2094. Preserve all retained work and historical Unknown. Manual estimates use current requirements/code and an explicit effort breakdown, without GitHub backlog history, comparables or learned rubric. Project estimationRubricIssue is 0. #2096 and #2098 are standalone for this focused run; the shared label and #2095 tracking references remain. Their lifecycle stages still proceed one step at a time.

## Story Intent

- **Beneficiary:** release operator
- **Capability:** accept an immutable delivery artifact through every native acceptance stage independently of the controller checkout
- **Need:** the controller may have advanced beyond the exact source already delivered
- **Value or failure prevented:** qualify and close the exact delivered repair while retaining honest operator identity and rejecting mismatched evidence

## Review focus

Keep actual observed HEAD and worktree.headSha equal to one another; do not substitute the artifact in the operator tuple. Source ancestry must target the selected commit even when it was squash-delivered and is not an ancestor of current trunk. Fingerprints must hash artifact lockfile/config/script bytes, not controller bytes with a substituted SHA. Existing receipt validation alone does not check an artifact tree/operator extension, so explicit selection must enforce that consistently. A source, operator or evidence change before a durable write must refuse without fabricating a receipt or completion.

## Implementation task: complete explicit-source R0 acceptance

This is one capability: a partial Test-only implementation is not deliverable. Keep integration changes in existing consumers rather than starting a new protocol or framework refactor.

### Shared interface and source execution

Create scripts/task-tracker/lib/artifact-subject.mjs with resolveArtifactSubject({projectDir, commitSha}), validateArtifactSubject({projectDir, artifactSubject}), sourceCommit({artifactSubject, operatorHead}), and explicit-artifact receipt/provenance validation helpers. A selector is a full canonical commit; verify object type and resolve its full tree. The descriptor is immutable {commitSha, treeSha}. Actor issue/repository/binding authority continues to come from existing native context. Resolve selection once under the normal command authority and revalidate before durable writes.

The command boundary accepts an additive --artifact-commit selector for relevant existing verbs and strips it from ordinary label/issue argument parsing. Pass artifactSubject in context; never set an identity environment variable or alter the actual worktree observation. Unsupported combinations refuse. Preserve the current behavior and return shapes when no selector exists.

Reuse detached sandbox creation/cleanup for actual selected-source Develop/AC/VC/Test execution. Source fingerprints must be captured from a materialized selected tree or an equivalent truthful immutable-object reader; do not label controller bytes as artifact bytes. Preserve the true executing checkout provenance and separately retain actual native operator identity/observed HEAD. Cleanliness and exact source/tree checks remain active before/during execution. No controller checkout move is permitted.

### Existing consumers to integrate

- runtime.mjs, task-tracker.mjs and move-state host/guard context: optional artifact descriptor through ordinary command, advisory readiness and actual transition paths. Preserve actor/binding/workspace preflight.
- lib/action-decision/test.mjs, review.mjs and evaluate.mjs: operator head remains the observation; lifecycle expected source and receipt comparisons use explicit artifact commit. Exercise both advisory and actual guards.
- lib/code-complete-gate.mjs and develop-exit-commit-trail-head-guard.mjs: compare/walk the artifact commit and its ancestry, including attribution refs, instead of literal HEAD when selected.
- lib/evidence-branch-reachability.mjs, develop-exit-code-complete-guard.mjs, develop-exit-sandbox-proof-guard.mjs and develop-exit-receipt-guard.mjs: retain real provenance/issue checks while validating source reachability and receipt SHA/tree against the selected artifact.
- verbs/commit-trace.mjs and commit-trail-handler.mjs: source commit metadata comes from the artifact; actual operator worktree/ref remains honest.
- verify-develop.mjs, verbs/ac-stamp.mjs, sibling VC/DoD stampers, evidence-runner.mjs and stamp-receipt-reuse.mjs: execute the selected source or reuse a genuinely matching source receipt; never merely change the stamped SHA.
- verbs/test.mjs: interlock, Develop finalization, early receipt reuse, sandbox ref, fingerprints and receipt source/tree all agree. Preserve actual execution and operator contexts independently.
- lib/verification-receipt.mjs: explicit artifact reuse validates commit/tree and the recorded context extension as well as existing command/environment evidence. Omitted selection retains legacy semantics.
- verbs/review.mjs and lib/review-preflight.mjs: rebuild source fingerprints/changed paths from the artifact, retain actual operator observation, and reuse exact source evidence without unnecessary test reruns.
- verbs/approve.mjs: stamp the artifact SHA, independently revalidate actual operator context and unchanged artifact/evidence immediately before the approval write.
- delivery/Close entrypoints and lib/delivery-authority.mjs: require explicit subject to agree with accepted Test/Review/approval/PR/tree evidence. Retain receipt-derived accepted-source authority, unique exact-head PR and merge-content verification. Artifact PR provenance must not be replaced by the controller branch.

### Test-first sequence

1. Add failing tests for the descriptor and a two-source repository: operator HEAD differs from the artifact and source lockfile/config/script contents differ. A representative API assertion is `assert.equal(sourceCommit({artifactSubject: {commitSha: candidate, treeSha}, operatorHead}), candidate)` followed by an assertion that the captured operator still has operatorHead. Real Git object resolution must refuse missing/invalid commit/noncanonical source and wrong recorded tree.
2. Extend existing action-test/review, commit-trail-head-gate, code-complete, evidence-branch-reachability and receipt suites with explicit source distinct from the actor. Include squash delivery, wrong issue/root/ref/binding, stale declarations/evidence, source/tree drift and legacy omitted selection.
3. Extend Test/Develop/stamper suites to assert actual command cwd/HEAD/tree, byte-derived fingerprints and truthful execution provenance. A substituted SHA with controller bytes must fail.
4. Extend Review/approval/delivery/Close suites for exact source consistency, operator/source race refusal, unique PR identity and already merged external-delivery recovery without a second merge.
5. Run targeted RED, implement the minimal adapter and observe GREEN. Then run the project-required affected verification and full lint/format, commit exact source, obtain complete applicable CI and independent source review. Do not repeatedly run whole suites without a new failure/change.
6. Run genuine native exact-candidate acceptance and delivery/Close readers with the real operator. Synthetic test fixtures and helper green are development evidence only. #2096 is Done only after its own native acceptance/delivery/Close.

Relevant existing tests include unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs, review-verb-evidence-commands.test.mjs, delivery-authority.test.mjs, commit-trail-head-gate.test.mjs, code-complete-gate.test.mjs, review-preflight.test.mjs, approve-core.test.mjs; integration/task-tracker/lib/action-test.test.mjs, verification-receipt.test.mjs and evidence-branch-reachability.test.mjs. Add a focused artifact-subject test and native command-path integration regression. Use actual source behavior, not tests mirroring implementation.

## Exact subsequent acceptance target

Original #2090 candidate: 52337be2fd900b55f75b34cf00930ca4a8b1dfb1; tree 72c6a19e8d9f66b16777f18791bfb4c6fe74b5fa. PR #2094 is already MERGED, base 7b27ed149e48fd28c8da6e8a1544df52de10fea3, squash 930b05780af85128a47c02e18be065c4f7c01d23. Old 14fd26ed acceptance remains invalidated. Exact-source CI artifacts remain available; strict final receipt coverage/applicability validation remains required. Reconcile genuine external delivery intent/receipt through the supported route, without inventing an earlier intent or merging again.

After #2096 is genuinely Done, close original #2090, then independently deliver #2098 under its existing omitted-rank/original-issue closure scope. Do not work on held stories.

## Manual effort and stop rule

Initial human effort: 1.5h shared source/actor separation; 2h Develop execution/provenance; 1.5h Test sandbox/receipt; 1h Review/approval; 1h delivery/Close parity; 1h independent review/final qualification = 8h. This is prospective effort, not a historical-model output or guaranteed elapsed runtime. Unknown external waiting remains separate. The six-hour focused run is a wall-clock target for the three issues; do not weaken native gates to manufacture it.

If a new blocking defect requires source outside this adapter or a broad R1 prerequisite, stop and re-plan rather than create or implement another repair. If the complete adapter cannot include source-aware Develop execution/fingerprints and both readiness/transition guards within the bound, report that concrete failure; do not cut the outcome to Test-only support.

## Independent early review

Read-only task /root/review_2096_plan reviewed this intent and actual R0 source. It identified the required preflight, ancestry and fingerprint seams above and assessed an additive R0 adapter as possible without R1 activation. No tests, source, configuration or Git mutations were performed by that reviewer. This is planning review, not native source acceptance or an attested provider-execution receipt. Final exact-source independent review remains required.
