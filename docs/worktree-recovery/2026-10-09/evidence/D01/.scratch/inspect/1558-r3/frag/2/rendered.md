## User Story

As a harness maintainer,
I want to have all physical transport intercepted before production imports,
So that the unchanged CLI can be exercised without external effects.

## Scope

Own initial `scripts/tests/helpers/guidance-legacy-cli.mjs`, `guidance-legacy-preload.mjs`, and `guidance-legacy-transport.mjs`; own `guidance-legacy-transport.test.mjs`. The CLI module owns `captureLegacyWorkflow({ sourceCommit, adapter, scenario, authorityFixture, scratchRoot })`; transport owns callback/custom-promise dispatch and the physical ledger; preload alone patches process/network ports and synchronizes ESM exports. No lifecycle authority scenarios or frozen baseline.

## Story Origin

- **kind**: code
- **parent**: #1558

## Plan Metadata

- **Source-plan**: docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md
- **Source-plan-commit**: 55dedc066701a9fce1066ac4ebebce58ed147638
- **Source-plan-section**: ### Task 2: Build and prove whole-process transport interception
- **Baseline-plan**: docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md
- **Baseline-plan-commit**: a168753999617066d98bbc1227c4b5d97fa531c5

## Pickup Directive — MANDATORY, DO NOT SKIP

> Follow: `.ai-task-manager/templates/pickup-directive.md`

## Acceptance Criteria

- [ ] The launcher sanitizes inherited bypass/fake/fault flags, installs preload before imports, and confines local Git/filesystem/session/lock effects to isolated repositories. Unknown subprocess/network attempts fail in an outer ledger even if production catches the exception; production gains no bypass switch. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Callback execFile, exec, custom-promisify, aliased nodePexec/defaultExecFile, synchronous/spawn forms, nested children and direct HTTP have inventoried handling. Custom replacements preserve stdout/stderr, error code/streams and promise.child; restoring a native custom symbol fails positive ledger evidence with local canaries. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Positive local transport fixtures reconcile every declared request to physical ledger rows on Node 24 and development Node 26; empty ledger is rejected. Package tests exclude all harness code. Lifecycle-specific fixture expectations are reserved to WBS 3. <!-- aitm-verified vc-list="vc:1" -->

## Verification Commands

- [ ] `node --test scripts/tests/unit/task-tracker/lib/guidance-legacy-transport.test.mjs scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` <!-- id=1 -->
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
<!-- aitm-fields: {"schema":1,"values":{"priority":"p1","size":null,"estimate":null,"engagedTime":null,"sessionTime":null,"reviewTime":null,"rank":2,"startTime":null,"blockedBy":null}} -->
<!-- aitm-body-version version="1" -->
