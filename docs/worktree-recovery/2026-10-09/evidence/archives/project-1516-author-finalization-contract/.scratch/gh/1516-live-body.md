<!-- aitm-last-known-state state="plan" ts="2026-09-11T23:48:00.546Z" -->
<!-- aitm-refine-complete ts="2026-09-11T23:47:23.761Z" -->

## User Story

As a maintainer using two-agent co-review
I want to require only the configured author to invoke terminal archive finalization after the reviewer records acceptance
So that the reviewer cannot mutate tracked repository content outside the review role

## Scope

Separate reviewer consensus from tracked archive publication in the co-review protocol.

The reviewer `handoff --decision accepted` must durably record the exact-head acceptance decision, release the protocol mutex, and stop without creating or modifying the configured tracked archive destination. The configured author must receive the terminal wake/status action and must be the only co-review role allowed to invoke ordinary accepted-session `finalize` and publish the immutable archive.

Preserve exact evidence bytes, accepted-state immutability, idempotent archive retries, destination validation, collision recovery, and the existing authenticated-human authority for a separately authorized `--good-enough` decision. Update CLI validation, provider/session command authorization, status/help output, generated author and reviewer handoffs, and focused boundary tests so the role separation is executable rather than advisory.

## Reproduction

Observed on `origin/trunk` at `07984e5137ba53f56fe062a351e5dd4111fb87bd` during the spec-only #1219 co-review protocol `c1655cdd-f0c8-48fd-95e3-57af190d9f0c`.

1. Start an issue-scoped co-review with an artifact kind so startup configures `docs/superpowers/reviews/<issue>/<kind>`.
2. Have the configured reviewer submit `handoff --decision accepted` for the exact author commit.
3. Inspect the event log: it contains the terminal `reviewer-handoff` and no `finalize` event.
4. Inspect the configured tracked archive path: the archive files were nevertheless created at the same instant as reviewer acceptance.

The focused fixture codifies the same behavior in `scripts/tests/fixtures/co-review-finalization-cases.mjs`: reviewer consensus currently creates `README.md` in the configured archive destination before any author finalization command.

## Root Cause

`scripts/review/co-review.mjs` treats an accepted reviewer handoff as both a reviewer decision and a publication command. After `protocol.handoffReviewer(...)` returns accepted, the same reviewer process calls `validatedArchiveSnapshot`, `prepareArchive`, and `publishPreparedArchive`.

Issue-scoped startup always derives a tracked archive destination, so this side effect is automatic in normal guided co-review. Ordinary accepted-session `finalize` also has no configured-author actor or provider/session authorization. The protocol therefore has no capability boundary between reviewer decision authority and author/publisher repository-write authority.

This behavior was intentionally introduced by #1277, but it conflicts with the stricter role contract used by #1219: the reviewer reviews and records its decision; the author owns repository changes and terminal publication.

## Fix Direction

Remove archive preparation and publication from the accepted reviewer-handoff branch. Successful reviewer acceptance should leave durable accepted state with publication pending and expose an exact author finalization action.

Require ordinary accepted-session `finalize` to identify and authenticate the configured author through the protocol's provider/session authority. Refuse reviewer, foreign actor, missing identity, and provenance mismatch before any tracked-path write. Wake the waiting author after acceptance; generated reviewer instructions must say to verify accepted state and stop, while generated author instructions must say to run the exact finalize command.

Keep publication idempotent and preserve the current exact-byte validation, recovery sibling, conflict refusal, and exit-4 recovery guarantees. Retain `--good-enough` as a distinct authenticated-human decision path; it must not reintroduce reviewer-owned ordinary publication.

## Out of Scope

- Changing how reviewers classify findings or reach consensus.
- Reopening or rewriting accepted #1219 review evidence.
- Changing the specification or implementation plan under review.
- Broad redesign of archive contents, collision naming, or evidence hashing beyond what role separation requires.
- Removing the explicitly authenticated human-good-enough intervention policy.

## Story Origin

- **kind**: code
- **discovered-during**: #1219 spec-only co-review
- **related**: #1219, #1277, #1365, #1406
- **observed-trunk**: `07984e5137ba53f56fe062a351e5dd4111fb87bd`
- **protocol**: `c1655cdd-f0c8-48fd-95e3-57af190d9f0c`

## Plan Metadata

## Pickup Directive — MANDATORY, DO NOT SKIP

> Follow: `.ai-task-manager/templates/pickup-directive.md`

<!-- aitm-deep-dive-posted ts="2026-09-11T23:53:31.514Z" -->

## Deep-Dive Analysis (2026-09-11)

> Mirrored from comment #issuecomment-5641956504 (https://github.com/kburson/ai-task-manager/issues/1516#issuecomment-5641956504). Comment is the diff-history canonical; this body copy is the gate-canonical source.

The defect was reported against AITM's former in-repository co-review runtime. That runtime no longer exists on current trunk: issue #1592 completed the extraction to the exact `ai-peer-review` package dependency at version `0.2.0`. The installed package already owns the author/reviewer identity boundary, the `acceptance-pending` state, finalization, retry validation, recovery behavior, and good-enough authority. Reintroducing those mechanisms into AITM would create a second authority source. The bounded current-trunk repair is therefore an AITM host-contract guard plus operator guidance that proves and explains the package-owned behavior.

### Files to edit

