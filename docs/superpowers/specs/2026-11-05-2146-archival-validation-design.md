# #2146 archival validation design

Status: proposed for independent review; no candidate archive or verifier implemented.

## Authority and purpose

The owning coordinator, acting under the human's explicit AFK authority, authorized an archival-validation increment for #2146 on 2026-11-05. It preserves and verifies the completed spike. It does not authorize another recovery experiment, a product policy change, native recovery of #2145, or changes to #2071, #2155 or #2159. Original source, raw evidence and refused fixtures remain untouched. The existing `2146-owner-deliverable-close` checkout will carry accepted changes; no new native chat or managed worktree is created.

The original verifier cannot run in native Test's Git-only sandbox because its ignored evidence is absent. A reviewed absolute-path alternative was rejected: the existing command grammar accepts it, but native receipt fingerprints do not bind external executable or evidence bytes and may reuse a receipt after those bytes drift. Preserve that finding, the failed native Test, the failed trunk CI setup, and subsequent successful e3 CI as historical records. None qualifies a new carrier commit.

## Classification and lifecycle

This increment contains repository-only verification code, not merely documentation. Keep #2146's original spike identity and deliverable history; record the added executable scope explicitly. All genuine commits use `[#2146]` and receive a truthful commit trail. Do not attribute old source HEADs to this work.

No inspected contract requires a new issue: `deliver.mjs` takes the issue-resident no-commit route only when no PR exists; an actual PR takes the ordinary attributed code-delivery path. Therefore open a PR for this increment, run applicable code checks, targeted negative tests, complete exact-head CI, native Test and independent implementation review. Do not use the spike's testless defaults or a docs-only label to omit checks. Add explicit Functional DoD and VC coverage for the archival code through governed issue-body operations.

Remain in Develop. Record the coordinator's explicit scope extension, exact accepted design/plan hashes and independent review through governed Scope/Plan Metadata and an owned continuation-authority audit. The original native Plan approval remains historical; do not describe this extension as a newly executed native Plan approval. `plan-approved-guard.mjs` applies at Plan exit only, and the story-quality contract does not retroactively reopen/demote Develop. Ordinary `plan-approve` requires Plan, `demote` does not support Develop-to-Plan, and later-stage exception repair does not apply here. Do not invoke those unsupported routes or manufacture a marker. A real subsequent gate refusal must be retained and resolved through its supported route.

## Immutable inputs and measured format

Historical source commit: `2fd89e1103a0ee1976e0e1a1210c2d4e1bb57de0`.
Historical source tree: `36a4b5ba652094df909b05b4a99352bb7e41233d`.
Original relative evidence root: `.scratch/native-recovery-spike/followup-20261103T233057Z`.
Original absolute root: `/Users/kpburson/.codex/worktrees/3d20/ai-task-manager/.scratch/native-recovery-spike/followup-20261103T233057Z`.

Independent SHA-256 pins:

- Manifest: `78afd54726726495057aacba467593b922b218d602081bf6b392274bc2514781`.
- Original verifier: `e5a8f03a08a2e2b8d5dd9efc420e683d979d6a3b6911e64dd9bff260e8d6fc77`.
- Original harness: `767fce262ef84ba7b1202519a9f95a4a10617a92ae74da37f9a27a481d0f82a1`.
- Report: `c6c7c01006f77be50f24423f9280d47e07498c240a7dbd53eff9b2f29dc5cb8d`.
- Plan: `1b20fedde2acd4a8e8c4bc41af74656e48932af101444fe21c674562f22b7dc1`.

Read-only measurement rechecked every artifact digest: 1,133 manifest artifacts plus the manifest itself, 119,208,600 expanded bytes; 593 unique byte contents, 5,549,342 unique bytes. A sorted array of `[sha256, base64Bytes]` pairs plus a final newline is 7,442,466 bytes; gzip level 9 is 1,841,366 bytes; Brotli quality 11 is 590,016 bytes. Choose gzip for standard-tool inspectability; this is a format choice, not permission to publish unknown content. Candidate generation must reproduce the measurement or explain a format-only difference.

