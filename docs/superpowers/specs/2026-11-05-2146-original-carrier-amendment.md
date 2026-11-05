# #2146 original-checkout carrier amendment — revision 2

Status: proposed for independent review. This document does not authorize tracked implementation. The coordinator must read the independent result and explicitly authorize the exact accepted revision first.

## Authority and the contract being changed

The coordinator authorized preparation and review of this amendment under the existing human AFK completion authority. Current work is limited to ignored planning artifacts and independent review. No new issue, native chat, managed worktree, cross-root transfer, runtime upgrade or recovery experiment is proposed.

This supplements accepted design SHA256 `1ea45b5c124834cfabdd62a0e2de2309014cecc67611c16afda0f810bd50c08d`, plan SHA256 `d7e41a2e5ff92c10c0e4298f8f33c6f370ef3dac185b85887414844201702fd3`, allocation addendum SHA256 `3666f2024f7fb836357e2f5dc7d348f505e15a2a279008d62bdda328f026449e`, and pager addendum SHA256 `2819b6cb6506ffdbe9ff1b5e83efeab942584ba1d6fa1d11d2b52e569136b4b8`. Preserve those files and their published comments unchanged as accepted historical inputs.

The design currently says the existing `2146-owner-deliverable-close` checkout will carry accepted changes. Task 3 of the accepted plan requires transfer there and says “Keep original3d20 unchanged.” The live Scope also names that eventual carrier. This amendment expressly replaces that carrier-location and whole-checkout freeze requirement; it does not pretend that advancing the original branch leaves the checkout unchanged.

After separate execution authorization, the carrier will be the existing owned `/Users/kpburson/.codex/worktrees/3d20/ai-task-manager`, branch `codex/2146-draft`, starting at `2fd89e1103a0ee1976e0e1a1210c2d4e1bb57de0`. New attributed archival commits may advance only that branch/HEAD through ordinary Git and AITM operations. This removes the cross-root transfer step completely. The separately attached e3 checkout and the zero-copy refusal remain unchanged historical evidence.

## Explicit revision-2 operational ruling

The coordinator read the complete independent r1 review, SHA256 `1c2ad53bb71414a6e6a2d215a31d78f0864fa5f2689b83d61b6d542b15cad841`, and separately resolved its Important feasibility conflict under the human's AFK best-judgment authority. The coordinator expressly accepts the existing DIRECT healer's residual external-writer race in a narrower serialized operational procedure. This replaces revision 1's unenforceable pre-write snapshot-binding guarantee for that command only. It does not assert atomic preimage enforcement, a distributed lock, prevention of every concurrent update, or capture of every concurrent intermediate value.

During the bounded maintenance interval, only this owning chat will write #2146; the coordinator will send no sibling or coordinator mutations to that issue. This is coordination, not exclusion of every external actor. A human, another integration, or an uncoordinated writer could still race the healer. Immediate reads and post-write checks detect observed divergence but cannot remove that residual risk. The coordinator accepted that precise limit; the reviewer has not yet accepted this revision and tracked implementation/healer apply remain held.

Retain the original r1 documents and full review unchanged, including the reviewer's final in-message clarification and refused attempt to edit its correction paragraph. Revision-1 hashes are amendment `7f8a0387a213ddc48465ae1e7031826793414a4853a206925ee558d19818e1b0` and plan `d77662b4d742f80684325a551e8257994305dadcb39dd6931cb7d51185892aca`. No stronger drift guarantee is silently carried forward.

## Preservation and identity

- Preserve the immutable historical commit `2fd89e1103a0ee1976e0e1a1210c2d4e1bb57de0` and tree `36a4b5ba652094df909b05b4a99352bb7e41233d`. Do not amend, reset, rebase, replace or relabel them as #2146 archival work.
- Preserve every original raw artifact, manifest, verifier, harness, report, defect plan, refused fixture and previous review/test log in place. All 1,133 artifact hashes and twelve source-file hashes must continue to match the original manifest, whose SHA256 is `78afd54726726495057aacba467593b922b218d602081bf6b392274bc2514781`.
- Preserve all pre-existing tracked product/runtime source bytes, including `bin/`, `scripts/task-tracker/`, `scripts/providers/`, `scripts/gh/`, `guidance/`, `hooks/`, `skill/`, package manifests/lockfile and workflow definitions. The only proposed existing tracked-file exceptions are the two explicitly constrained repository quality configurations below. No existing tests or product helpers are modified.
- New archival files and the explicitly approved quality-configuration changes create a new source tree and carrier commit. Record the real new HEAD, branch history, commit trace, CI and native receipts. No synthetic identity, old receipt reuse claim or runtime/state copying is permitted.
- Once the original branch advances, the untouched original `verify-v2.mjs` must fail its live-HEAD equality assertion when invoked against that live checkout. Do not edit or weaken it, interpret this expected failure as archive corruption, or present a previous run as current. The new strict CLI runs all original assertions against an isolated reconstruction of exact historical 2fd and separately validates the actual committed carrier.