- `docs/superpowers/specs/2026-09-11-1516-author-owned-finalization-contract-design.md`
- `docs/superpowers/plans/2026-09-11-1516-author-owned-finalization-contract.md`
- `scripts/tests/integration/review/peer-review-package-parity.test.mjs`
- `docs/guides/github-native-coordination.md`

### Step-by-step implementation plan

1. Record the extracted ownership boundary and the current-trunk finalization contract in an issue-specific design and implementation plan.
2. Extend the existing AITM/package parity fixture to execute a normal accepted review through reviewer handoff, refusal cases, author finalization, and idempotent retry.
3. Assert that reviewer acceptance releases the protocol into `acceptance-pending` without advancing Git HEAD or publishing the terminal manifest, and that status routes the next action to the author.
4. Assert that reviewer, foreign-author, and missing-identity finalization attempts fail before any tracked mutation.
5. Assert that the registered author alone creates the terminal manifest and commit, with an identical retry returning the same result without another commit or event.
6. Update the operator guide to tell the reviewer to stop at `acceptance-pending` and the registered author to run the exact finalization action shown by package status.
7. Replace the stale verifier that targeted the removed AITM runtime with the focused package-parity verifier, then run the complete governed verification lanes.

### Test additions

- `scripts/tests/integration/review/peer-review-package-parity.test.mjs`: add an end-to-end host contract covering reviewer non-publication, author-only finalization, failure-before-write identity checks, exact terminal commit paths, status/help routing, and idempotent retry.

### Identified risks

- A host test that copies package internals would become a competing protocol specification; assertions will stay on the installed package's public CLI/API and externally observable repository effects.
- Session identity can leak from the invoking environment; the missing-identity case must explicitly remove all supported provider session variables.
- Startup creates tracked review collateral before acceptance, so the boundary must compare Git HEAD and terminal manifest publication rather than incorrectly asserting that the destination is wholly absent.
- Finalization creates a real fixture commit; exact changed paths and retry HEAD stability must be asserted so unrelated tracked mutation cannot pass unnoticed.
- The original acceptance text names legacy archive mechanics. The design will map those requirements to the extracted package's durable manifest/finalization vocabulary without fabricating historical AITM delivery.

### Sibling sub-issues to spawn

None. The installed package already contains the bounded capability and no additional defect is required.

## Dependency Map

Depends on: none

Blocks: none

<!-- aitm-owned-comment key="deep-dive.analysis-v1" -->

## Acceptance Criteria

- [ ] An accepted reviewer handoff durably records exact-head reviewer consensus and releases the protocol mutex without creating, changing, or publishing any configured tracked archive path. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Ordinary accepted-session finalization succeeds only for the configured author with valid provider/session authority; reviewer, foreign-actor, missing-identity, and provenance-mismatch attempts fail before any tracked-path write. <!-- aitm-verified vc-list="vc:1" -->
- [ ] The authorized author can publish the accepted archive exactly once, and identical retries, destination validation, recovery-sibling selection, conflict refusal, and durable-acceptance recovery remain deterministic. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Status, help, and generated handoffs direct the reviewer to stop after acceptance and direct the waiting author to run the exact finalization command. <!-- aitm-verified vc-list="vc:1" -->
- [ ] The separately authenticated human-good-enough policy remains covered without granting ordinary archive-publication authority to the reviewer role. <!-- aitm-verified vc-list="vc:1" -->

## Verification Commands

- [ ] `node --test --test-name-pattern="author-owned co-review archive finalization" scripts/tests/unit/review/co-review.test.mjs` <!-- id=1 -->
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

## AITM Progress Markers

<!-- aitm-entered-backlog ts="2026-09-05T01:46:30.830Z" -->

<!-- aitm-worktree-location worktree="/Users/kpburson/projects/Vibe-Coding/ai-task-manager" branch="trunk" sid="01a08eac-a080-7053-a665-fe5729e94117" ts="2026-09-11T23:45:32.254Z" -->

<!-- aitm-entered-refine ts="2026-09-11T23:46:53.512Z" move="move:273a1849-517c-43a8-ab07-9c89d6493ff5" -->

<!-- aitm-refinement-snapshot schema="3" digest="2f254315b4423b7e9e70688ff13c562d72c0587a7a99c6694bbe8b5c915d5599" provenance="4067082e8bc4bd68d0cf108e59ea8931047f3babd6d4ebac33be75717f4037d7" priority="P1" size="L" estimate="10.5" rank="18" ts="2026-09-11T23:47:23.765Z" -->

<!-- aitm-entered-ready-for-plan ts="2026-09-11T23:47:35.281Z" move="move:2aeae8f0-4e8b-4c18-9b69-c717582ede9b" -->

<!-- aitm-entered-plan ts="2026-09-11T23:48:00.545Z" move="move:87ed0a5c-117a-4cf8-9d55-e1e2736ebb46" -->

<!-- aitm-move-complete state=plan ts=2026-09-11T23:48:03.053Z move=move:87ed0a5c-117a-4cf8-9d55-e1e2736ebb46 -->

<!-- aitm-worktree-location worktree="/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1516-author-finalization-contract" branch="codex/issue-1516-author-finalization-contract" sid="01a08eac-a080-7053-a665-fe5729e94117" ts="2026-09-11T23:48:31.742Z" -->
<!-- aitm-deep-dive-complete ts="2026-09-11T23:53:31.514Z" -->

<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"L","disposition":null,"estimate":10.5,"engagedTime":null,"sessionTime":null,"reviewTime":null,"planTime":null,"rank":18,"startTime":null}} -->

<!-- aitm-body-version version="11" -->