Carrier data under `docs/archive/2146-native-recovery/`:

- `index.json`: closed schema `aitm.spike-archive/v1`, original root/source/tree pins, archive digest/size, exact sorted list of 1,134 regular-file paths with SHA-256, size and permission bits, expected counts and total bytes. Independently pins original manifest and executable digests above.
- `objects.json.gz`: deterministic gzip of the sorted unique-content array. No timestamps or host-dependent headers; no path entries or executable metadata inside this stream.
- `README.md`: provenance, disclosure inventory, format inspection recipe, exact archive digest, original-versus-carrier claims and historical failures/review dispositions.

No original byte is edited, sanitized or omitted. All original artifact paths are reconstructed from the index; duplicates in content are deduplicated only in storage. The twelve source files are read from the exact historical Git commit, not copied from a mutable original worktree. Full historical Git object availability is a fail-closed precondition, never a network fallback.

## Inventory and disclosure review

The approved scoped `rg` scans emitted only categories/counts/filenames. Selected GitHub/AWS/OpenAI/private-key/Google/Slack credential markers and password/access-token/refresh-token/GitHub-token labels had no matches. Known personal paths occur in 743 files and native identity markers in 415. All cookie-word hits are in 81 dependency inventories, which contain paths/modes/sizes/hashes rather than dependency contents. All twelve secret-word hits occur in nine qualification artifacts and match `/secret` and `secrets` fragments. Authorization words occur in report/plan/verifier boundaries. A broad `sk-` marker is noisy because it occurs within ordinary task-related words; a subsequent fixed-string whole-word `sk` scan had no matches, distinguishing a standalone conventional prefix from those embedded substrings. These are bounded pattern observations, not proof of universal credential absence. Retain the earlier Node scan refusal as a regex-as-path false positive; do not rewrite that failed attempt into success.

Before publication, compare the exact candidate inventory to the pinned original manifest, finish category triage without exposing credential values, and have the reviewer inspect the inventory and scan limits. Known native provenance IDs and local paths are retained faithfully under the explicit preservation authority. Any actual credential finding blocks publication; redaction would require a distinct derived artifact and could not satisfy this lossless design. Archive creation in ignored scratch is not publication.

## Code and executable review boundary

Place all new runtime code under `scripts/research/2146-native-recovery/`, already excluded by package.json. Place tests under `scripts/tests/integration/task-tracker/core/2146-archive-validation.test.mjs` with `@story #2146`. Verify npm's actual pack inventory excludes archival code, tests and archive data. No package exports, command registry, hooks, policy or dependencies change.

Responsibilities:

- `archive.mjs`: deterministic pack/decode and strict read-set/path validation. Exposes pure bundle validation plus extraction into a newly created owned directory. No interpreter or provider execution.
- `reconstruct.mjs`: obtains a disposable historical Git checkout using local immutable objects only; runs no old AITM CLI, provider seam, recovery action, or old hook. Owns only its new directory. Uses the carrier's required `scripts/task-tracker/lib/scratch-dir.mjs` helper; include this module and its transitive imports in implementation review. The historical I/O context remains built-ins-only.
- `historical-context.mjs`: bounded file reads and historical absolute-output mapping; derives its root from its restored location. Uses Node built-ins only and independently checks the original manifest pin before reading its inventory. Does not import or execute the original harness.
- `verify-historical.mjs`: reviewed derivative of the original verifier. Every original assertion remains; only its I/O imports, historical lookup mapping and truthful output-domain labels change. Retain an exact original-to-adapted diff in review evidence. No broad rewrite or formatter-only diff should conceal the changes.
- `verify.mjs`: CLI `node scripts/research/2146-native-recovery/verify.mjs report|plan`. Requires clean current carrier source; checks carrier archive/index/executable bytes against their blobs at actual HEAD, validates the original independent pins, reconstructs, runs the adapted verifier, and reports both domains. No arbitrary root, archive, SHA or expected-hash CLI override.
- `pack.mjs`: one-time local builder CLI taking the explicitly owned original evidence root and a new ignored output directory; refuses existing output and verifies all original pins before packaging. No publication or Git mutation.