The candidate index and compressed data remain byte-identical: index SHA256 `c67a987feba8924e7ed54fa5615a739c14a99e3eb5696ee66f447b1220e4a2b5`, gzip SHA256 `e0ec6b6fa0ba3c60be2bbf102cd71028072652fdeb6fe329cc315c5446afa859`. No re-encoding, omission, redaction or permission-equality claim is introduced. Historical file modes remain unverified; bounded credential scans are not universal absence proof. Known local paths and native identities retain the previously reviewed disclosure limits.

## Closed tracked-file allowlist

Only these NEW files may be introduced after execution authorization. The current candidate-transfer manifest remains a historical byte inventory; it is not transfer authority and is not rewritten.

Data and provenance:

- `docs/archive/2146-native-recovery/index.json`
- `docs/archive/2146-native-recovery/objects.json.gz`
- `docs/archive/2146-native-recovery/README.md`

Repository-only executable modules:

- `scripts/research/2146-native-recovery/archive.mjs`
- `scripts/research/2146-native-recovery/pack.mjs`
- `scripts/research/2146-native-recovery/reconstruct.mjs`
- `scripts/research/2146-native-recovery/historical-context.mjs`
- `scripts/research/2146-native-recovery/verify-historical.mjs`
- `scripts/research/2146-native-recovery/carrier.mjs`
- `scripts/research/2146-native-recovery/verify.mjs`

Integration tests:

- `scripts/tests/integration/task-tracker/core/2146-archive-validation.test.mjs`
- `scripts/tests/integration/task-tracker/core/2146-archive-context.test.mjs`
- `scripts/tests/integration/task-tracker/core/2146-archive-reconstruct.test.mjs`
- `scripts/tests/integration/task-tracker/core/2146-archive-reconstruct-positive.test.mjs`
- `scripts/tests/integration/task-tracker/core/2146-archive-assertions.test.mjs`
- `scripts/tests/integration/task-tracker/core/2146-archive-carrier.test.mjs`
- `scripts/tests/integration/task-tracker/core/2146-archive-cli-contract.test.mjs`
- `scripts/tests/integration/task-tracker/core/2146-archive-cli-positive.test.mjs`

Accepted source documents, amendment, execution sequence and review records:

- `docs/superpowers/specs/2026-11-05-2146-archival-validation-design.md`
- `docs/superpowers/plans/2026-11-05-2146-archival-validation.md`
- `docs/superpowers/specs/2026-11-05-2146-archival-allocation-addendum.md`
- `docs/superpowers/specs/2026-11-05-2146-archival-pager-addendum.md`
- `docs/superpowers/specs/2026-11-05-2146-original-carrier-amendment.md`
- `docs/superpowers/plans/2026-11-05-2146-original-carrier-execution.md`
- `docs/superpowers/reviews/2146/2026-11-05-2146-original-carrier-amendment-review.md`
- `docs/superpowers/reviews/2146/2026-11-05-2146-archival-implementation-review.md`
- `docs/superpowers/reviews/2146/2026-11-05-2146-archival-review-history.md`
- `docs/superpowers/reviews/2146/2026-11-05-2146-archive-inventory-review.md`
- `docs/superpowers/reviews/2146/2026-11-05-2146-premature-reconstruction.md`
- `docs/superpowers/reviews/2146/2026-11-05-2146-original-carrier-authority-history.json`

Historical documents are copied byte-for-byte within this same owned checkout. New source changes needed to resolve full implementation review are limited to the seven new modules, eight new tests and new README, with failing-first evidence and re-review. No wildcard authority covers additional tracked files. If another file is needed, stop and obtain a separately reviewed allowance before editing it.

## Exact quality-configuration exceptions

The only existing tracked files proposed for modification are `.prettierignore` and `cspell.json`. They are repository quality configuration, not the historical product-source files. Preserve all their existing entries and settings. Do not modify `.markdownlint-cli2.jsonc`, ESLint settings, dictionaries, package scripts or CI.

