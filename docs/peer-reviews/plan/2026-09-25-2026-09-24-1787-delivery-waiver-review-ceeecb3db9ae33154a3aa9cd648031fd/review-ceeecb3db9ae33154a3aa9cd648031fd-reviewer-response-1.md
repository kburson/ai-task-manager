<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-ceeecb3db9ae33154a3aa9cd648031fd"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md"
artifact_commit: "7caf638d4aea750e86a8fd5d6745c4c5f89342c7"
artifact_blob: "d4a8d182ad8340452f61d410df19e12d8eb80042"
artifact_digest: "sha256:3d513a3943596389d27e283b93bdec93dd51638e3c502993947804ea4ce42618"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:5878eb25697e893a7581029def457f247da3366e6d148ecb1c145c9864d0ebfa"
  identity_source: "declared"
started_at: "2026-09-25T02:04:02.812Z"
submitted_at: "2026-09-25T02:11:23.173Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Independent review of `docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md` at
blob `d4a8d182ad8340452f61d410df19e12d8eb80042` against the accepted spec
`docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md` (`b02b4b2`) and the
live tree in this worktree.

Verification performed (read-only; no artifact edits, no Git operations, no remote refs):

- Every file named in the File Map, Task Files lines, and Task 11 command block exists at
  the stated path. All 14 existing test files the plan extends or re-runs exist.
- `scripts/task-tracker/lib/workflow-policy/catalog.mjs` confirms exactly ten
  `delivery-invariant` entries (lines 18-27), `item(id, family, waivable)` with three keys
  (line 3), and `validateWaiverIds` refusing non-waivable IDs (lines 75-81). The plan's
  "eight eligible / three guardrail" split matches the spec's eleven-row table exactly.
- `scripts/task-tracker/lib/delivery-verification.mjs` confirms the unexported
  `VERIFICATION_DIAGNOSTICS` with three entries (line 75), the `...details`-last spread in
  `DeliveryVerificationError` (lines 94-100, which is what makes Task 2's
  "callers attempting to override an error's requirement ID" test meaningful), and 25
  distinct `verificationError(...)` categories. All 25 are covered by the spec's mapping
  table, so Task 2's coverage test is satisfiable.
- `resolveWorkflowExceptionAuthority` (authority-resolver.mjs:46) and
  `createCodexSessionSourceLoader` (line 90) exist as claimed.
- `pullRequest.mergeMethod ?? intent.mergeMethod` exists at
  `close-delivery-receipt.mjs:196`, so the coercion Task 10 removes is real and located.
- `makeHarness`/`deliver`/`mergePendingIntent` exist in
  `scripts/tests/unit/task-tracker/verbs/deliver-test-harness.mjs`; `calls.createIssueComment`
  is an integer counter (lines 56, 255), so Task 1's write-count assertion is sound;
  `mergePendingIntent` sets `prState = 'MERGED'` (line 392) and `pullRequest.mergeMethod`
  is surfaced only when merged (line 207), so the fixture mutation order in Task 1 works.
- `PREFLIGHT_MODE` (task-tracker.mjs:179) has no `workflow-exception` entry today, so the
  plan's "must retain no entry" constraint is a preservation, not a change.
- `package.json` `files` packs `scripts/`, `skill/`, and `docs/guides/` and excludes
  `**/*.test.mjs` and `docs/superpowers/plans/`, so the Task 11 packaging claims hold.
- `scripts/tests/tools/audit-test-layout.mjs` + `test-lanes.mjs:17-31` only reject test
  files sitting directly under `scripts/tests/<lane>/`; the plan's
  `scripts/tests/integration/task-tracker/delivery-waiver-merge-method.integration.test.mjs`
  has a `/` in its lane-relative path and therefore passes `lint:test-layout`.

