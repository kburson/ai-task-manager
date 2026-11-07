# #2146 Archival Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The owner authorized native execution with independent Astra review; do not request another routine execution-method decision.

**Goal:** Preserve the complete original spike as a lossless committed archive and verify it through native exact-commit receipts.

**Architecture:** Deterministic gzip stores deduplicated contents; a strict index restores the complete original read set. Repository-only code validates an isolated historical checkout and records carrier and historical source identities separately.

**Tech Stack:** Node.js >=24 built-ins, local Git, existing AITM/GitHub lifecycle. No dependencies or product runtime changes.

**Spec:** `2026-11-05-2146-archival-validation-design.md` beside this plan; final location `docs/superpowers/specs/2026-11-05-2146-archival-validation-design.md`.

## Global Constraints

- Preserve all original source, raw evidence and refused fixtures; do not mutate #2145/#2071/#2155/#2159.
- No package/publication before accepted design and exact inventory review. No credential publication or silent redaction.
- Actual code classification, attributed commits, applicable code checks, complete exact-head CI and native Test remain required despite spike kind.
- No old runtime/provider/experiment execution, identity override, remote Git or policy change.
- Use the existing carrier checkout; no new native chat or managed worktree. All candidate material is ignored and owner-local until reviewed.

## Story Intent

- **Beneficiary:** native-session operator
- **Capability:** assess an attributable recovery route for the preserved partial initial-branch attempt
- **Need:** partial branch creation has left the original session unable to continue
- **Value or failure prevented:** choose a reviewed correction without losing the original timer, ownership or recovery evidence

## Review Focus

- Receipt reuse after archived/executable byte drift must fail by tracked carrier identity; Task 3.
- An extraction ancestor changed to a symlink must refuse before writing outside; Task 1.
- A historical Git object absent from a clean Test/CI checkout must fail without fetching; Task 2.
- Deep assertion negatives must use the real adapted verifier, while the outer CLI still rejects changed manifests; Task 2.
- Global hooks/filters or a local source path mistaken for network transport must not execute unreviewed code; Task 2.

## Task 1: Lossless carrier and containment

**Files:** `scripts/research/2146-native-recovery/archive.mjs`, `pack.mjs`; `docs/archive/2146-native-recovery/index.json`, `objects.json.gz`, `README.md`; `scripts/tests/integration/task-tracker/core/2146-archive-validation.test.mjs`.

**Interfaces:** `buildArchive(evidenceRoot) -> {index, compressed}` verifies original pins and returns deterministic bytes; `validateArchive(indexBytes, compressed) -> {entries, objects}` returns validated buffers; `restoreArchive(validated, emptyDestination) -> inventoryDigest` performs exclusive contained writes. Builder CLI accepts one original evidence root and one nonexistent output directory; runtime CLI does not expose these overrides.

- [ ] Record scope extension/classification through governed issue-body and owned-comment operations. Preserve old failed Test/setup/absolute-path review history. After independent design/plan review accepts this exact revision, record its exact hashes and coordinator AFK authority in governed Plan Metadata and an owned continuation audit while remaining in Develop. Preserve the original native Plan marker as historical; do not claim a fresh native Plan approval, attempt unsupported Develop-to-Plan demotion, or use exception repair that does not apply.
- [ ] Write failing tests for deterministic encode/decode, all 1,134 files and hashes, missing/extra/duplicate path, corrupt content/pins, invalid base64, bounds, traversal, prefix collision, symlink/hardlink metadata and ancestor replacement. Expected first failure: absent archival implementation, not fixture/bootstrap error.
- [ ] Implement the closed format and containment with Node built-ins; build only an ignored candidate in the original owner checkout. Verify reconstruction matches every original byte/path/hash and the independent pins, without changing originals.
- [ ] Complete scoped scan triage and inspect the exact candidate inventory. Obtain the authorized independent inventory review before copying the candidate into tracked carrier files or publishing it. Retain actual file hashes and measured compression in the review record.
- [ ] Run targeted tests; expected all corruption cases refuse with named reasons and lossless round-trip passes. Do not commit a failing partial test tree; commit this task with its tests when independently useful and the reviewed scope permits transfer to the existing carrier.

## Task 2: Historical source and unchanged assertions

**Files:** `scripts/research/2146-native-recovery/reconstruct.mjs`, `historical-context.mjs`, `verify-historical.mjs`; extend the same integration test file or a second `2146-archive-assertions.test.mjs` if the repository line cap requires it.

