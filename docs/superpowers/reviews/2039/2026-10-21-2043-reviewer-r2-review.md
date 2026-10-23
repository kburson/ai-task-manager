# Independent R2 review — #2043 Task 10

Reviewed exact range `e5bbac14bd50ea6bfbfd3389e7a06e7e6cba511c` → `c4fa044b6cb27130966ab759be44793e6c119557`.

Inputs included pinned Task 10, original Task 4, the guarded-publication specification, implementation notes, the complete R1 review and author disposition, changed source/tests, and relevant native store, writer-registry, lock, manifest, retention, and invariant implementations.

No tracked source, index, HEAD, branch, session binding, issue, or cloud state was changed. Tests and one inline probe used disposable native fixtures.

## Strengths

- Body and title staging share a canonical issue-update payload while preserving immutable cloud baselines.
- Persistent registry ownership, actual session/worktree identity, manifest validation, generation fencing, and commit readback provide substantial defense against stale or inconsistent local state.
- Results explicitly distinguish unpublished local staging from publication.
- Native-store integration tests exercise durable behavior, failure handling, no-ops, concurrent staging, inherited references, and offline operation.
- Both R1 findings are repaired appropriately:
  - Validated title/key/callback arguments are captured before asynchronous work, preventing caller option mutation from poisoning persisted content.
  - Changed edits conservatively refuse unsupported inherited capability references; true no-ops preserve those references and the complete generation.

## Issues

### P2 — Validate the repository root of an inherited native issue lock

**Location:** `scripts/task-tracker/lib/story-cache/stage-body.mjs:175-178`.

The adapter checks that the native lock owner remains active and belongs to the current session, but never checks that `lockOwner.projDir` is the actual repository’s shared lock root.

Native `withIssueLock()` reentrancy is keyed by issue number. If a call stack already holds issue `N` in another repository, its nested staging call for issue `N` skips acquiring the correct repository’s physical lock. Because staging only checks the inherited owner’s session and object identity, it accepts that unrelated lock.

**Independently reproduced using two disposable native Git fixtures:**

1. Acquire a valid persistent writer claim and initialize the native store in repository B.
2. Hold B’s physical issue lock in a separate async context under another native operation.
3. Hold the same issue number’s lock in repository A under the staging session.
4. From that A-locked context, invoke B’s body staging using B’s actual worktree, valid claim, and native store.
5. Staging returns `status: 'staged'` and persists generation 2 while B’s correct issue lock remains held by the other operation.

The callback observed `currentIssueLockOwner(issue).projDir === repositoryA`, confirming that the accepted owner was for the wrong repository.

This defeats the stated serialization between cooperating staging and handoff operations. Store generation fencing cannot replace that serialization: a handoff can inspect/export state while staging proceeds under an unrelated lock. Post-commit ownership refusal also cannot undo content already persisted.

The native predecessor already handles this case: `writer-registry.mjs:309` requires `owner.projDir === root.mainRoot`.

**Recommendation:** Retain the resolved runtime root and require the inherited native owner’s `projDir` to equal its actual `mainRoot`, alongside the existing owner/session checks. Recheck that scope around awaited work. Add an integration regression proving that a same-number lock from another repository cannot authorize staging, including when the correct repository’s physical lock is occupied. Preserve legitimate linked-worktree nesting through the shared main root.

## Recommendations

Repair the repository-scope check and add the focused native-fixture regression before accepting this child. The two R1 repairs do not need further changes based on this review.

## Explicit declined-to-judge behaviors

Each boundary below was independently reconsidered against the pinned scope and R1 author disposition.