Overall this is an unusually well-grounded plan. Task decomposition matches the spec's
section boundaries, the ULID/scope-digest/write-digest derivation order is correct and
acyclic, `burnOid` is derived from the commit that first records the burn (avoiding the
self-hash the spec warns about), the pinned-historical versus current-authority split is
consistently enforced, and the #1783 Option B boundary is respected rather than quietly
dropped. The remote-journal consumption backend is honestly labelled as a plan-level
implementation choice with a two-clone proof obligation before wiring.

Four issues block acceptance. Three are concrete defects in the plan's own verification
contract or capability model; one is a hole in a behavior the plan requires Task 11 to
document but no task defines. None require reopening the sealed spec: the spec explicitly
permits finer ID splits, explicitly mandates the merge-method reorder, and does not
constrain the plan from adding a verification lane command.

## Findings

1. **Task 11's full-contract verification never runs the integration lane, so four
   mandated integration suites are not covered by the acceptance gate.**
   `package.json:21` defines `"test": "node scripts/run-tests.mjs --lane fast"`, and
   `scripts/run-tests.mjs:19` documents `--lane fast (default) — unit only (the
   deterministic local regression floor)`. `npm run test:slow` is the slow lane. The
   integration lane is reachable only through `npm run test:integration`
   (`package.json:23`), which the Task 11 command block omits.

   The consequence is not hypothetical. Tasks 4, 5, 9, and 10 require extending
   `scripts/tests/integration/task-tracker/verbs/workflow-exception.test.mjs`,
   `workflow-preflight.test.mjs`, and the deliver/close integration surface, and Task 11
   itself requires "Include ordinary delivery and #1755 in the same regression run" and
   "existing external recovery fixtures remain unchanged." The existing regressions that
   would prove those claims — notably
   `scripts/tests/integration/task-tracker/verbs/deliver-close.integration.test.mjs` and
   `scripts/tests/integration/task-tracker/lib/package-workflow-exception-smoke.test.mjs` —
   are in the integration lane and are never executed by the listed commands. Only the
   three new integration files are run, via their explicit `node --test` line. A
   regression introduced in Task 9 or 10 to ordinary delivery-close integration behavior
   would pass the plan's final gate.

   Note the sealed spec's suite list has the same omission, but the spec presents those as
   "the right eventual focused suite names," not an exhaustive gate, so fixing this is a
   plan-level tightening and does not require reopening the spec.

2. **`input` and `input-keys` are mapped to a disclosure-eligible requirement ID, making
   verifier argument-shape refusals nominally waivable — which Task 8 simultaneously
   declares must stay hard.**
   The spec's starter table maps `merge-before-intent`, `intent-created-at`, `input`, and
   `input-keys` to `delivery.verification.intent-integrity`, and Task 2 classifies exactly
   three IDs as guardrails (`merge-method-evidence`, `attribution-waiver-authority`,
   `waiver-authority`), leaving `intent-integrity` as one of the eight disclosure-only
   IDs. But in the live source, `input` and `input-keys` are raised at sites that have
   nothing to do with intent integrity:

   - `delivery-verification.mjs:575` — `assertVerificationFunctions` rejects a caller that
     failed to inject `fetchOriginTrunk` / `isAncestor` / `inspectMergeCommit` /
     `attributingCommits`.
   - `delivery-verification.mjs:728` and `730` — `verifyDeliveredPullRequest`'s exact-key
     and `recovery`-boolean validation of its own argument object.
   - `delivery-verification.mjs:745` and `753` — the same for
     `verifyExternalDeliveredPullRequest` and its `intentInput`.
   - `delivery-verification.mjs:179` — `assertMergedPullRequest`'s non-object guard.

   Task 8 states "invalid input needed by subsequent checks, and all authority self-checks
   remain hard refusals," but the catalog ID is the only ID-level authority in the design,
   and `evaluateDeliveryPredicate({ category, observedFailure, waiver, failures })`
   receives a category and consults eligibility by requirement ID. With one shared
   disclosure-eligible ID there is no mechanism to accept a waiver for
   `merge-before-intent` while refusing one for `input-keys`, and the plan specifies none.
   An operator with a validly recorded `delivery.verification.intent-integrity` grant
   would be presented, on paper, with a waivable path over the verifier's own input
   contract — precisely the "hidden pass" risk the spec names as the main product risk.

   The spec permits the fix inside this plan: "Implementation may split IDs more finely if
   tests show a predicate needs a separate operator decision."

