## User Story

As a delivery owner
I want to revise approved acceptance criteria through an explicit evidence-invalidating operation because changed requirements can contradict previously declared verifiers
So that the corrected deliverable can be verified without carrying obsolete proof or bypassing lifecycle gates

## Scope

Repair the governed issue-body workflow for an explicitly approved change to acceptance criteria after planning. Keep ordinary marker-loss protections intact. Provide a bounded, auditable operation that can replace obsolete criteria without copying verifier declarations, ticks, or proof onto new text.

Observed blocker: ai-peer-review [#124](https://github.com/kburson/ai-peer-review/issues/124) changed from per-command model hooks to startup/resume session handshakes at the user's direction. Scope, Fix Direction, User Story, and the linked plan reflect that decision. Its four obsolete hook criteria remain unchecked with old verifier declarations. Removing those declarations while replacing the criteria is refused. The story cannot legitimately meet the old criteria and its required Test gate remains blocked.

Require exact fresh-body preconditions, attributable approval and a reason. Archive prior criteria, declarations, completion state, and evidence before invalidation. Distinguish verifier declarations from execution receipts. Invalidate affected current evidence and approvals without losing history or unrelated authority; subsequent gates must require corrected scope and fresh verification. No generic invariant-disable option.

The separate agent should investigate, prepare a reviewed design and implementation plan, then follow normal implementation, verification, review, and delivery gates. The user will start that agent. This filing does not authorize modifying downstream live criteria or any AITM #1841 review records.

## Reproduction

1. Use a Develop-state issue whose approved revised scope contradicts its criteria. ai-peer-review #124 records the superseding direction in `scope.session-handshake-v1`.
2. The obsolete criteria are unchecked and carry `aitm-verified vc-list` declarations, for example vc:1 and vc:4. These declarations are not execution receipts; do not mark obsolete criteria complete.
3. Prepare schema `aitm.issue-body-operation/v1`, kind `replace-exact`, with the exact old Acceptance Criteria section as expected and new unchecked criteria without inherited annotations/proof as replacement. The preserved consumer input is `.scratch/gh/124-handshake-ac-operation.json` in #124's recorded worktree.
4. With exact binding/worktree and active timing, run `npx aitm issue-body 124 --operation-file .scratch/gh/124-handshake-ac-operation.json`.
5. Actual: exit 1, `task-tracker error: issue-body:protected AITM markers changed`; body unchanged.
6. `npx aitm test 124` refuses at entry preflight with `unclassified-refusal` (observed exit 3). Explain reports `develop-exit-code-complete`, no automatic remediation, and human investigation required.

Earlier automatic approval review rejected rewriting criteria while retaining their obsolete declarations. Copying them to new text or bypassing Test is not a valid repair. Reproduce with fixtures, not by mutating the live consumer issue during implementation.

## Root Cause

Confirmed: preserveAitmMarkers requires exact count and ordered equality of all AITM HTML comments before and after an ordinary issue-body operation. It throws protected AITM markers changed when obsolete verifier declarations are intentionally removed. The guard protects ordinary writes correctly; the shipped command has no supported criteria/evidence revision operation.

The assigned agent must investigate scope/plan digests, legacy declarations versus evidence v2, approval authority, affected Test/Review receipts, durable audit records, and failure recovery. The observed blocker is confirmed; the final transaction protocol requires a reviewed design.

## Fix Direction

Design a bounded criteria/scope revision transaction using existing fresh-base mutation, approval, audit-record, and exact-read-back machinery. Require exact issue scope, reason, and attributable authorization. Preserve old evidence historically, invalidate affected current authority honestly, and initialize new criteria unchecked. Preserve ordinary marker-loss guards. Expose a typed supported Explain path and prove the #124-shaped fixture can proceed through normal Test gates. Do not solve this with raw GitHub edits, stale proof retention, waiver flags, or a consumer-specific patch.

## Out of Scope

ai-peer-review code/package work; AITM #1841 review records; automatic replacement of live downstream criteria; evidence fabrication; generic invariant-disabling escape hatches; lifecycle stage skips; unrelated refactors. No AITM source implementation is authorized in the filing session.

## Story Origin

- **kind**: code
- **discovered-during**: User-authorized continuation of kburson/ai-peer-review #124 and PR #125 on 2026-09-29 America/Chicago.
- **root-cause-surface**: `scripts/task-tracker/verbs/issue-body.mjs::preserveAitmMarkers`; confirmed in the installed consumer package and current AITM source.
- **related**: https://github.com/kburson/ai-peer-review/issues/124 and https://github.com/kburson/ai-peer-review/pull/125.
- **classification**: defect in the governed scope-correction workflow, not an internal-only refactor or weakening of evidence protections.
- **authorization**: User requested filing this defect and will start a separate agent to plan and execute.

## Plan Metadata



## Pickup Directive — MANDATORY, DO NOT SKIP

> Follow: `.ai-task-manager/templates/pickup-directive.md`

## Acceptance Criteria

- [ ] An authorized, reasoned, exact-precondition revision succeeds for the reproduced Develop-state fixture with obsolete verifier declarations; replacement criteria are unchecked and inherit no old completion or proof. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] A durable attributable audit preserves prior criterion text, verifier declarations, ticks, evidence, and the replacement; declarations and proof receipts are handled distinctly. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] Changed criteria cannot reuse old AC receipts or affected derived approvals and Test/Review evidence; unrelated authority is preserved and lifecycle gates require corrected scope and fresh verification. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] Unauthorized, stale, ambiguous, foreign-issue/worktree, partial, and conflicting revisions fail closed; crash/retry and exact read-back preserve one auditable outcome. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] Ordinary issue-body edits still refuse protected-marker loss, proof laundering, and unauthorized checkbox/evidence changes; no generic bypass or stage skip is introduced. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] Help, task guidance, and typed Explain identify the supported revision path, approval boundary, invalidation effects, and recovery; a #124-shaped fixture continues only through normal verification. <!-- aitm-verified vc-list="vc:1 vc:2 vc:3" -->

