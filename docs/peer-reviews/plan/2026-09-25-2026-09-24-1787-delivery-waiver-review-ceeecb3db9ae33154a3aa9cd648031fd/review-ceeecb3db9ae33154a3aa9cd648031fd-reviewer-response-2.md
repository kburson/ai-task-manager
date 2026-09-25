<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-ceeecb3db9ae33154a3aa9cd648031fd"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md"
artifact_commit: "5b1a4d91e4340b2a828d0dcd9ee24430bb0304fc"
artifact_blob: "bfc352b5725916f1fbb465dcf1b3dba13ddb98bc"
artifact_digest: "sha256:785478b50d21c6001388c6edabca76470d99569f5cdde11be5dc326f2d09a6c0"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:5878eb25697e893a7581029def457f247da3366e6d148ecb1c145c9864d0ebfa"
  identity_source: "declared"
started_at: "2026-09-25T02:04:02.812Z"
submitted_at: "2026-09-25T02:25:08.299Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Round 2 review of the revised plan at commit `5b1a4d91`, blob `bfc352b5`, SHA-256
`785478b50d21c6001388c6edabca76470d99569f5cdde11be5dc326f2d09a6c0`. I re-read the whole
artifact (529 lines) rather than relying on the author response's change list, and
independently re-verified each claimed fix against the live tree. The sealed spec digest
`bcc6d2bf1f6b8ff50d3c1de1e38e3079a749ce3d7ead82656fba987e742f8ddb` is unchanged, and no
task now asks for a spec behavior change.

All four required changes are resolved, and all five optional suggestions were adopted.

**Required change 1 — integration lane (resolved).** Line 486 adds
`npm run test:integration` to the Task 11 command block, between `npm test` and
`npm run test:slow`. Line 492 adds the disposition I asked for: the focused three-file
command is retained as the new-feature check, the full lane then runs, and no suite is
excluded — naming workflow-exception/preflight, ordinary deliver-close, #1755, external
recovery, and package-workflow-exception regressions explicitly. That closes the
false-green path, since `package.json:21` is `--lane fast` and `scripts/run-tests.mjs:19`
documents that lane as unit-only.

**Required change 2 — input-contract capability split (resolved, option (a)).** Line 206
maps `input` and `input-keys` to a new `delivery.verification.input-contract` in
`delivery-waiver-guardrail` with both capability flags false, leaves
`merge-before-intent`/`intent-created-at` on `intent-integrity`, and restates the count as
eight disclosure-only plus four guardrails. I checked the arithmetic: the spec's
eleven-row table plus this one split is twelve IDs, minus four guardrails
(`input-contract`, `merge-method-evidence`, `attribution-waiver-authority`,
`waiver-authority`) is eight eligible. Consistent.

The executable half is there too. Line 220 adds negative fixtures that hold a *valid*
`delivery.verification.intent-integrity` grant and still refuse under `input-contract`,
covering all five raise sites I cited: missing verifier functions
(`delivery-verification.mjs:575`), non-object PR/intent input (line 179), bad exact keys
(lines 728, 745), invalid `recovery` (line 730), and malformed external `intentInput`
(line 753). Line 417 binds the verifier side: all `input`/`input-keys` raises use the
non-waivable mapping "including the ordinary and external verifier entrypoints." Line 220
additionally orders the structural guards before any eligibility evaluation, which is the
part that makes the capability decision real rather than nominal.

**Required change 3 — reorder precedence (resolved).** The contradiction is gone and
replaced with a three-way split of responsibility. Line 184 keeps the blanket
"categories/exit behavior unchanged" promise only for *single-failure* fixtures and
separately labels three reorder-sensitive multiple-failure fixtures, recording their
current `merge-method` outcome while explicitly stating those three "are not a promise of
unchanged error precedence." Line 221 narrows Task 2's re-run to what is actually true
there — Task 2 is mapping-only, so no category moves. Line 418 gives Task 8 ownership of
the rebaseline in the same commit as the reorder, with the new expectations enumerated.

I verified all three enumerated outcomes against the source rather than taking them:

- mismatch plus invalid merge SHA now surfaces `merge-commit-sha`
  (`delivery-verification.mjs:202-205`, previously preempted by the equality at line 199);
- mismatch plus invalid `mergedAt` now surfaces `merged-at` (line 206);
- mismatch plus otherwise-valid but unknown topology now surfaces `merge-method-unknown`
  (line 663), which the spec's table maps to the hard
  `delivery.verification.merge-method-evidence` ID exactly as the plan states.

The third case is also constructible with existing harness knobs, which I checked because
an unreachable fixture would have been a defect: `historyMergeMethod: 'squash'` yields
one-parent topology (`deliver-test-harness.mjs:328`), and with a non-squash intent the
squash-recovery branches at `delivery-verification.mjs:654-661` all decline
(`provider !== 'external'`), so `observedMergeMethod` resolves to `'unknown'` and line 663
fires. Line 420 correctly narrows the preservation claim to "apart from the explicitly
enumerated spec-required merge-observation precedence changes," and line 492 states the
rebaseline is intentional rather than a weakening of the gate.

