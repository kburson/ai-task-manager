# Reviewer response — plan review, round 1

Artifact: `docs/superpowers/plans/2026-09-22-1755-delivery-attribution-exception-reviewed-spec.md`

Spec pin: `docs/superpowers/specs/2026-09-22-1755-delivery-attribution-exception-design.md` at `0fc890a9`

Reviewer: Claude Opus 5 (anthropic, claude-code)

Disposition: revisions-requested. The plan's technical decomposition is sound and faithful to the pinned spec; the defects are in repository-gate compliance and in three under-specified integration points that will surface as late CI failures rather than as design problems.

Protocol note: no `peer-review` protocol review has been started for this artifact — the prior spec review (`review-cc015b243c3fe236325ac37f5899783f`) is still at `author-revision`. This is a manual exchange document and claims no protocol event.

## Verified as correct

I checked the plan's concrete claims rather than its prose, and the following hold:

- **Spec pin is real and current.** `0fc890a9` ("docs: address second delivery attribution spec review") is the tip of that file's history, and its diff against `f761a9cc` resolves every round-2 finding: inventory-anchored local verification replacing `origin/trunk..HEAD` (R2-F001), the raw-first-line derivation with no fold/trim/filter (R2-F002), explicit v3 selection and the closed `METADATA_WARNING_CODES` statement (R2-F003), the escaped-render byte cap (R2-F004), and adapter-based host detection (R2-F005). The plan is derived from the right revision.
- **Every referenced path exists**: `scripts/tests/unit/task-tracker/verbs/deliver-source-inventory.test.mjs`, `scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs`, `scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs`, `scripts/tests/integration/task-tracker/verbs/deliver-close.integration.test.mjs`.
- **Task 5's `authorizedIntentBytes` unification is exactly right and safe.** The two functions are already byte-identical private definitions (`delivery-records.mjs:487-491` and `deliver.mjs:300-304`), both `canonicalRecordJson` over an `AUTHORIZED_INTENT_KEYS` projection. Exporting one and importing it is a no-risk refactor, not a behavioral change.
- **`{ oid, messageHeadline }` is the correct inventory shape.** `isStructurallyInspectableSourceCommits` (`deliver.mjs:171-192`) requires exactly those two keys, and `deliver.mjs:1347` already stores the raw first line in `messageHeadline`. Task 1's insistence on retaining that shape is right.
- **Task 3's digest-plus-mappings record** and the escaped-render bound match the spec and the `canonicalCommentJson` escaping behavior.
- **Task 5's "only an attribution failure can invoke the scoped evaluator"** correctly mirrors `delivery-preflight.mjs:364-372`, where the builder call is already wrapped so that only its throw reaches `fail('attribution', ...)`.

## Required changes

### P1-F001 — The command-surface fan-out is wrong and incomplete (required)

Task 4 says "modify the command dispatch/catalog and `scripts/lib/self-doc.mjs` following `scripts/task-tracker/verbs/workflow-exception.mjs`." Two problems.

**`scripts/lib/self-doc.mjs` is the wrong file.** Its own header states it is the help source for "operator-facing support scripts exposed through `aitm`," and it explicitly excludes lifecycle command semantics: "their canonical Cursor mapping is exported by `command-surface/catalog.mjs`." `workflow-exception` does not appear in it. A task verb's help lives elsewhere.

**The real required sites, by the `workflow-exception` precedent, are four:**

1. `scripts/task-tracker/task-tracker.mjs` — dispatch case (see line 591).
2. `scripts/task-tracker/lib/command-surface/routing.mjs` — `ROUTE_IDENTITIES` entry (line 214).
3. `scripts/task-tracker/lib/command-surface/catalog.mjs` — the command record plus `VERB_CONTRACTS` (line 526), `VERB_RELATED_COMMANDS` (line 722), and `VERB_POSITIONAL_ARGUMENTS` (line 861).
4. `scripts/task-tracker/verbs/help-data.mjs` — `VERB_REFERENCE` entry (line 132).

**This is gate-enforced, and the plan does not run those gates.** `scripts/tests/unit/task-tracker/core/command-manifest.test.mjs` asserts routing↔catalog↔registry parity for every route identity, and `scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs` validates each catalog record against the normalized help schema and cross-checks `VERB_REFERENCE`. A partial update fails both. Task 4 currently runs only its own new integration file, so the failure surfaces at Task 7 instead.