- **Public legacy writer activation and public CLI result migration:** deferred by pinned Task 10; this adapter remains unactivated and explicitly returns unpublished results.
- **Comment adoption, ownership proofs, creation intents, and comment mutation:** owned by #2058; this adapter rejects comment resource keys.
- **Genuine operation-capability issuance, scope validation, and composite retention:** owned by #2059; conservative refusal is acceptable here, and the R1 inherited-reference erasure is repaired.
- **Timing ingestion, arithmetic, projection, and publication:** separately owned; reviewed preservation of existing timing data only.
- **Publication transport, saga effects, reconciliation, delayed requests, and completion receipts:** later slices own these; local staging establishes no provider atomicity or publication authority.
- **Settlement of confirmed retained batches:** predecessor retention explicitly protects retained journals, including confirmed ones; conservative refusal remains acceptable until their owner defines settlement.
- **Remote assignment changes between local edits:** freshness belongs to acquisition/transition boundaries; per-edit cloud reads would violate the offline staging contract.
- **Native read-only classification of issue observations:** accepted observation encoding uses that classification; persistent writer authority and exact issue identity authorize local issue staging without altering observation bytes.
- **Pre-existing pure-validator semantics, including checkbox line matching and proof relocation:** unchanged native validators are reused; expanding their established semantics belongs to their owning work and later capability/integration gates.
- **Migration of malformed or unsupported reserved issue-update envelopes:** fail-closed refusal is consistent with the adapter’s reserved encoding; unrelated-schema JSON remains legacy body content.
- **Arbitrary injected stores deliberately performing remote I/O or fabricating results:** hostile dependency behavior is outside the adapter’s security contract; actual native-store behavior and adapter verification were reviewed.
- **Uncooperative same-user filesystem edits or physical lock tampering:** outside the cooperating native API contract; the reported lock-scope finding requires neither tampering nor malicious dependencies.
- **Callback-thrown objects impersonating internal `STORY_*` errors:** these remain failure diagnostics and grant no staging success or authority; ordinary unusual thrown values are covered.
- **Live workflow authorization, historical operation-audit truth, exact-head CI, and release acceptance:** no cloud reads or lifecycle mutations were authorized; local review cannot establish those gates.

## Verification commands and results

**Adapter verifier:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/stage-body.test.mjs scripts/tests/integration/task-tracker/lib/story-cache/stage-body.integration.test.mjs
```

Result: **44 passed, 0 failed**, exit 0.

**Native predecessors, invariants, package boundary, and unit-lane integrity:**

```sh
node --test scripts/tests/unit/task-tracker/core/package-boundary.test.mjs scripts/tests/unit/meta/unit-lane-purity.test.mjs scripts/tests/unit/task-tracker/lib/story-cache/manifest.test.mjs scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs scripts/tests/unit/task-tracker/lib/body-invariants-section-loss.test.mjs scripts/tests/integration/task-tracker/lib/story-cache/store.integration.test.mjs scripts/tests/integration/task-tracker/lib/story-cache/writer-registry.integration.test.mjs scripts/tests/integration/task-tracker/lib/story-cache/writer-claim.integration.test.mjs
```

Result: **221 passed, 0 failed**, exit 0. Store coverage included 72 injected persistence failures.

**Inline native-fixture reproduction:**

`node --input-type=module` with existing runtime-root/context/generation helpers, native registry/store, and native issue-lock APIs; two disposable repository roots were removed afterward.

Result: **reproduced wrong-repository lock acceptance and durable generation advancement**, exit 0.

**Repository checks:**

```sh
git diff --check e5bbac14bd50ea6bfbfd3389e7a06e7e6cba511c c4fa044b6cb27130966ab759be44793e6c119557
git status --porcelain
git rev-parse HEAD
```

Results: no whitespace errors; working tree clean before and after; HEAD remained `c4fa044b6cb27130966ab759be44793e6c119557`.

No `gh` invocation, cloud operation, full-suite run, lint/format rerun, lifecycle admission, or CI verification was performed.

## Assessment

**Changes requested: one P2 correctness issue.**

The R1 repairs are sound and all 265 independently rerun tests pass. Native lock ownership still lacks repository scoping, allowing staging to bypass the correct repository’s cooperating lock under legitimate nested API use. Repair that guard and its regression before technical approval.

Technical approval would remain separate from native acceptance, merge authorization, and release gates.