3. **The mandated merge-method reorder does change ordinary refusal categories, so Task 2's
   and Task 8's "categories remain stable" instructions are unachievable as written.**
   Today the provider-versus-intent equality check throws at
   `delivery-verification.mjs:198-200`, inside `assertMergedPullRequest`, *before*
   `merge-commit-sha` (line 204), `merged-at` (line 206), and long before Git topology is
   derived (`classifyMergeMethod`, lines 210-227, reached near line 663). Task 8 correctly
   implements the spec's requirement to "Move method equality after independently
   collecting valid optional provider metadata and known Git topology."

   For any fixture where a second predicate also fails, that move changes the observed
   category: a merged PR with `mergeMethod: 'merge'`, intent `squash`, and a malformed
   `mergeCommitSha` refuses `merge-method` today and `merge-commit-sha` afterwards; the
   same PR with unknown topology refuses `merge-method` today and
   `merge-method-evidence` afterwards. Yet Task 1 instructs "Expect the characterization to
   pass against the current behavior," Task 2 instructs "Re-run Task 1 to verify ordinary
   refusal categories remain stable," and Task 8 instructs "Preserve ordinary and
   attribution-waiver control flow." An implementer following those literally will either
   weaken the Task 8 reorder to keep Task 1 green, or silently edit the characterization
   baseline — the exact failure mode Task 11 forbids ("Fix failures in the owning task
   rather than weakening expected refusals").

   The plan needs to declare the reorder as an intentional, enumerated category change and
   name where the baseline is re-established.

4. **No task defines the "unresolved-publication remediation" that Task 11 is required to
   document, and the design as written can strand a burned operation permanently.**
   The Consumption Serialization Decision states: "An unresolved request remains
   `indeterminate`, with no automatic timeout takeover or replacement operation," and Task
   6 states "Later invocations may reconcile either pending request but cannot POST it
   again based solely on an empty comment listing." So after a confirmed `burned` →
   `receipt-requesting` transition whose comment POST outcome is genuinely unknown and
   whose comment does not exist, there is no described path forward: the burn is spent, the
   operation cannot be replaced, the receipt cannot be re-POSTed, and `deliver`/`close`
   refuse on `indeterminate`. Task 11 nonetheless requires documenting
   "unresolved-publication remediation" — a behavior no task specifies or tests.

   The word "solely" in Task 6 hints at some additional evidence that would permit a
   re-POST, but nothing in the plan says what that evidence is, who supplies it, or which
   task implements it. This matters disproportionately because the spec's stated problem is
   an operator whose issue is "permanently stranded"; shipping a new terminal stranded
   state in the fix would be a regression against the design's purpose. Either specify the
   remediation and assign it to a task, or state explicitly that this state is terminal,
   that the approval is spent, and what the human escalation is — and test that the
   operator-facing output says so.

## Required changes

1. Add `npm run test:integration` to the Task 11 command block (Finding 1), placed with
   `npm test` and `npm run test:slow`. Keep the explicit `node --test` line for the three
   new integration files or drop it as redundant, but state which, so the recorded evidence
   in Task 11 is unambiguous. If any newly extended integration suite is intentionally
   excluded from the lane, say so and why.

2. Resolve the `input` / `input-keys` capability collision (Finding 2) by either:
   (a) splitting those categories into a separate `delivery-waiver-guardrail` requirement
   ID with both capabilities false — this is the cleaner option and is expressly permitted
   by the spec's finer-split clause — and updating Task 2's guardrail count from three to
   four plus its category-to-ID table; or
   (b) specifying, in Task 2 and Task 8, the exact per-raise-site predicate that makes
   `merge-before-intent` / `intent-created-at` eligible while `input` / `input-keys` are
   not, and adding a negative test that a valid `delivery.verification.intent-integrity`
   grant cannot suppress the refusals at `delivery-verification.mjs:575`, `728`, `730`,
   `745`, and `753`.
   Either way, add the negative test; the capability decision must be executable, not
   prose-only.

3. Replace the "ordinary refusal categories remain stable" instructions (Finding 3) with an
   explicit reorder contract:
   - In Task 1, mark which characterized categories are reorder-sensitive rather than
     asserting blanket stability.
   - In Task 8, enumerate the intended category changes (at minimum: equality-plus-bad-merge-SHA,
     equality-plus-bad-`mergedAt`, and equality-plus-unknown-topology) and state that Task 8
     owns re-baselining those characterization assertions in the same commit as the reorder.
   - Keep the genuinely invariant guarantee narrow and testable: for a single-failure
     no-grant fixture, the observed category and exit behavior are unchanged.

4. Close the unresolved-publication hole (Finding 4). Add to Task 6 (behavior + tests) and
   Task 11 (documentation) either the concrete remediation — what evidence permits a
   re-POST after an uncertain publication, who authorizes it, and how it is distinguished
   from a replay — or an explicit terminal-state contract stating that the approval is
   spent, that no replacement operation is minted, and what the operator's escalation is.
   Include a test asserting the operator-facing output distinguishes this state from both
   `missing` and a successful idempotent return.

## Optional suggestions

1. Task 1's characterization asserts the refusal with
   `/delivery-verification:merge-method/`, which also matches `merge-method-observation`,
   `merge-method-evidence`, `merge-method-unknown`, and `merge-method-unattributable`. Since
   this is the baseline for the predicate Task 8 reorders, pin the exact category instead —
   `DeliveryVerificationError` exposes `.category` (`delivery-verification.mjs:106`), so
   `assert.equal(error.category, 'merge-method')` inside `assert.rejects` is precise and
   survives message-format changes.

2. `verifyDeliveredPullRequest` picks its exact-key set from the intent schema
   (`delivery-verification.mjs:723-728`) with only two branches, and `hasExactKeys` is
   strict. A v3 intent carrying new generic-waiver evidence will fail `input-keys` until a
   third key-set constant exists. Task 8's Interfaces section describes only the return
   contract; naming the new input key set (alongside `VERIFICATION_INPUT_KEYS` and
   `WAIVED_VERIFICATION_INPUT_KEYS`) would make the boundary explicit and stop an
   implementer from widening the existing waived set and accidentally admitting #1755
   evidence on the v3 path.

3. Task 5 creates `scripts/task-tracker/lib/workflow-policy/delivery-authority.mjs` while
   `scripts/task-tracker/lib/delivery-authority.mjs` already exists. The basenames are
   identical, which will make import sites and review diffs ambiguous. Consider
   `workflow-policy/delivery-waiver-authority.mjs`.

4. `npm run lint:line-cap` (`scripts/tests/tools/audit-line-cap.mjs:13`) hard-fails any
   `*.test.mjs` above 800 code lines, and it runs inside the `npm run lint` that Task 11
   executes. Tasks 5 and 6 each enumerate well over thirty distinct cases plus fixtures in
   a single new file, and Task 6 additionally needs two-clone harness scaffolding and five
   crash checkpoints. Pre-authorizing a named split (for example a
   `delivery-waiver-authority/` subdirectory of focused files) would avoid discovering the
   cap at the end of Task 11 — and because the Task 11 command block and the spec's suite
   names list exact single filenames, a late split also invalidates the recorded command
   evidence.

5. The plan is silent on the journal branch namespace's long-term footprint: one durable
   `refs/heads/aitm/delivery-waivers/<issue>` per waived issue, fetched into every clone by
   the default refspec, with cleanup explicitly unsupported (Task 11). That is a defensible
   audit-data decision, but stating the expected growth and the recommended fetch/display
   posture in the Task 11 documentation would spare operators a surprise.

## Decision

revisions-requested
