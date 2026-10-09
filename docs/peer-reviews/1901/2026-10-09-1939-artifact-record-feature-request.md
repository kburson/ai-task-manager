# Feature #1939 — planning artifact metadata and review records

[Feature request #1939](https://github.com/kburson/ai-task-manager/issues/1939) was filed from #1901's planning-record cleanup on October 9, 2026. It is an enhancement in Backlog, assigned to kburson with P2 priority. No size or effort estimate was assigned at intake. This is a durable copy of the filed request, not an accepted design or implementation plan.

## Immediate compatibility restoration on #1901

The user's Design Specification / Implementation Plan / Backlog Hydration Plan grouping and review-before-acceptance ordering are retained. The exact operational fields were restored through the governed issue-body transaction:

- Governing-spec: docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md
- Source-plan: docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md
- Source-plan-commit: e8a34e7b1fbb39cafddae7a4189d819f005ba4b9

The existing Decomposition-plan remains. Accepted artifact links, commits and digest remain unchanged. Issue-body read-back confirms only the three fields and canonical body-version increment changed; no approval or implementation evidence was created.

## Filed request snapshot

The exact issue body below preserves the feature requirements, story, acceptance criteria, verifier declarations, and creation provenance. Proposed new verification suites are implementation acceptance obligations, not executed test evidence. Future backhealing and formatting implementation belong to #1939; this intake does not apply changes to prior stories.

````````text
## User Story

As a workspace operator reviewing planned and historical work
I want to navigate concise artifact and review records while agents resolve the same authoritative evidence because duplicated metadata and per-round issue comments obscure reviewed versions and clutter story histories
So that I can assess readiness and review changes without losing durable evidence or breaking automated workflow consumers

## Scope

Unify planning artifact references and review publication so operators and agents can use concise, durable records without duplicated operational paths in visible Plan Metadata. Support safe backhealing of prior stories and enforce the enhanced conventions for future stories.

Observed on #1901: Accepted specification and Governing-spec refer to the same file, while Accepted-plan and Source-plan/Source-plan-commit duplicate a reviewed plan reference. AITM consumers currently recognize operational keys and repository-relative paths, not accepted-artifact links or Markdown URLs. Removing those visible fields breaks discovery or causes generic specification fallback. Restore compatibility on #1901 now; solve the contract in this feature.

The user approved the readable grouping Design Specification, Implementation Plan, and Backlog Hydration Plan, with review evidence preceding accepted artifact metadata. Review records are now consolidated into one issue-comment block per artifact/review type, including File Under Review, outcome, actual reviewer/author identity and effort, available joint elapsed timing, and a round table linking reviewer notes and author dispositions. Full documents, manifests, findings, recovery details, and timing-event tables live in Git with immutable origin links.

Required behavior:

- Define one versioned artifact-reference contract carrying repository-relative file path, role, reviewed/accepted commit and content digest, review type/identity/status, and durable evidence links. The human display should expose meaningful linked artifacts without showing duplicate machine path/commit fields. A hidden machine record or equivalent validated reference is a design choice; it must remain available to agents and every operational consumer.
- Use one authority across metadata rendering, parser/resolver, split-plan inheritance, story intent, decomposition/WBS coverage, Plan approval, and backfill. Preserve governing specification versus accepted revision, source plan versus decomposition plan, selected child task, and draft versus accepted status. Detect conflicting references explicitly rather than silently selecting a stale or generic source.
- Preserve compatibility with existing visible legacy keys during migration. Validate immutable artifact paths, commits and digests; do not resolve arbitrary Markdown into an unvalidated executable or filesystem path. Human reordering must not alter authority.
- Publish exactly one consolidated block for each actual artifact/review type: #<issue> Design Specification Review: SAR (or SPR), #<issue> Design Specification Review: XPR, #<issue> Implementation Plan Review: SPR, and #<issue> Implementation Plan Review: XPR. Do not infer review type solely from provider/model or relabel a manual loop as a sealed protocol.
- Every review block starts with File Under Review linked to the exact reviewed revision, records actual identity/effort and outcome, and contains a compact ordered round table with immutable reviewer-note and author-disposition links. Retain final no-change notes, optional/deferred dispositions, draft/interrupted/failed/cancelled outcomes, artifact revision lineage, and reviewer-consensus versus human approval distinctions. Never attribute an earlier SPR acceptance to later XPR bytes.
- Keep full evidence in committed Git documents and provide lightweight agent discovery of the authoritative record without loading all review prose. Update the one stable owned summary through the review lifecycle; no separate per-round, author-response, manifest, or duplicate acceptance comments. Support authorized duplicate retirement through a governed exact-ID operation with durable preservation receipts.
- Backhealing is a scoped, resumable, idempotent workflow: inventory selected historical issues, locate verifiable sources, preview diffs and proposed comment consolidation/removals, preserve exact original bodies and provenance in committed/published backups, apply against fresh bases, verify exact read-back, and record a durable migration journal. A repeated run must not duplicate records or redo completed changes.
- Refuse or report missing artifacts, ambiguous ownership, mismatched hashes/revisions, concurrent human edits, unrecognized user content, and incomplete historical evidence. Do not guess acceptance/model/effort, fabricate findings/timing/approval, or delete content that has not been durably archived. Preserve timing logs, commit trails, AC/VC/DoD and protected lifecycle evidence; do not reopen, demote, re-review, or advance historical stories to apply formatting.
- Update canonical templates, shared task guidance, provider adapters, and any peer-review integration surfaces responsible for publication. Enforce the new schema and formatting in authoritative writer/validation paths and regression fixtures, not solely conversational instructions. Coordinate with standalone ai-peer-review where applicable rather than relying on a local-only skill edit.
- Account for current gates that require substantive deep-dive text in the issue body. This feature must not replace required prose with a link unless an explicitly designed, evidence-bound durable-reference consumer supports it; otherwise retain and document that compatibility exception.

Reference outcome: #1901's metadata arrangement and four review comments. Git-tracked reference index and consolidation mapping: https://github.com/kburson/ai-task-manager/blob/5f35cf08c41bb8d9c482963e16a5313f44a973f6/docs/peer-reviews/1901/2026-10-09-durable-record-index.md and https://github.com/kburson/ai-task-manager/blob/5f35cf08c41bb8d9c482963e16a5313f44a973f6/docs/peer-reviews/1901/2026-10-09-review-comment-consolidation.md.

Related work: #1768 defines planning artifact review lifecycle; #1723 defines iterative SAR provenance. This request concerns metadata/reference and presentation contracts, future enforcement, and historical backhealing; it does not duplicate their review algorithms. Preserve their terminology and actual recorded methods.

This is feature intake only. Implementation design, sizing, decomposition and rollout policy belong in Refine/Plan; no mass historical mutation is authorized by this filing. The listed verification groups are required acceptance coverage, including new suites to be implemented, not claims of tests already run.

## Story Origin

- **kind**: code
- **discovered-during**: #1901 planning artifact and review-record cleanup on 2026-10-09.
- **authorization**: Direct user request to restore operational fields and file a feature for visible metadata optimization, consolidated review records, prior-story backhealing, and future enforcement.
- **reference-story**: https://github.com/kburson/ai-task-manager/issues/1901
- **reference-format**: docs/peer-reviews/1901/2026-10-09-durable-record-index.md and 2026-10-09-review-comment-consolidation.md at 5f35cf08c41bb8d9c482963e16a5313f44a973f6.
- **related**: #1768 planning review lifecycle; #1723 iterative SAR provenance.
- **intake-boundary**: Backlog capture only; no feature implementation or mass historical apply.

## Plan Metadata

## Pickup Directive — MANDATORY, DO NOT SKIP

> Follow: `.ai-task-manager/templates/pickup-directive.md`

## Acceptance Criteria

- [ ] A versioned artifact-reference contract supports one human-readable reference per artifact, with machine-required path/commit/digest/roles and selected task references accessible without duplicate visible operational fields; legacy and new forms round-trip without information loss. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Metadata rendering preserves Design Specification, Implementation Plan, and Backlog Hydration Plan groups, orders reviews before acceptance, uses immutable origin links for durable documents, and rejects duplicate/conflicting authority. <!-- aitm-verified vc-list="vc:1 vc:2" -->
- [ ] Operational plan/spec consumers, split-plan child provenance, story-intent resolution, WBS/decomposition coverage, and approval resolve the same verified artifact across legacy/new forms; unavailable or contradictory references produce explicit diagnostics instead of generic fallback. <!-- aitm-verified vc-list="vc:1" -->
- [ ] One consolidated comment per issue/artifact/review type includes File Under Review at the exact reviewed revision, actual method/identity/effort/outcome, known joint elapsed timing, ordered round links, author dispositions, and complete tracked record/manifest links; earlier acceptance is never attributed to later bytes. <!-- aitm-verified vc-list="vc:2 vc:3" -->
- [ ] Authoritative review publication creates/updates the same owned summary idempotently through all rounds and terminal/nonterminal outcomes, preserves every full review/author response in Git, and prevents separate round/manifest/duplicate acceptance comments. <!-- aitm-verified vc-list="vc:3" -->
- [ ] Backheal supports scoped inventory, dry-run/preview, exact committed-and-published backup, fresh-base apply, authorized exact-ID duplicate retirement, exact read-back, durable journal, interruption/resume, and a no-op second completed run. <!-- aitm-verified vc-list="vc:4" -->
- [ ] Missing historical sources, ambiguous ownership, concurrent edits, invalid digests/revisions and unrecognized user content refuse destructive changes with actionable diagnostics; no fabricated provenance, acceptance, findings, timing or approval is introduced. <!-- aitm-verified vc-list="vc:1 vc:3 vc:4" -->
- [ ] Migration preserves protected lifecycle markers, timing/commit/transition comments, AC/VC/DoD evidence and current state for active and completed stories; rollback can restore preserved originals without rewriting review history. <!-- aitm-verified vc-list="vc:4" -->
- [ ] Future story creation and review publication use updated shared templates/provider guidance and authoritative schema/format validation; supported legacy migration and fresh workflows pass regression coverage across supported provider adapters. <!-- aitm-verified vc-list="vc:1 vc:2 vc:3 vc:4" -->
- [ ] #1901-derived fixtures demonstrate the reduced visible metadata and exactly four consolidated review blocks with every original round still reachable; current deep-dive compatibility is preserved until evidence-bound durable reference support is implemented. <!-- aitm-verified vc-list="vc:1 vc:2 vc:3 vc:4" -->

## Verification Commands

- [ ] `node --test scripts/tests/unit/task-tracker/lib/plan-metadata-lib.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs scripts/tests/unit/task-tracker/lib/story-intent-source.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs scripts/tests/unit/task-tracker/verbs/split-plan.test.mjs scripts/tests/unit/task-tracker/lib/artifact-reference-contract.test.mjs` <!-- id=1 -->
- [ ] `node --test scripts/tests/unit/task-tracker/lib/artifact-record-renderer.test.mjs` <!-- id=2 -->
- [ ] `node --test scripts/tests/unit/task-tracker/verbs/comment.test.mjs scripts/tests/unit/task-tracker/lib/review-record-publication.test.mjs` <!-- id=3 -->
- [ ] `node --test scripts/tests/unit/task-tracker/core/backfill-plan-metadata.test.mjs scripts/tests/unit/task-tracker/core/coverage-backfill-plan-metadata.test.mjs scripts/tests/unit/task-tracker/lib/gh-edit-guard-protected-comments.test.mjs scripts/tests/integration/task-tracker/lib/artifact-record-backheal.test.mjs` <!-- id=4 -->
- [ ] `npm test` <!-- id=5 -->
- [ ] `npm run test:slow` <!-- id=6 -->
- [ ] `npm run lint` <!-- id=7 -->
- [ ] `npm run format:check` <!-- id=8 -->
- [ ] `git log --oneline -1` <!-- id=9 -->

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

<!-- aitm-body-version version="1" -->

## AITM Progress Markers

<!-- aitm-entered-backlog ts="2026-10-09T14:33:00.005Z" -->

<!-- aitm-fields: {"schema":1,"values":{"priority":"p2","size":null,"estimate":null,"engagedTime":null,"sessionTime":null,"reviewTime":null,"rank":null,"startTime":null,"blockedBy":null}} -->

````````