The closed immutable-path set is: the index JSON; the four accepted historical source documents listed above; the amendment and execution-plan documents; and the six listed review/history artifacts under `docs/superpowers/reviews/2146/`. The gzip is not a text-lint input. Only an exact pathname from this set may be added to `.prettierignore` or `cspell.json#ignorePaths`, and only when a normally admitted read-only check first demonstrates the relevant format/spelling failure. Existing `docs/superpowers/reviews/` Prettier coverage needs no redundant entry. Record each failing check and exact selected addition in the implementation review. This is a bounded conditional allowance, not an instruction to exempt every listed file.

No directory glob, code/test exemption, global word suppression or rule relaxation is allowed. Editable README/code/tests must satisfy the existing checks; fix their text rather than exclude them. The accepted immutable documents retain exact reviewed bytes; new amendment/review artifacts are finalized before their acceptance hashes are recorded. If an excluded artifact later changes, it needs a new hash and applicable review; an ignore rule is never evidence of integrity. A markdown-lint incompatibility or a failure outside this closed allowance is a stop condition.

Necessity is not yet fully measured. The combined in-memory formatting/spelling API probe was refused before execution because the hook interpreted a regex as outside-scope `/spellCheckDocument`; it was not rewritten or rerouted. Preserve that refusal. The exact line-oriented index encoding is immutable; no formatter is permitted to change it to make a check pass.

## Historical issue authority and supported declaration sequence

Before changing live Scope, Plan Metadata, VCs, ticks or DoD, capture a fresh complete issue body and the existing archival design/plan/review/continuation-authority comments as raw strings in a NEW, exclusive-create ignored JSON snapshot. Record repository, issue, URL, numeric/comment node identity where supplied, fetched/updated timestamps, body version and SHA256 of each raw UTF-8 body. Do not strip markers, normalize whitespace or rewrite old proof. Serialize the envelope deterministically, hash its exact bytes, retain it unchanged, and later include those same bytes at the allowlisted authority-history JSON path. Preserve snapshot files on every failure.

Publish a new governed owned audit comment with stable key `spike.original-carrier-amendment-v1`, naming the accepted amendment/sequence/review hashes and snapshot digest. Include the EXACT historical Functional-section bytes in a fenced block explicitly labeled historical data, including the old lint proof and commits kind annotation, before their removal. Preserve those inner bytes unchanged; read back that block and verify its SHA256 against the snapshot's raw section. This does not assert old hidden markers as current execution proof or place them in the live issue body anew. Link the historical comments and distinguish their historical claims; do not insert another owned-comment marker in the supplied audit text.

Read back the exact audit text before body mutation. Capture immediate pre/post snapshots for each uncheck and healer operation, with the separately computed expected section and whole-body delta. Preserve these as NEW exclusive-create ignored records, never overwriting an earlier snapshot. The final allowlisted authority-history JSON packages every captured raw string, its identity/hash, operation/result, expected delta and admitted readback without claiming unseen states. Any observed affected-field drift before mutation requires a fresh snapshot/projection and coordinator disposition before proceeding; do not retry stale operations or silently treat new content as already reviewed. Only `issue-body` operations that actually carry expectedVersion/expected bytes claim that API's precondition, never the DIRECT healer.

If an unexpected result is observed after mutation, stop, retain partial effects and all readbacks, pause and report. Do not retry automatically, reconstruct a supposed lost value, fabricate restoration or claim the operation had no effect. An unseen update between pre-read and the healer's fresh-base fetch remains the explicitly accepted residual race, not a guaranteed captured historical state.

After execution authorization, use `issue-body` exact/section operations to append the explicit carrier amendment to Scope and Plan Metadata. Preserve the original Plan marker and accepted historical document records. No demotion to Plan, synthetic Plan approval or source-runtime upgrade is required or authorized.

Retire old checks through their owners:

1. Before the bounded lint/healer interval, use normal `ensureUnchecked` with each exact AC label and finish the other authorized Scope/Plan preparation. These commands clear ticks only and retain historical proof. Do not pass the issue number as part of a label. Then confirm the coordinated single-owner interval, capture the immediate pre-uncheck snapshot and expected glyph-only delta, and use `ensureUnchecked "Lint and format checks pass"`. Verify its exact post-readback. The historical Functional bytes must already be retained in the owned audit.
2. Sequentially follow the lint uncheck with the registered DIRECT `node scripts/task-tracker/heal-functional-dod.mjs --scope 2146` dry-run and, only after the prescribed checks, its same-scope `--apply` form. Permit read-only snapshots/projection/checks between them, but NO unrelated mutation. `npx aitm heal-functional-dod` is not a command at 2fd; its unknown-command result is retained. The narrow scope is mandatory; never sweep other issues. The CLI dry run reports missing keys, not a projected body. Compute the expected Functional/body transformation separately from the immediate pre-apply snapshot; it is a prediction, not apply-time preimage authority.
3. The expected dry-run result is exactly `affected=1 healed=0 errors=0`, missing only `tests`; the expected apply summary is exactly `affected=1 healed=1 errors=0`. Require successful process status AND those counts AND exact authoritative live readback. The script catches per-issue errors without a failing process status, so exit 0 alone is insufficient. The expected readback contains all five canonical Functional keys with tests/lint/commits unchecked; `tests` declares `npm test` and `npm run test:slow`. Only the reviewed old consolidated lint properties and commits `dod:kinds exclude="epic"` annotation are removed. Compare the live Functional section and all other body/protected content against the separately computed expected result, allowing only the writer's normal body-version advance. Direct healing of a checked lint line would create a proofless tick; it must already be unchecked. Any observed pre-apply drift requires fresh snapshot/projection and disposition. Unexpected summary/readback, including an apparent idempotent no-op when a change was expected, stops the sequence with partial effects preserved. The DIRECT command has no expectedVersion/preimage validator; these checks do not claim otherwise.
4. Govern root VC replacements preserving ids 1 and 2 for the two strict committed CLI modes; retain lint/format/commit declarations and add complete lane and explicit targeted-test commands. `replace-verifier-declaration` may adjust a single existing unchecked proofless Functional declaration if necessary; it does not seed arbitrary protected markers. All operations preserve unrelated markers.
5. Fresh AC stamping runs each current declaration and replaces only that AC's historical proof; tick only after actual evidence. Functional stamping uses actual execution or permitted exact-head receipt reuse. Normal Test rejects/supersedes the old Develop-final receipt; its own implementation retires a stale Test receipt if present. Do not call internal retirement primitives, manually strip markers, force reruns or waive gates.

The declaration sequence and its expressly accepted residual race must be confirmed before any implementation commit. Release the coordinated interval only after the expected healer readback, or stop/pause on divergence before later declaration mutations. Existing ignored findings and GitHub history remain historical; native timing remains Unknown where recorded Unknown.

## Qualification and review boundaries

The read-only 2fd audit established source support and admitted commands, not future execution success. It inspected normal issue-body/comment/commit-trace, strict receipt freshness, Test's project-provider full-CI path, actual-PR delivery and Close. The existing real deliverable marker removes the old missing-writer prerequisite. Spike-kind Develop can skip its HEAD-in-trail check, but this amendment still requires truthful `[#2146]` commits, the real commit trail and an actual attributed PR. An actual PR selects ordinary provider-action delivery; it must never be replaced with issue-comment-only delivery.

Same reviewer `/root/deliverable_2146_review`, requested Astra 6/xhigh, has now performed one normally admitted direct candidate read at original3d20. This proves that read's admission, not all future access or full review acceptance. Require independent review of these exact amendment bytes, then separate complete implementation/read-set/import/subprocess review, including the 33-module helper closure and actual original-to-adapted assertion diff. Keep actual reviewer runtime configuration independently unattested unless independently established. Do not proxy refused access or replace the reviewer to evade a refusal.

All prior negative results remain: absolute-path receipt rejection, failed native Test/trunk CI setup, premature reconstruction sequencing mistake, failed same-turn activation observation, cross-root transfer-read refusal with zero copy, paused audit refusal, and formatting-probe refusal. Later success never erases them.

Both strict modes must pass from the new committed clean carrier and the actual Git-only CI/native sandbox, with local historical object availability, all 46 original assertion calls, 81 execution records, 16 matrix cases, `exactRecovery=UNIMPLEMENTED`, and `nativeHostActivation=UNPROVEN`. No original evidence-root fallback, historical network fetch, skip or old CLI/harness execution is allowed. Complete exact-head CI, full applicable lint/format, package exclusion, independent final review, fresh native Test in the reserved serial slot, and ordinary Review/approval/provider delivery/Close remain mandatory. #2145/#2071/#2155/#2159 remain untouched; #2159 stays paused until #2163 is delivered and Done.