Fix: replace the `self-doc.mjs` reference with the four sites above, and add `command-manifest.test.mjs` and `command-catalog-policy.test.mjs` to Task 4's Red and Green run sets.

### P1-F002 — The Task 7 release gate never runs the integration lane (required)

Task 7 runs `npm run format:check`, `npm run lint`, `npm test`, and `npm run test:slow`. But `npm test` is `node scripts/run-tests.mjs --lane fast`, and `run-tests.mjs:19` documents `fast` as "unit only (the deterministic local regression floor)". Integration is a separate lane (`npm run test:integration`).

The plan's primary integration artifact — `scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception.test.mjs`, created in Task 4 and extended in Tasks 5, 6, and 7 — therefore never executes in the release gate, and neither does `deliver-close.integration.test.mjs`, which Task 6 names explicitly.

Fix: add `npm run test:integration` to the Task 7 gate list. Note in passing that `npm run quality` is `format:check && lint && test`, so it inherits the same gap and is not a substitute.

### P1-F003 — New test files need a `@story` header or `lint:story-tags` fails (required)

`npm run lint` includes `lint:story-tags` → `scripts/tests/tools/audit-story-tags.mjs`, which walks every discovered `*.test.mjs` and requires a permitted provenance header via `hasPermittedStoryTag` (`scripts/task-tracker/lib/story-tag-header.mjs`): `// @story #<digits>` (or `// @chore`) as the **first line**, ahead of everything except a shebang or `// cspell:ignore` preamble.

The plan creates three test files and never mentions this. The failure lands at Task 7, six commits after the first violation.

Fix: state `// @story #1755` as the first line of each new test file, in the Red step of Tasks 1, 3, and 4 where those files are created.

### P1-F004 — Every commit step must run the Develop verification script (required)

`CLAUDE.md` makes this non-optional for this repository: during Develop, run `node scripts/task-tracker/verify-develop.mjs` before every commit. It enforces lint-first ordering — `npm run lint:js -- --fix`, then `npm run format`, then `node --test` over the union of changed and new `*.test.mjs` files — so that committed code is already in final formatted shape.

Tasks 1 through 6 each end with "Commit the tested boundary with a `[#1755]` subject" and never invoke it. Two consequences: the repository's Develop contract is violated six times, and every formatting and lint violation accumulates until `npm run format:check` and `npm run lint` in Task 7, where the fix touches six already-committed boundaries.

Fix: add `node scripts/task-tracker/verify-develop.mjs` to each commit step in Tasks 1-6. The plan's `[#1755]` subject convention is otherwise correct and matches the attribution gate.

### P1-F005 — The local subject reader's line-split semantics are unpinned (required)

Task 1 says the local adapter "reads each object by oid, extracts `message.split(/\r?\n/, 1)[0]` without trim/fold/filter." The rule is right; what is missing is whether this reuses the existing reader.

`inspectCommitObject` (`deliver.mjs:1400-1422`) already does almost exactly this job — `git cat-file commit <sha>`, then `message.split('\n')` with the first element as `commitTitle`. It splits on `'\n'` only, so on a CRLF commit message `commitTitle` retains a trailing `\r`, while the GitHub path (`deliver.mjs:1325-1326`) splits on `/\r?\n/` and does not. Reusing it via `inspectSourceCommit` reintroduces precisely the byte-mismatch class that R2-F002 was raised to eliminate.

The decision is not local, either: `commitTitle` from that same function feeds `matchesInspectedCommitTitle` in `classifySourceCommitSubjects` and `inspectMergeCommit` in merge verification, so changing its split is a cross-path change requiring its own regression coverage.

Fix: state explicitly which option Task 1 takes — a dedicated local reader for the exceptional path (my recommendation; it keeps the change additive), or an amended `inspectCommitObject` with the affected call sites named and covered. Either way add a CRLF fixture to Task 1's Red step, alongside the existing empty-first-line and subject-mismatch fixtures.

## Optional suggestions

### P1-F006 — Batch the per-oid local verification

