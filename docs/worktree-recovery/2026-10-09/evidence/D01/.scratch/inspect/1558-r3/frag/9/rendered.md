## User Story

As a lifecycle maintainer,
I want to inspect one versioned action and refusal contract,
So that core execution, explanation, and future gate producers cannot disagree about authority.

## Scope

Create `action-decision/contract.mjs`, `remediations.mjs`, and `legacy-refusals.json` under the mapped library directory. Modify `lib/lifecycle-policy/actions.mjs` and `lib/guard-registry.mjs`; inventory the real bootstrap in `lib/state-bootstrap.mjs` and `scripts/task-tracker/states/*.mjs`, updating their contracts where necessary. Preserve `lib/guard-bootstrap.mjs` as a compatibility re-export shim. Create `scripts/maintenance/lint-action-refusals.mjs`, `scripts/tests/helpers/action-decision-fixtures.mjs`, `scripts/tests/unit/task-tracker/lib/action-decision-contract.test.mjs`, using the already committed Task 1 characterization artifacts. Add the refusal lint to `package.json` and CI. Record the readiness/refusal inventory in `docs/guides/ask-the-script.md`.

## Story Origin

- **kind**: code
- **parent**: #1558

## Plan Metadata

- **Source-plan**: docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md
- **Source-plan-commit**: 55dedc066701a9fce1066ac4ebebce58ed147638
- **Source-plan-section**: ### Task 9: Establish the complete shared decision and typed vocabulary contract
- **Baseline-plan**: docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md
- **Baseline-plan-commit**: a168753999617066d98bbc1227c4b5d97fa531c5

## Pickup Directive — MANDATORY, DO NOT SKIP

> Follow: `.ai-task-manager/templates/pickup-directive.md`

## Acceptance Criteria

- [ ] All seven v1 actions use one bare-ID registry and one versioned decision contract; #1561 has a documented consumption boundary. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] Every inventoried refusal is coded or explicitly manual, and new/changed unclassified sites fail CI. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] The closed blocker/warning/request schemas enforce producer, args, status, scope and policy invariants while preserving complete internal evidence; Task 1 GO is a checked prerequisite. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] Before runtime work, the recorded decision and input digests match current accepted artifacts and VC27 exits 0; stale/missing/NO-GO evidence blocks entry regardless of issue closure state. <!-- aitm-verified vc-list="vc:3" -->

## Verification Commands

- [ ] `node --test scripts/tests/unit/task-tracker/lib/action-decision-contract.test.mjs` <!-- id=1 -->
- [ ] `node scripts/maintenance/lint-action-refusals.mjs` <!-- id=2 -->
- [ ] `node scripts/maintenance/measure-guidance-candidate.mjs --all --assert-feasible --json` <!-- id=3 -->
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
<!-- aitm-fields: {"schema":1,"values":{"priority":"p1","size":null,"estimate":null,"engagedTime":null,"sessionTime":null,"reviewTime":null,"rank":9,"startTime":null,"blockedBy":null}} -->
<!-- aitm-body-version version="1" -->