**Required change 4 — unresolved publication (resolved, terminal-state option).** Line 55
is a new paragraph in the Consumption Serialization Decision that states the contract
plainly: no force-republish or abandon-and-replace exists; a `receipt-requesting`
operation has spent its approval and an `intent-requesting` one has not; both retain the
reservation and prohibit replacement; the failure is emitted as the typed hard guardrail
`delivery-waiver-ambiguity` with `outcome: 'indeterminate'`, operation ID, pending stage,
and bounded escalation instructions; a later exact original comment may still reconcile
read-only; and empty listings, elapsed time, or an operator's assertion never unlock a
replay. That category and outcome match the spec's resolver registry (spec lines 218-219),
and the hard `delivery.verification.waiver-authority` mapping is preserved. Task 6
line 359 makes it executable — asserting it is neither `missing` nor idempotent success,
that no POST/new operation/terminal write occurs, and that Task 10 preserves the fields in
operator output — and Task 11 line 478 requires documenting the availability limitation
explicitly, including that burned approval stays spent. Choosing disclosure over an
invented "the POST definitely did not happen" proof is the right call for at-most-once
publication.

**Optional suggestions.** All five were taken. Lines 172-178 now pin
`error.category === 'merge-method'` through the `assert.rejects` validation-function form
instead of a regex that would also match `merge-method-evidence`/`-observation`/
`-unknown`/`-unattributable`. Line 400 names
`GENERIC_WAIVER_VERIFICATION_INPUT_KEYS = [...VERIFICATION_INPUT_KEYS, 'genericWaiverEvidence']`,
forbids widening `WAIVED_VERIFICATION_INPUT_KEYS`, and enumerates the v3-without-evidence,
v2-with-evidence, mixed-evidence, unknown-schema, and extra-key refusals under
`input-contract` — structurally parallel to the existing `WAIVED_VERIFICATION_INPUT_KEYS`
definition at `delivery-verification.mjs:41`. The authority module is renamed to
`workflow-policy/delivery-waiver-authority.mjs` at all three references (lines 68, 107,
294) with no stale occurrence of the colliding basename anywhere in the plan. Lines 294
and 321 add fixture-only helpers (`delivery-waiver-authority-fixtures.mjs`,
`delivery-waiver-consumption-fixtures.mjs`, `delivery-waiver-journal-harness.mjs`) with an
explicit 800-code-line cap and "helpers register no tests"; I confirmed this is gate-safe
rather than assuming it — `discover-test-files.mjs` discovers only `*.test.mjs`, so the
helpers are outside `lint:line-cap`, `lint:story-tags`, and `lint:test-layout`, and
`audit-test-entrypoint-imports.mjs:78` only flags a discovered entrypoint importing
another *discovered* entrypoint, so the "register no tests" rule is precisely what keeps
those imports legal and the named suite commands accurate. Line 478 documents journal
branch growth, default-refspec visibility in clones, and display filtering without
implying deletion or automatic configuration changes.

On the author response's own claims: its statement that the accepted spec is unchanged
matches the artifact, and its Verification section is appropriately scoped — it claims
document-level formatting/lint checks, the exact-category characterization, and existing
record/verifier/close/envelope suites, while stating plainly that the proposed schemas,
journal transport, and integration tests remain future implementation work with no real
journal ref or live waiver exercised. I did not re-run those suites; my acceptance rests on
the artifact's content and my own source verification, not on that execution claim.

Nothing in the revision introduced a new defect. The three items below are refinements an
implementer can absorb during Task 8 and Task 10; none changes a decision, a schema, or a
gate, so I am not holding acceptance for them.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. There is a fourth reorder-sensitive precedence pair that the labelled set omits:
   provider/intent method mismatch plus *unavailable or malformed* topology evidence. Today
   the equality at `delivery-verification.mjs:199` preempts it; after the Task 8 reorder it
   surfaces `merge-method-evidence` — from the `inspectMergeCommit` failure wrapper at
   line 622, or from `classifyMergeMethod`'s structural guard at line 222. Line 417 already
   declares "unavailable evidence" a hard refusal and line 418 asks for
   disagreement/invalid-provider hard-guard fixtures, so the behavior is correct either
   way; the gap is only that this pair is not in Task 1's labelled three, so an implementer
   who baselines it will meet an unlabelled category change in Task 8. Adding it as a
   fourth labelled fixture with expected `merge-method-evidence` would make the enumeration
   exhaustive over the pre-equality throw sites.

2. Line 400 admits the new key set for "validated fresh v1-original/v3-candidate or pinned
   v3 inputs," but the live selector is schema-only: `verifyDeliveredPullRequest` picks
   between two key sets with a ternary on `input.intent?.schema`
   (`delivery-verification.mjs:724-728`), and `hasExactKeys` is strict. On the fresh
   pre-burn attempt that Task 8's own fixture describes (lines 402-414), `input.intent` is
   the original **v1** intent while `genericWaiverEvidence` is present, so a schema-only
   selector would pick `VERIFICATION_INPUT_KEYS` and refuse under `input-keys` before any
   validation runs. Stating that selection keys on the pair
   `(intent.schema, presence of genericWaiverEvidence)` — and that v1-plus-generic-evidence
   is exactly the fresh admission while v1-without-it keeps its existing set — would remove
   the only ambiguity I found in the new paragraph.

3. Task 6 line 359 ends with "Task 10 must preserve these fields in operator output," but
   Task 10's own checkboxes stop at "Render ... blocked, and indeterminate distinctly" with
   "structured category/requirement/outcome fields" (line 468) and "Test `indeterminate` is
   not rendered as missing or passed" (line 469). Since Task 10 owns the renderer tests,
   restating the specific assertions there — pending stage, operation ID,
   burned-versus-reserved approval state, and the bounded escalation text — would keep the
   new terminal contract from depending on a forward reference from another task.

## Decision

accepted