As written, `verifyLocalSourceInventory` spawns two Git processes per inventory entry: one `git cat-file commit <oid>` and one `git merge-base --is-ancestor <oid> HEAD`. For the 111-commit target that is ~222 subprocesses per preflight, and the spec mandates a full re-verification immediately before the provider merge action, so ~444 per delivery attempt.

Suggest keeping the per-oid interface but batching the adapter: one `git cat-file --batch` pass fed all oids yields existence and raw message together, and one `git rev-list HEAD` pass yields reachability as set membership. Two processes instead of 222, with identical semantics.

### P1-F007 — Plan the integration test split up front

`npm run lint:line-cap` → `scripts/tests/tools/audit-line-cap.mjs` hard-fails any test file exceeding 800 *code* lines (blank and comment-only lines excluded), with an advisory at 400.

`delivery-attribution-exception.test.mjs` (integration) is extended in Tasks 4, 5, 6, and 7 with: both `prepare` passes, the full authority-refusal matrix, preflight waiver and refusal cases, retry equivalence, the waived receipt flow, package smoke, and per-command help assertions. That plausibly exceeds the hard cap.

Suggest splitting by concern at creation — for example authority/CLI, preflight-and-retry, and receipt-and-docs — because deciding this at Task 7 invalidates the "extend the same file" instruction in four earlier tasks.

### P1-F008 — Name the exported token-builder signature

Task 2 says to "export that builder from `delivery-attribution.mjs` without changing `buildDeliveryCommitText`'s strict input contract." The builder is `buildCommitTextFromTokens(input, attributionTokens)`, and today its `input` is the already-validated object carrying all four `INPUT_KEYS` — though the body reads only `issueNumber`, `prNumber`, and `expectedHeadSha`.

Exported as-is, the exception evaluator would have to synthesize a `commitSubjects` field it does not use. Suggest naming the exported signature explicitly as `{ issueNumber, prNumber, expectedHeadSha }` plus tokens, and stating that the `MAX_COMMIT_TITLE_BYTES` and `MAX_DELIVERY_COMMIT_MESSAGE_BYTES` checks remain inside it so both callers stay bounded identically.

### P1-F009 — Keep `attributionDisposition` out of `commitText`

Task 2's evaluator returns `attributionDisposition` in the same object as the commit-text fields. In `delivery-preflight.mjs:370` the builder result is destructured as `const { metadataWarnings = [], ...commitText } = builtCommitText`, and everything remaining becomes `commitText`, which downstream feeds `buildDeliveryIntent`'s exact-key input check.

If the evaluator's result flows through that same destructuring unchanged, `attributionDisposition` lands inside `commitText` and trips `delivery-records:intent-input-keys`. Suggest one sentence in Task 5 stating that disposition and exception references are carried alongside `commitText`, never inside it.

### P1-F010 — Backfill attribution on the spec-revision commits

Outside the plan's scope but worth one line, since the plan pins one of them: `f761a9cc` and `0fc890a9` carry no `[#1755]` token. This repository's attribution is message-based — `commit-trace`, `review-preflight`, and `close` locate an issue's deliverable by grepping `\[#(\d+)\]` across commit messages — so the reviewed spec and its revisions will not attribute to #1755 at close time. Worth a backfill note or an explicit acknowledgment that documentation commits on this branch are attributed by the Task 1-7 commits instead.

## Summary of required changes

1. **P1-F001** — Replace `scripts/lib/self-doc.mjs` with the four real command-surface sites (`task-tracker.mjs` dispatch, `command-surface/routing.mjs`, `command-surface/catalog.mjs` including all three metadata maps, `verbs/help-data.mjs`), and add `command-manifest.test.mjs` and `command-catalog-policy.test.mjs` to Task 4's run set.
2. **P1-F002** — Add `npm run test:integration` to the Task 7 gate; `npm test` is the unit-only fast lane.
3. **P1-F003** — Require `// @story #1755` as the first line of each new test file, stated where each file is created.
4. **P1-F004** — Add `node scripts/task-tracker/verify-develop.mjs` to every commit step in Tasks 1-6.
5. **P1-F005** — Name whether the local reader is new or an amended `inspectCommitObject`, list the affected call sites if amended, and add a CRLF fixture.

## Decision

revisions-requested. The decomposition, task ordering, TDD structure, and interface contracts are accepted as written; all five required changes are additions to existing steps rather than rework. With them applied I expect to accept without a further round.
