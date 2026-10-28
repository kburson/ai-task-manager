# Native delivery recovery implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. The human explicitly requests re-plan, implementation and native Done in this turn; continue through authorized Full-Auto without another planning pause.

**Goal:** Fix the two verified delivery blockers within #2098 and complete its own native delivery and Close.

**Architecture:** Keep ordinary authorized provider bytes exact. External recovery may recognize the exact canonical governed title/message for another issue in the complete source attribution set, with no malformed, extra, partial, duplicated or reordered-tail claims. Resolve merge SHA from the actual adapter shape before topology observation. Ship the correction in a new #2098-only PR based on already-delivered trunk9d854fab; renew native acceptance for this new source rather than manufacture an old-source receipt.

**Tech Stack:** Existing Node delivery verifier, delivery verb, actual deterministic delivery harness and native AITM.

**Spec:** Human directive2026-10-27T23:23:06Z, live #2098 Scope and blocker commentIC_kwDOSU6LgM8AAAABgMEOAg.

## Global Constraints

- Only #2098; no new repair stories, R1, old aggregate release or new authority store.
- Preserve original #2091 CLOSED/Done, its source16f receipt/Close and immutable PR #2114 squash9d854fab. Do not reopen, reaccept or merge it again.
- Retain omitted-rank behavior, actual operator identity, exact source/tree, required CI, content/topology/trunk checks, review provenance and all eight Close checkpoints.
- Keep historical Unknown, retained worktrees, branches and stash6e349c6a. Old source and approvals are history, never acceptance of the new correction.
- Keep published manual M/6h estimate as history; no GitHub-history/rubric estimates.
- Attached worktree remains2098-rank-delivery. New correction branch codex/2098-delivery-recovery starts at9d854fab6c87ee6fe4d750974113bca73f3093cf. Existing draft branch remains unchanged.

## Story Intent

- Beneficiary: Delivery owner.
- Capability: Verify canonical shared-source delivery recovery and real adapter reconciliation, then close #2098 with its own correction receipt.
- Need: Issue-first comparison falsely rejects another attributed issue's valid governed bytes; current-head reconciliation reads an absent flat merge SHA.
- Value or failure prevented: Finish safely without forged receipts, duplicate merges, waived guards or orphaned original work.

## Review Focus

1. A different primary issue must be in the complete source token set and its entire canonical title/message must match; matching token sets alone are insufficient.
2. Duplicate, missing, foreign, partial, whitespace-disguised or nonterminal claims still refuse; ordinary provider authorization remains byte-exact.
3. GitHub mergeCommit.oid must work in current-head reconciliation; wrong method, missing SHA and competing SHA facts must not be silently accepted.
4. Recovery and Close must replay the same observed commit bytes/content without claiming an earlier intent for the recovering issue.
5. The correction itself uses a new PR and fresh acceptance, complete CI, own receipt and native Close; prior #2091 Done remains untouched.

## Task 1: Correct and qualify the actual recovery path

**Files:** scripts/task-tracker/lib/delivery-verification.mjs; scripts/task-tracker/verbs/deliver.mjs; existing delivery-verification-attribution.test.mjs and deliver reconciliation tests; neutral GraphQL inventory line offsets caused by the delivery edit; this plan and workflow delivery documentation.

**Interfaces:** Existing verifyExternalDeliveredPullRequest and runDeliver consume genuine provider-shaped data; output stays existing v5 intent/receipt with exact observed bytes. No schema or policy exception.

- [ ] Run focused clean baseline before source edits.
- [ ] Add RED regressions for secondary-issue canonical recovery, replay of its receipt, wrong title/PR/source/token/tail order refusal, and ordinary pending-intent byte mismatch.
- [ ] Add RED runtime current-head reconciliation case with mergeCommit.oid only; assert delivered receipt, zero provider action and truthful method. Retain missing/conflicting SHA and declared-not-observed refusal.
- [ ] Implement minimal changes. Canonical secondary-owner recognition is allowed only in external recovery: derive owner from the exact governed title, require membership in source tokens, build its canonical bytes using buildCommitTextFromTokens and compare full title/message. All other authorization remains unchanged.
- [ ] Normalize current-head merge SHA from flat or nested facts and refuse disagreement; use it for observation and reconciliation record.
- [ ] Run GREEN focused, full fast/slow CI, lint/format; commit only #2098 correction and docs. One fresh independent whole-diff review, one bounded RED/GREEN fix pass for material findings.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-reconcile-args.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-historical-reconstruction.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-receipt-authority.test.mjs
npm test
npm run lint
npm run format:check
```

Expected: actual runtime regressions fail before production changes and pass afterward; no existing refusal is weakened. Full exact-source hosted CI must include slow coverage and CodeQL with unexpired artifacts.

## Task 2: Deliver and close the new correction natively

**Files:** Live #2098 acceptance/review/delivery/Close records and #2095 progress table.

**Interfaces:** Consume Task1 immutable correction source/tree and actual new PR; produce its own v5 receipt and complete eight-step native Close.

- [ ] Governed Review rejection returns #2098 to Develop for real code rework. Update Scope/plan/deep dive/AC/VC natively; preserve old proof as historical rather than editing private markers.
- [ ] Keep original #2091 closure AC true, but renew every demonstrable rank/recovery AC for the new source.
- [ ] Commit trace, exact-source native Test/Review, explicit Full-Auto approval, complete CI and new PR ready.
- [ ] Fresh delivery Explain; native deliver authorizes at most one exact expected-head provider action. Use only sanctioned integration, then reconcile live-verified receipt.
- [ ] Fresh Close Explain, native Close, live CLOSED/boardDone plus all eight transaction steps including released binding.
- [ ] Update #2095 at start, concrete blocker/completion and final verification. No other story is activated.

**Verification Commands:**

```sh
gh issue view 2098 --json state,closedAt,projectItems,body
gh issue view 2091 --json state,closedAt,projectItems
```

Expected: #2098 CLOSED/Done with new-source complete transaction; original #2091 still CLOSED/Done. Tests, approval and merge alone are not Done.

## Execution rulings

The current human explicitly authorizes re-planning and correcting the two blockers inside #2098. Execute this bounded recovery inline. Native lifecycle has a Review-to-Develop rework lane, not a Develop-to-Plan rewind; use the genuine rework lane and record the revised plan/deep dive without fabricating a second Plan-stage approval. Refresh final acceptance for the correction source.

A native start audit used allow-foreign-worktree solely to renew the branch identity in the same human-authorized attached worktree after ordinary start refused the old branch binding. No foreign worktree was read or mutated and no lifecycle, source-proof or delivery check was overridden.