For tests, internal library entrypoints may consume deliberately damaged bundles or reconstructed copies. They must not create a hidden CLI switch that weakens the production archive verification path. Positive native qualification uses the strict committed CLI only.

## Historical reconstruction and subprocess contract

Avoid checkout/restore commands that can invoke post-checkout hooks; `git restore` is not assumed hook-free. The reconstruction implementation must be reviewed against the local Git version before its first candidate run.

Proposed minimal isolation is a NEW disposable physical Git repository under the approved repository-local isolated test-fixture root returned by `mkdtempProjectIsolated('2146-archive-')`, not a native worktree or AITM binding. Use local `git clone --shared --no-checkout --template=<new-empty-template> -- <real-current-carrier-root> <new-reconstruction-root>`; the empty template applies only to creation of this validation repository, never modifies or disables an existing hook or native guard. Refuse any applicable global/system Git hook configuration before creation and any active hook/filter configuration in the new repository before index/worktree mutation. If this cannot be established without an override, stop this reconstruction path rather than silently disabling a guard.

Use a small checked runner for this fixed Git command set only. Before any child Git invocation, reject nonempty inherited `GIT_*` variables except the harmless exact values `GIT_TERMINAL_PROMPT=0` and `GIT_OPTIONAL_LOCKS=0`; in particular do not strip or override redirected repository, index, object, config, template, helper or trace destinations. Before clone, inspect applicable global/system configuration with includes for hooks, filters, filesystem monitoring, transport helpers and URL rewrites; before update-ref/read-tree/status inspect the new repository's effective configuration as well. Refuse executable `core.fsmonitor`, active hooks/filters, `url.*.insteadOf`/`pushInsteadOf`, proxy/SSH helper commands and other settings that would execute a helper for these operations. A false/disabled filesystem-monitor setting is harmless; do not disable an active one. Only a physically validated local carrier directory is a permitted clone source; no arbitrary URL/ref/root CLI input. This is not a general Git sandbox framework, and no global configuration is changed. Candidate tests must include inherited `GIT_INDEX_FILE`, `GIT_DIR`, `GIT_CONFIG_COUNT`, fsmonitor/helper configuration and URL rewriting, and verify refusal occurs before external writes/helper execution.

Set only the new repository's detached HEAD to the exact historical commit using `git update-ref --no-deref HEAD <pin>` and populate only its new index/worktree with `git read-tree --reset -u <pin>`. This is not a reset or ref change in the carrier/original repository. Validate the historical commit/tree, clean status and all twelve source hashes. The read-only local object-store dependency may point to the carrier Git objects, never original raw evidence or live runtime. No network Git, provider command, old hook, old CLI, identity variable override or copied runtime is allowed. Record exact subprocess argv and outcome categories for review; do not print raw credential material.

The shared clone does not register another worktree in the owning repository. Remove only the exact newly created owned directory on success. Preserve unexpected local candidate failures and their diagnostics. Native Test/CI retain their normal sandbox lifecycle; do not claim those runners preserve removed filesystem fixtures.

## Extraction and read containment

Decode only the closed schema and fixed counts. Require canonical sorted arrays, unique path names and unique object hashes; reject extra keys, repeated normalized names, unexpected/missing members, unknown object references, noncanonical base64, incorrect size/hash, oversized compressed/decompressed/expanded data, and wrong pins. Gzip inflation is bounded to 8 MiB, compressed input to 2 MiB and expanded logical files to 120 MiB. Every original pin and original inventory entry must match, not merely the self-reported outer index.

