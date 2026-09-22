# #1674 Compiled Guidance Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement these three tasks in order, test-first, with a review checkpoint after each. The accepted #1558 WBS and #1674 issue gates govern state changes.

**Goal:** Reuse validated static guidance across separate one-shot AITM processes without accepting stale source, tracking, runtime, or artifact state.

**Architecture:** Observe the selected source and worktree-specific index without parsing YAML, then compare a small cache manifest to a conservative source/runtime identity. On a miss, compile valid or invalid guidance into four schema-checked, digest-checked JSON artifacts and publish the manifest last. Operational admission reads only the manifest; agent and human consumers load their separate artifacts when requested.

**Tech Stack:** Node.js ESM, `js-yaml@5.4.2`, Git CLI, SHA-256, `node:test`, AITM release/package checks.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` §§10–12, 19–22; accepted WBS Task 22 in `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md`.

## Scope

Implement #1674 B2 only. Preserve #1672 source trust, #1673 route admission and compact refusal, and the existing executable guard boundary. Do not cache action decisions, evidence, approvals, or live authority. The cache directory is disposable `.tmp/aitm/guidance-cache/`; B1 and B2 become publishable only together.

## Acceptance Criteria

- [ ] Valid and invalid selected catalogs compile deterministically to `manifest.v1.json`, `agent-index.v1.json`, `human-catalog.v1.json`, and invalid-only `diagnostics.v1.json`; stale, corrupt, interrupted, and concurrent publications rebuild safely.
- [ ] Fresh processes with unchanged selected source and runtime identity skip YAML parse and semantic validation; manifest-only admission reads no agent/human artifact, agent lookup is by guidance ID, and human content is opt-in.
- [ ] Source, package, validator, schema, vocabulary, published digest, selected Git index, source adoption/deletion, and explicit refresh changes invalidate correctly; unreliable identity falls back to content/tracking checks or indeterminate refusal.
- [ ] Five §20.1 runtime cases have CI-derived budgets with at least 20% unused headroom, and production-only package/release certification proves B2 rather than trusting an external certificate file.

## Plan Metadata

- Priority: P2
- Size: XL (governed Plan forecast; Refine baseline was L)
- Estimate: 29 hours (governed Plan forecast; Refine baseline was 20 hours)
- Labels: epic-1558, guidance

## Story Intent

- **Beneficiary:** User of one-shot AITM commands
- **Capability:** Reuse validated static guidance across separate processes
- **Need:** B1 reparses and fully validates unchanged YAML on every invocation
- **Value or failure prevented:** Routine commands avoid repeated parse/validation work without accepting stale guidance or stale authority

## Global Constraints

- A cache hit is an optimization, never an executable authorization. Operational mutations still pass #1673 admission and all current guards.
- The project override must be tracked and wholly shadows the package catalog. Invalid selection never falls back.
- Unknown or missing stat/index fields are not equal. Use content hashing plus fresh tracking checks or return indeterminate.
- Keep the exact four §12 artifact names and minified JSON; no daemon, SQLite, binary codec, compression, authority cache, or diagnostic archive.
- Retain the seven-field operational result protocol, existing exit codes, package parser version `js-yaml@5.4.2`, and production-only install behavior.
- Preserve `prepublishOnly` and release CI certification; never make a caller-written JSON file sufficient to pass it.

## Decomposition Waiver

The governed Plan forecast is 29h/XL, beyond the 24h split threshold, and recommends a split because its dependency breadth is nine. The accepted WBS nevertheless defines one B2 child with three bounded, separately reviewable units: cache identity, deterministic split-artifact publication, and consumer-release certification. The user instructed Full-Auto continuation and requested a waiver to finish the work without gaming the estimate. Keep the 29h forecast and the three checkpoint commits/reviews; do not flatten the scope or claim B1 publishable. Reassess and seek a reviewed split if a fourth independent implementation unit appears or if the identity/artifact boundary cannot be verified separately. This waiver addresses decomposition only, not tests, semantic plan review, package certification, or completion approval.

## Implementation Tasks

### Task 1: Observe a conservative cross-process cache identity

#### Story Intent

- **Beneficiary:** User of one-shot AITM commands
- **Capability:** Reuse a compiled result only when the selected source and tracking context are unchanged
- **Need:** mtime-only and main-worktree `.git/index` assumptions can produce false hits
- **Value or failure prevented:** Source or index mutation cannot silently retain stale validation

#### Files

Create `guidance/cache-identity.mjs`, `scripts/tests/unit/task-tracker/lib/guidance-cache.test.mjs`, and the identity cases in `scripts/tests/integration/task-tracker/lib/guidance-cache-process.test.mjs`. Refactor `guidance/source.mjs` only enough to expose an observation path that preserves `resolveGuidanceSource` trust semantics while avoiding YAML parse and content read on a reliable warm path. Keep source selection at the package/module identity and single tracked project override boundary. The identity includes realpath, device/inode/size, nanosecond mtime+ctime, selected source type, validation profile, explicit candidate path, package/parser/adapter/validator/schema versions, registered action/guard/remediation digest, published raw catalog digest, and effective worktree index identity. Resolve `git rev-parse --git-dir` and `git rev-parse --git-path index`; include `GIT_INDEX_FILE` and split-index shared dependency. Define `observeCacheIdentity({ selected, profile, candidatePath, projectRoot })` to return either a complete comparable identity, a content-hash/tracking fallback requirement, or a named indeterminate result.

- [ ] **Step 1: Write RED identity tests.** Test preserve-mtime replacement, chmod/ctime, missing stat field, linked `.git` file, selected index, split index, index tracking change, source adoption/deletion, profile/candidate collision, package/schema/parser/adapter/validator/registry/published-digest change, and forced refresh.

```js
assert.notDeepEqual(identityAfterAtomicReplace, identityBefore);
assert.notDeepEqual(identityWithSelectedIndex, identityWithDefaultIndex);
assert.equal(missingReliableStat.decision, 'hash-and-recheck-tracking');
```

- [ ] **Step 2: Run the focused verifier and confirm RED.** `node --test scripts/tests/unit/task-tracker/lib/guidance-cache.test.mjs scripts/tests/integration/task-tracker/lib/guidance-cache-process.test.mjs` must fail for the missing identity/loader behavior, not a fixture setup error.
- [ ] **Step 3: Implement identity/observation minimally.** Use `statSync(..., { bigint: true })` where supported; compare the entire tuple, not individual optional fields. Resolve relative Git paths against the correct worktree Git directory, inspect split-index linkage, and preserve source/trust classification. If complete identity cannot be observed, require content digest plus a fresh tracking check; if those fail, refuse indeterminate before effects.
- [ ] **Step 4: Run identity tests GREEN and commit.** `node --test scripts/tests/unit/task-tracker/lib/guidance-cache.test.mjs scripts/tests/integration/task-tracker/lib/guidance-cache-process.test.mjs`; commit `feat(guidance): observe cache identity [#1674]`.

### Task 2: Compile, publish, and load split artifacts

#### Story Intent

- **Beneficiary:** User and maintainer of AITM guidance
- **Capability:** Load small, validated artifacts after one cold compile
- **Need:** Mixed or corrupt cache generations must not be accepted as guidance
- **Value or failure prevented:** Warm calls stay cheap while stale/corrupt cache content causes a safe rebuild

#### Files

Create `guidance/compile.mjs` and `guidance/cache.mjs`; extend both #1674 test files. Define `loadGuidance({ selected, need = 'manifest', profile, candidatePath, refresh = false })` with `need` in `manifest|agent|human|diagnostics`. Return the current validation-compatible shape to admission/CLI while keeping agent/human fields absent unless requested. The manifest names source/runtime identity, validation result, fingerprints, artifact schemas/paths/digests, package and validator versions. `agent-index.v1.json` is keyed by guidance ID and excludes `human`; `human-catalog.v1.json` is explicit; invalid `diagnostics.v1.json` contains validator errors and is not read for ordinary refusal.

- [ ] **Step 1: Add separate-process RED tests.** Compile in process A, start process B with parser and validator traps, require silent manifest-only and agent warm paths with zero trap calls; verify no human catalog load in agent mode. Invalid ordinary admission must use only the manifest; explicit validation must load diagnostics.

```js
await fixture.compileInChildProcess();
const warm = await fixture.loadInChildProcess({ need: 'agent', forbidParseAndValidate: true });
assert.equal(warm.stdout, '');
assert.equal(warm.loadedHumanCatalog, false);
assert.equal(warm.parserCalls, 0);
assert.equal(warm.validatorCalls, 0);
```

- [ ] **Step 2: Add corruption/concurrency RED tests.** Truncate, remove, schema-mutate, and digest-mutate each artifact; interleave two compilers with different source generations; interrupt before manifest rename. Readers must rebuild from the selected YAML on any mismatch and never accept mixed content.
- [ ] **Step 3: Implement cold compile and warm load.** Stat/read/stat, retry one changed observation, then return named indeterminate. Normalize and serialize deterministically, SHA-256 every artifact, write unique same-directory temporary files, rename artifacts, and rename manifest last. Re-read and verify schema/digest before accepting a warm artifact; on cross-generation mismatch retry from source. Memoize parsed agent index only within one process and identity.
- [ ] **Step 4: Run split-artifact tests GREEN and commit.** `node --test scripts/tests/unit/task-tracker/lib/guidance-cache.test.mjs scripts/tests/integration/task-tracker/lib/guidance-cache-process.test.mjs`; commit `feat(guidance): compile and load split cache artifacts [#1674]`.

### Task 3: Wire admission and certify the joint consumer release

#### Story Intent

- **Beneficiary:** Release operator and installed-package user
- **Capability:** Ship the B1 loader only with proven B2 warm-load and invalidation behavior
- **Need:** A green development branch alone does not certify a production consumer cache
- **Value or failure prevented:** Released commands are both safe and measurably read-many

#### Files

Modify `guidance/admission.mjs`, `scripts/task-tracker/guidance.mjs`, `scripts/maintenance/generate-guidance-release.mjs`, `scripts/tests/integration/task-tracker/lib/guidance-release-refusal.test.mjs`, `scripts/tests/integration/task-tracker/lib/downstream-package-boundary.test.mjs`, `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`, and package/CI wiring if needed. Create `scripts/tests/fixtures/1558/cache-budgets.json`. Preserve the #1673 refusal/recovery classifier and source-trust warnings. Wire `--refresh` to bypass cache reads, not source/tracking checks. Release certification must run a real cross-process B2 test and inspect matching checked-in CI benchmark evidence; a caller-provided certificate file or import scan alone cannot pass. Retain `prepublishOnly` and the release-targeted CI job.

- [ ] **Step 1: Add RED admission/release tests.** Assert valid/invalid operational behavior is unchanged, recovery validation loads diagnostics, source command is read-only, forced refresh parses once, and a production-only packed install exercises warm parser/validator avoidance. B2-absent or tampered consumer fixture must still fail publication.
- [ ] **Step 2: Wire the loader without broadening authority.** Call `loadGuidance(..., need: 'manifest')` before effects in admission; use `need: 'diagnostics'` only for explicit validation and retain candidate/published profile isolation. Preserve compact invalid refusal and current exit codes.
- [ ] **Step 3: Measure all five §20.1 cases.** Record cold parse/validate/compile, warm manifest, warm agent, human, and invalid diagnostic loads from CI runner samples. Commit actual sample method, environment, medians/p95, and budgets with at least 20% unused headroom; assert relative cold/warm behavior and zero warm parser/validator invocations in fresh processes. Compare separately with #1673’s local B1 cold table, without treating that table as a CI budget.
- [ ] **Step 4: Prove consumer release and commit.** Run focused VC1, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:integration`, `npm run test:slow`, `npm run lint:guidance-release-consumer`, and the production-only package test. Require positive B1+B2 certification and negative uncached/tampered fixtures. Commit `feat(guidance): certify cross-process B2 cache [#1674]`.

## Review and Handoff

At each task checkpoint, inspect the diff against the accepted §12/§20.1 contract and run the task’s focused tests before continuing. After final exact-HEAD verification, stamp each root AC separately, run the governed Test/Review gates, then merge back into `feature/epic/1558` and push by a non-force fast-forward. Do not start #1675 until #1674 is Done.