**Interfaces:** `reconstructHistoricalSource(carrierRoot, ownedRoot) -> {sourceRoot, sourceCommit, sourceTree}` requires the exact local object and isolated Git configuration; `runHistoricalAssertions({sourceRoot, restoredEvidence, mode, adapterPaths}) -> result` runs the pinned adapted module. Historical context exports the bounded equivalents of `fs`, `evidence`, `ownerRoot`, `sha`, `readJson`, and strict `resolveHistoricalOutput`.

- [ ] Write failing tests for wrong/missing historical source, dirty reconstructed source, wrong source bytes, a legitimate recorded run directory versus unrelated directories, outside historical-output paths, unknown reads and hook/filter/fsmonitor/URL rewrite preconditions. Include inherited `GIT_INDEX_FILE`, `GIT_DIR` and `GIT_CONFIG_COUNT`; require refusal before helper execution or outside writes. Assert no network fallback and original/carrier Git state unchanged. The actual CI integration test and native CLI must each require historical object availability, not infer it from local checks or workflow configuration.
- [ ] Implement reviewed reconstruction in an owned disposable physical repository only, using the carrier's required scratch helper and reviewing its imports. Verify exact subprocess argv and that no old CLI, hook or provider was executed; if the proposed Git sequence is not safely admitted, report its precise refusal rather than substituting a hidden route. Use a private owned root; verify pre-write ancestor replacement refusal without claiming arbitrary same-user race immunity.
- [ ] Produce the adapted verifier as a narrow source diff from original v2. Keep every assertion; change only bounded I/O imports, historical lookup and output labels. Preserve the frozen original verifier/harness as archived data.
- [ ] Add real-adapter negatives for execution identity, runtime preservation, baseline/refusal outcomes and report/plan claims. Mutate only disposable validation copies; prove outer validation rejects their changed original manifest independently.
- [ ] Run both modes on the ignored candidate and retain explicit historical/carrier domains, 81 runs, 16 cases, UNIMPLEMENTED recovery and UNPROVEN activation. Request focused independent diff/import/read/subprocess review; resolve all Important findings before accepting this task.
- [ ] Commit actual archival-validation code/tests with `[#2146]` once the carrier is appropriately bound and the reviewed task passes; trace exact commits.

## Task 3: Native receipt and delivery qualification

**Files:** `scripts/research/2146-native-recovery/verify.mjs`; final spec/plan under `docs/superpowers/`; update archive README with evidence, and native issue Scope/Plan Metadata/VC/Functional DoD via governed commands.

**Interfaces:** strict CLI `node scripts/research/2146-native-recovery/verify.mjs report|plan`; output has the exact distinct identity/result fields from the spec, never a generic original-source cleanliness assertion.

- [ ] Write failing checks that runtime archive/index/adapter files differ from their actual HEAD blobs, that tracked drift prevents receipt reuse, and that dirty carrier or unsupported mode refuses. Ensure candidate-only library entrypoints cannot become a native CLI pin bypass.
- [ ] Implement the strict carrier CLI: verify HEAD/cleanliness/tracked bytes before and after execution, validate pins, restore in owned scratch, run historical assertions, validate output and emit both identities. No arbitrary-root/hash/archive options.
- [ ] Transfer only reviewed candidate data/code/design/review records to the existing `2146-owner-deliverable-close` checkout through supported attachment and genuine Start/relocation. Fresh native turn/runtime proof required when helper activation changes. Keep original3d20 unchanged. Use an attributable branch for actual archival commits; never amend or repurpose old source commits.
- [ ] Govern exact VC correction to the two strict CLI commands; add the targeted test command and explicit full verification evidence. Preserve original VCs/stamps as historical evidence and retire stale receipt authority using supported operations. Do not manually manufacture markers.
- [ ] Verify npm pack's real inventory excludes code/archive/tests; run targeted negatives plus full lint/format. Open the real PR, obtain independent exact-diff review and successful complete exact-head CI. If a docs or kind heuristic would omit checks, run the real complete checks explicitly; never claim an omission is a pass.
- [ ] Reserve the serial native Test slot with the coordinator, then use fresh Explain and normal promote/Test. Require actual Git-only sandbox success with historical object availability and no original evidence reads; retain failures and do not repeat without changed preconditions.
- [ ] Complete exact-head Review, provider-action delivery and Close only through native gates. Keep #2159 paused until coordinator verifies #2163 delivered and Done.

## Self-review

The three tasks cover archive identity/containment, historical semantics, and native immutable receipt/delivery. No source or runtime reconstruction claims original live recovery. Candidate operations occur only after this design/plan review. Exact implementation and archive inventory require a later concrete review; this plan is not their test evidence.
