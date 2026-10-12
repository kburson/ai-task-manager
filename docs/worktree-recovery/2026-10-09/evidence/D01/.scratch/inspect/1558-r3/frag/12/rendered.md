## User Story

As a lifecycle executor,
I want to evaluate derived DoD without writing and persist only a ready result,
So that explanation remains read-only and failed persistence cannot authorize progression.

## Scope

Create `lib/functional-dod-project.mjs` and `action-decision/normalization.mjs`. Modify `lib/functional-dod-derive.mjs`, `lib/review-derive-rescan.mjs`, and the promote/review/close call sites. Create `scripts/tests/unit/task-tracker/lib/functional-dod-project.test.mjs` and `scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs`; update existing `review-derive-rescan.test.mjs` expectations only where this spec deliberately replaces stale fallback behavior.

## Story Origin

- **kind**: code
- **parent**: #1558

## Plan Metadata

- **Source-plan**: docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md
- **Source-plan-commit**: 55dedc066701a9fce1066ac4ebebce58ed147638
- **Source-plan-section**: ### Task 12: Project Functional DoD and persist it only after readiness
- **Baseline-plan**: docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md
- **Baseline-plan-commit**: a168753999617066d98bbc1227c4b5d97fa531c5

## Pickup Directive — MANDATORY, DO NOT SKIP

> Follow: `.ai-task-manager/templates/pickup-directive.md`

## Acceptance Criteria

- [ ] Explanation uses the same pure ordered projection as execution and discloses pending writes without performing them. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Concurrent edits trigger complete recomputation; failed writes/readbacks stop all subsequent effects. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Decision identity excludes timestamps/marker bytes, while execution readback checks actual provenance and idempotence. <!-- aitm-verified vc-list="vc:1" -->

## Verification Commands

- [ ] `node --test scripts/tests/unit/task-tracker/lib/functional-dod-project.test.mjs scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs scripts/tests/unit/task-tracker/lib/review-derive-rescan.test.mjs` <!-- id=1 -->
- [ ] `npm test` <!-- id=2 -->
- [ ] `npm run test:slow` <!-- id=3 -->
- [ ] `npm run lint` <!-- id=4 -->
- [ ] `npm run format:check` <!-- id=5 -->
- [ ] `git log --oneline -1` <!-- id=6 -->

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
<!-- aitm-fields: {"schema":1,"values":{"priority":"p1","size":null,"estimate":null,"engagedTime":null,"sessionTime":null,"reviewTime":null,"rank":12,"startTime":null,"blockedBy":null}} -->
<!-- aitm-body-version version="1" -->
