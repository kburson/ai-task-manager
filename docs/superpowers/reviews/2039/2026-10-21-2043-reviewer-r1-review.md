# Independent review — #2043 Task 10

Reviewed exact range `e5bbac14bd50ea6bfbfd3389e7a06e7e6cba511c` → `3ee1c8ac1bd63c01df1941fe34b44d762d486081`, using the pinned Task 10, original Task 4/shared schemas, specification, implementation notes, and native predecessor APIs. Review followed the requesting-code-review template and verification-before-completion procedure. No source, index, HEAD, branch, live issue, or cloud state was changed.

## Strengths

- The adapter preserves exact cloud baselines and combines staged body/title changes into one issue payload.
- Persistent claim, actual session/worktree, manifest identity, native issue lock, and generation fencing receive substantive validation.
- Integration tests exercise native registry/store persistence with disposable Git fixtures. They cover meaningful failures, awaited callbacks, concurrent staging, baseline preservation, and transport absence.
- Unit/integration lane separation and the exact package inventory addition are appropriate.

## Findings

### Important — P2: Mutable title arguments can durably poison the working payload

**Location:** [stage-body.mjs:200](/Users/kpburson/.codex/worktrees/6dfe/ai-task-manager/scripts/task-tracker/lib/story-cache/stage-body.mjs:200), with initial validation at line 51.

`argumentsOf()` validates `input.title` but returns the original mutable object. After awaited generation reads, staging reads `input.title` again without validating that value before committing it.

**Verified trigger:**

```js
const input = { store, claim, title: 'Valid title' };
const pending = stageStoryTitle(input);
input.title = null;
await pending;
```

With a real native store and claim:

1. Initial title validation accepts `"Valid title"`.
2. The caller replaces the property while staging awaits I/O.
3. Generation 2 commits an issue payload containing `title: null`.
4. The adapter’s readback rejects with `STORY_MUTATION_UNAVAILABLE`, reason `issue-payload`.
5. Both subsequent body staging and a valid corrective title staging reject with the same reason, because `issueCandidate()` refuses the now-persisted invalid envelope.

The underlying store remains readable and historical generations survive, but ordinary adapter operations cannot repair or continue the pending issue.

**Recommendation:** Capture validated primitive arguments into a detached operation descriptor before the first await. Validate the actual composite title immediately before persistence as a second guard. Add a regression demonstrating that mutating the caller’s options cannot commit an invalid envelope and that the generation remains usable.

### Important — P2: Editing an existing working issue silently discards retained capability authority

**Location:** [stage-body.mjs:225](/Users/kpburson/.codex/worktrees/6dfe/ai-task-manager/scripts/task-tracker/lib/story-cache/stage-body.mjs:225).

Every changed issue entry is replaced with `capabilityRef: null`, regardless of the existing working entry.

The accepted manifest schema permits non-null capability references and defines them as retained validated native authority. Refusing newly supplied non-null `input.capability` does not handle authority already retained in the current generation.

**Verified trigger:**

1. Persist a valid working issue entry with `capabilityRef: 'native-proof-A'`.
2. Call `stageStoryTitle()` with an ordinary new title and no supplied capability.
3. Staging succeeds, the body remains unchanged, and the next native generation contains `capabilityRef: null`.

This silently loses retained provenance/authority while preserving its associated working content. The adapter should not consume or erase such authority merely because capability issuance and composite validation belong to #2059.

**Recommendation:** Until composite capability handling exists, refuse changes to an issue entry with an unsupported non-null retained reference and preserve the generation unchanged. Do not blindly retain an old grant across arbitrary body changes, because its scope may no longer match. Add native-store coverage for both title-only and body mutations encountering retained references.

## Recommendations

Fix both findings with focused native integration regressions. The title fix should prevent invalid persistence, rather than relying on post-commit refusal. The capability fix should preserve evidence through conservative refusal until the owning capability implementation can validate reuse.

## Commands and results