Only regular files are representable. Reject symlinks, hardlink declarations, non-regular source files, absolute paths, backslashes, empty/dot/dot-dot segments, NULs, `.git` segments and path-prefix collisions. Check each existing destination ancestor with lstat; require the empty destination's real path to remain within its newly owned root; use exclusive file creation and never overwrite. Create the private owned root with owner-only permissions and do not share its path with another writer. The concurrency assumption is no hostile same-user process replacing ancestors between checks and writes: a tested pre-write symlink replacement must refuse, but pathname lstat/create checks are not claimed to be race-proof against arbitrary same-user interference. Review the actual write sequence. No tar extraction, pathname globbing, shell, external decompressor or archive-specified permission outside ordinary file modes.

Historical `r.out` mapping requires the exact original evidence root followed by `/`, then a canonical relative RUN DIRECTORY belonging to the ancestor-directory set derived from the validated file inventory. `r.out` itself is not an inventory file. Every subsequent file read must match an exact permitted file in the inventory. Include a positive recorded run-directory shape and negatives for an unrelated directory, old-root prefix collision, traversal and foreign absolute root. Never fall back to the original filesystem. Keep recorded JSON bytes unchanged. The bounded I/O context permits reads only of original inventory files, original manifest and twelve historical source paths, with physical ancestor checks. Extra validation modules are pinned and copied separately; they are not relabeled as original artifacts.

## Assertions and claims

Keep all original source-HEAD/clean-tree/source-hash assertions in the reconstructed historical checkout, all 1,133 artifact hashes, matrix and evidence references, per-run executable identities/dependency outcomes, baseline/runtime preservation, actor and timing invariants, partial-write/readback outcomes, unexpected reflog acceptance, blocked activation, transport qualification, failed prevention assertions, rejected remote-Git ledger cases and truthful report/plan language. No missing or expected-refusal result becomes a pass.

The result separately names `archiveCarrierCommit`, `archiveCarrierClean`, `historicalSourceCommit`, `historicalSourceTree`, `historicalReconstructionClean`, archive/manifest/adapter digests, 81 execution records and 16 matrix cases. Keep `exactRecovery: UNIMPLEMENTED` and `nativeHostActivation: UNPROVEN`. Never emit undifferentiated `sourceClean: true` or claim reconstruction proves the original live checkout is currently clean. Native receipts remain at the actual carrier HEAD. Tracked archive and executable bytes are therefore part of immutable commit authority and drift invalidates ordinary receipt freshness.

## Required qualification

Negative cases must exercise the actual archive validator and actual adapted verifier: altered archive byte, replaced original manifest, missing/extra file, wrong source commit/tree/source bytes, executable identity drift, runtime/baseline invariant drift, absolute/traversal/duplicate paths, original-prefix collision, symlink/hardlink escape, oversized inflation, unsupported mode and missing historical Git object. To reach deep original assertions in a disposable negative fixture, update only that fixture's self-consistency manifest and run the actual adapted assertion module; separately prove the strict outer CLI refuses any such changed original manifest. Never modify original evidence or weaken the normal CLI pins.

Qualify both modes from a clean Git-only checkout on the intended carrier source, without access to the original evidence root; verify no old CLI/hooks/provider execution, no original/carrier ref/index change, no external writes and no shipped archive/tooling. Current CI fast/integration shards declare `fetch-depth: 0`; slow shards do not. Put these checks in the integration lane and make the actual CI test assert `cat-file` availability of the exact historical commit/tree and execute both modes. Static workflow inspection and local ancestry are supporting evidence only. The actual native Test sandbox must perform the same object-availability check and complete verification; a missing object is a failure, never a fetch or skip. Run full lint/format, targeted negative tests and complete exact-head CI. Native Test must then run the new VCs with fresh develop finalization and a coordinator-reserved Test slot. Review and delivery/close follow normal exact-head gates; old e3 CI or original AC stamps cannot be relabeled as new execution.