## Verification Commands

- [ ] `node --test scripts/tests/unit/task-tracker/verbs/issue-body.test.mjs scripts/tests/unit/task-tracker/lib/mutate-issue-body-marker-loss.test.mjs scripts/tests/unit/task-tracker/lib/checkbox-proof-marker.test.mjs scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs` <!-- id=1 -->
- [ ] `node --test scripts/tests/integration/task-tracker/lib/issue-body-verifier.test.mjs` <!-- id=2 -->
- [ ] `node --test scripts/tests/unit/task-tracker/core/mutate-issue-body-scripts-help-audit.test.mjs scripts/tests/unit/task-tracker/core/docs-issue-body-forbiddance.test.mjs` <!-- id=3 -->
- [ ] `npm test` <!-- id=4 -->
- [ ] `npm run test:slow` <!-- id=5 -->
- [ ] `npm run lint` <!-- id=6 -->
- [ ] `npm run format:check` <!-- id=7 -->
- [ ] `git log --oneline -1` <!-- id=8 -->

## Definition of Done
<!--
Each item below MUST be individually verified by running the declared
verifier. Do not bulk-check. Do not preemptively check. The visible checkbox
is the sign-off; the hidden `aitm-dod-evidence:<key>` marker is the evidence
trail. `/task check` refuses to tick a stampable Functional DoD item without
its marker; run `/task dod-stamp <key>` to produce one. The two derived keys
(`acs`, `checkboxes`) are auto-stamped by `/task close` from the body itself.
See `skill/shared/rules/functional-dod.md` for the full contract.

Lifecycle items are verified during Review. Housekeeping items are finalized
during Close; their separate headings make the owning workflow phase explicit.

Kind-aware items (#681): append a `dod:kinds` HTML-comment annotation to scope
an item to a set of issue kinds. `exclude="spike,research"` renders the item for
every kind EXCEPT those listed; `include="code"` renders it only for the listed
kinds; an item with no annotation applies to every kind (the default). The
`tests` item is excluded for the no-code kinds `spike` and `research`, which ship
findings rather than code and would otherwise carry a test-suite DoD item and a
`npm run test:all` verification command they can never satisfy. Filtering happens
at render time in `preflight-issue.mjs`; a filtered-out item is simply absent, so
no phantom evidence marker is ever required for it.

Diff-decides for `docs-only` (#865): the `tests` item deliberately does NOT
static-exclude `docs-only`. A `docs-only` issue can quietly touch code, so the
kind alone must not launder it out of the suite. Instead the `tests` item is
dropped only when the render is `--kind docs-only` AND a supplied
`--changed-paths-file` proves the `trunk...HEAD` diff is documentation-only
(default-deny: any unclassified/empty/mixed diff keeps the item). "The kind
declares, the diff decides."
-->

### Functional (verified at Test)

- [ ] All automated tests pass <!-- aitm-verified cmd="`npm test` `npm run test:slow`" --> <!-- dod:functional:tests --> <!-- dod:kinds exclude="spike,research" -->
- [ ] Lint and format checks pass <!-- aitm-verified cmd="`npm run lint` `npm run format:check`" --> <!-- dod:functional:lint -->
- [ ] All changes committed; commit messages follow project convention <!-- aitm-verified cmd="`git log --oneline -1`" --> <!-- dod:functional:commits --> <!-- dod:kinds exclude="epic" -->
- [ ] Acceptance criteria met (including additions from deep dive) <!-- dod:functional:acs -->
- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->

### Lifecycle (verified at Review)

- [ ] Agent Review Passed
- [ ] Final Review Passed

### Housekeeping (verified at Close)

- [ ] Story closed and moved to Done
- [ ] Timing data flushed to issue
<!-- aitm-fields: {"schema":1,"values":{"priority":"p1","size":null,"estimate":null,"engagedTime":null,"sessionTime":null,"reviewTime":null,"rank":null,"startTime":null,"blockedBy":null}} -->
<!-- aitm-body-version version="1" -->