**Targeted author verifier, independently rerun:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/stage-body.test.mjs scripts/tests/integration/task-tracker/lib/story-cache/stage-body.integration.test.mjs
```

Result: **41 passed, 0 failed**, exit 0.

**Relevant native predecessors, invariant regressions, package inventory, and lane integrity:**

```sh
node --test scripts/tests/unit/task-tracker/core/package-boundary.test.mjs scripts/tests/unit/meta/unit-lane-purity.test.mjs scripts/tests/unit/task-tracker/lib/story-cache/manifest.test.mjs scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs scripts/tests/unit/task-tracker/lib/body-invariants-section-loss.test.mjs scripts/tests/integration/task-tracker/lib/story-cache/store.integration.test.mjs scripts/tests/integration/task-tracker/lib/story-cache/writer-registry.integration.test.mjs scripts/tests/integration/task-tracker/lib/story-cache/writer-claim.integration.test.mjs
```

Result: **221 passed, 0 failed**, exit 0. Store regression coverage included 72 injected before/after persistence failures.

**Disposable inline native-fixture probes:**

- Retained capability erasure: reproduced.
- Clean generation with `batch.status: 'confirmed'` refusing staging: reproduced; disposition below.
- Initial title-race probe expected staged success but instead observed post-commit `issue-payload` rejection. That exploratory invocation exited 1.
- Corrected title-race probe explicitly checked the rejection, persisted `title: null`, generation advancement, and refusal of both subsequent staging APIs: **1 passed**, exit 0.

**Repository checks:**

```sh
git diff --check e5bbac14bd50ea6bfbfd3389e7a06e7e6cba511c 3ee1c8ac1bd63c01df1941fe34b44d762d486081
git status --porcelain
git rev-parse HEAD
```

Results: no whitespace errors; clean working tree; HEAD remained the requested review commit.

No hook refusal occurred. No full-fast, full lint/format, native Test admission, or remote CI claim is made by this review.

## Declined to judge

- **Public legacy writer activation and public CLI staged-result migration:** explicitly deferred by pinned Task 10 to later integration slices. Existing public transport was not activated here.
- **Comment adoption, ownership proofs, creation intents, and comment mutation:** #2058 owns these. This adapter rejects comment keys.
- **Issuing or validating genuine operation-specific capability grants:** #2059 owns these. Conservative refusal of newly supplied non-null capabilities is acceptable for this slice; erasing already retained references is finding 2.
- **Timing event ingestion, arithmetic, projection, and publication:** separately owned. Reviewed preservation of the existing timing object; did not judge unimplemented timing behavior.
- **Publication transport, saga effects, reconciliation, delayed remote requests, and completion receipts:** later publication/integration slices own these. No provider atomicity guarantee is inferred.
- **Confirmed retained batches blocking staging:** verified the refusal. Predecessor `retention.mjs:36-38` explicitly retains even confirmed journals until their owner settles them. This slice does not define settlement or next-generation publication handling, so I do not require automatically clearing or bypassing that retained batch.
- **Remote assignment changes between local edits:** specification intentionally discovers these at transition boundaries; staging must remain offline.
- **Native read-only classification on issue observations:** the accepted observer labels issue bodies read-only. Persistent writer ownership plus exact issue identity authorizes local staging without rewriting that observation.
- **Pre-existing pure validator limitations, including line-index checkbox matching and proof-marker relocation:** the adapter reuses native validators as required. This review does not expand their established semantics.
- **Malformed/unsupported reserved issue-update envelope versions:** fail-closed refusal is consistent with the accepted encoding. Unrelated-schema JSON remains legacy body content as tested.
- **Arbitrary injected stores intentionally performing remote I/O or fabricating behavior:** a malicious dependency implementation is outside this adapter’s local contract. Reviewed manifest/payload verification and actual native-store behavior.
- **Uncooperative same-user filesystem mutation or physical lock tampering outside native cooperating APIs:** no cross-process security or provider-lock guarantee is claimed. Reviewed native cooperating lock/registry/freeze behavior.
- **Callback-thrown objects deliberately impersonating `STORY_*` errors:** normalization preserves these prefixes. I did not treat deliberate internal-error impersonation as an independent correctness defect; ordinary and hostile-accessor thrown values are covered.
- **Live workflow authorization, historical operation audit truth, exact-head CI, and release acceptance:** no cloud reads or lifecycle mutations were authorized for this review. The local audit files do not establish those external acceptance gates.

## Assessment

**Ready to merge: With fixes.**

The main staging path and native persistence coverage are strong, but the title race can leave durable working content unusable, and ordinary edits currently erase retained capability references. Both are bounded adapter defects that should be repaired before accepting this child.
