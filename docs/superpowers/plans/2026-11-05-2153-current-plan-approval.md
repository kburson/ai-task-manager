# Current Plan approval after a policy-exempt transition — Implementation Plan #2153

> **For agentic workers:** Use `executing-plans` for native implementation in this owning chat, task by task. Do not implement before the ordered spec and plan review is accepted. Steps use checkboxes for tracking.

**Goal:** Give a release operator a supported, current-evidence approval route after a genuine policy-exempt development transition without rewriting its historical authority.

**Architecture:** An explicit `--current-scope` route authenticates historical admission, then reuses current approval validation and its governed write/readback transaction. A closed current-evidence record is bound by one optional approval-marker digest and rendered in a canonical audit. Legacy waiver reconstruction and Review requirements remain intact.

**Tech Stack:** Existing Node ESM, Node test runner, Git/GitHub transport ports, AITM native lifecycle; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-05-2153-current-plan-approval-design.md`

## Scope

Implement only the explicit current-scope lane, its strict evidence reader, marker/audit binding, public help and tests, plus the reviewed #2147 activation instructions. Related #1716/#1720 behavior is regression scope. #1721, completed #2148 and #2145/#2146 are excluded.

## Context

Native failure: https://github.com/kburson/ai-task-manager/issues/2147#issuecomment-6651060778 . Baseline trunk: `13dba5c003eb3dd13d8042d5874bd0cc752d8653`. Historical #2147 scope differs from current scope and must not be assumed equivalent. Existing late approval only reconstructs waived authority; the singleton completion sentinel advances to Review.

## Plan Metadata

- Priority: P0
- Size: M
- Estimate: 6 hours
- Labels: bug
- Execution: native in the exact #2153 owning checkout

## Story Intent

- **Beneficiary:** release operator
- **Capability:** obtain current evidence-backed Plan approval after a legitimate policy-exempt development transition
- **Need:** later Review requires an approval audit but the existing repair only handles revoked waivers and loses historical completion after subsequent moves
- **Value or failure prevented:** deliver verified changes without misrepresenting an exemption as approval or accepting stale scope and source

## Global Constraints

- The historical `not-required` outcome never becomes approval evidence.
- No new scope normalization; use the existing scope-identity algorithm.
- No changes to ordinary waived reconstruction, current Review requirements, or session Full-Auto mode classification.
- Explicit `TT_FULL_AUTO=1` and `--current-scope`; Develop/Test/Review only; incompatible flags refuse.
- No new dependencies; all tests use the canonical package test tree and carry `@story #2153`.
- No #2147 mutation before delivery/activation readiness; preserve its accepted source, receipts and sealed reviews.
- Native actor identity, governed issue-body writes, fresh-base validation, readback, and normal one-step lifecycle remain mandatory.

## Acceptance Criteria

- [ ] Authenticate historical policy-exempt completion after subsequent moves without trusting the current singleton sentinel.
- [ ] Produce fresh current-scope approval/audit with a durable digest binding to the current source and plan.
- [ ] Refuse malformed, edited, duplicate, ambiguous, orphaned, mismatched and racing evidence without false acceptance.
- [ ] Preserve human approval, ordinary approval and revoked-waiver repair behavior.
- [ ] Prove public workflow behavior and the supported post-delivery #2147 activation sequence.

## Review Focus

- A forged/edited completion comment cannot turn an orphan intent into historical admission (Task 1).
- A changed AC with identical User Story cannot reuse a current approval's digest or timestamp (Task 2).
- Git/source, board or comment drift between observation and write/readback cannot receive a success result (Task 2).
- Audit-post failure followed by retry cannot bind a changed scope to the old timestamp (Task 2).
- A delivered repair integrated into #2147 cannot reuse Test/source-review acceptance for its former HEAD (Task 2).

## Implementation Tasks

### Task 1: Authenticate historical admission and bind current evidence

#### Story Intent

- **Beneficiary:** release operator
- **Capability:** distinguish a completed policy-exempt transition from incomplete or altered history
- **Need:** the latest move-complete sentinel no longer represents the original development transition
- **Value or failure prevented:** prevent orphan or manipulated history from admitting a later approval

**Files:**

- Create: `scripts/task-tracker/lib/plan-approval-current-scope.mjs`
- Modify: `scripts/task-tracker/lib/markers.mjs`
- Modify: `scripts/task-tracker/lib/plan-approval-audit.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/plan-approval-current-scope.test.mjs`
- Extend relevant existing marker/audit unit tests discovered beside those modules.

**Interfaces:**

- `evaluateCurrentScopeAdmission({ body, comments, repository, issue })` returns frozen `{ status: 'available', admission }` or `{ status: 'unavailable', blockers: string[] }`. Admission contains `transitionId`, `authorityCommentId`, `commitCommentId`, `historicalScopeIdentity`, `authorityFingerprint`, `commitFingerprint`.
- `createCurrentPlanApprovalEvidence({ repository, issue, scopeIdentity, sourceHead, trunkSha, planPath, planContentSha256, storyBinding, forecastRecordId, admission })` returns a validated frozen closed `aitm.current-plan-approval/v1` record. Use existing canonical JSON/fingerprint codec. Null is allowed only for `forecastRecordId`.
- `currentPlanApprovalDigest(record)` returns the existing `sha256:<64 hex>` fingerprint form.
- Extend marker build/parse with optional `currentApprovalDigest` (`current-approval-digest` attribute); absent remains null. Reject invalid current-scope field values at construction and expose malformed/duplicate detection to the new lane.
- Extend `buildPlanApprovalAuditComment`, `isCanonicalPlanApprovalAuditComment`, and `ensureFullAutoPlanApprovalAudit` with optional `currentEvidence`. It is mutually exclusive with `repairEvidence`; canonical reader validates exact closed content and fingerprint. Existing ordinary/repair renderings remain byte-identical.

- [ ] Write failing admission tests using real authority/transition writers/codecs: old Develop entry with current Review sentinel is available only with its matching immutable completion comment; changed historical/current scope is retained, not approved.
- [ ] Add table cases for missing/duplicate/malformed wrappers and records, altered timestamps/authors, same-second precision ordering and impossible earlier-second completion, untrusted associations, repository/issue/edge mismatch, orphan record, entry-byte mismatch, multiple visits, multiple admissible candidates and malformed collisions. Assert unavailable and stable blocker codes.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/plan-approval-current-scope.test.mjs` and preserve the actual expected red output.
- [ ] Implement strict observation collection and joins without modifying the existing legacy classifier or waived-repair reader. Complete comment pagination is a transport responsibility; incomplete observations refuse.
- [ ] Add record/marker/audit tests: exact canonical round-trip, digest changes for AC/source/plan changes, malformed and duplicate current fields, missing digest, mutually exclusive audit evidence, canonical audit recognition, legacy byte compatibility.
- [ ] Implement the closed record and one optional marker field. Keep audit evidence encoded canonically, with visible text stating present-time approval and historical exemption as admission only.
- [ ] Run the focused tests plus existing marker/audit/authority suites. Inspect output; retain red/green evidence.
- [ ] Commit exact tested files with subject `[#2153] Authenticate current approval admission and evidence` and verify commit trace.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/plan-approval-current-scope.test.mjs scripts/tests/unit/task-tracker/lib/plan-transition-authority.test.mjs
```

### Task 2: Wire explicit current approval, verify public workflow, and document activation

#### Story Intent

- **Beneficiary:** release operator
- **Capability:** approve the current plan and source after a policy-exempt transition through the supported command
- **Need:** the existing later-stage command requires waived history and cannot produce the required present-time audit
- **Value or failure prevented:** complete verified delivery while preserving current validation and truthful historical evidence

**Files:**

- Modify: `scripts/task-tracker/verbs/plan-approve.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs` (Plan approval help entry)
- Modify: `skill/shared/rules/user-story-quality.md` (bounded approval route)
- Extend: `scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs`
- Extend: `scripts/tests/unit/task-tracker/verbs/plan-approve-core.test.mjs`
- Modify: `scripts/task-tracker/lib/agent-review/validators/required-comments.mjs`
- Modify: `scripts/task-tracker/lib/agent-review/review-gate.mjs`
- Modify: `scripts/task-tracker/lib/resident-actions/review-agent-validation.mjs`
- Extend: `scripts/tests/unit/task-tracker/lib/agent-review/validators/required-comments.test.mjs`
- Extend the existing resident Review and review-context tests for new-digest freshness only.
- Create: `scripts/tests/integration/task-tracker/plan-approval-current-scope.test.mjs`
- Create: `docs/workflows/current-plan-approval.md`

**Interfaces:**

- Extend `runPlanApprove` input with `currentScope = false`; CLI `--current-scope` selects it. Keep `repairFromEvidence` independent and reject both true.
- `observeCurrentPlanSource({ projectDir, cfg, body, governedPlan, storyBinding, admission, deps })` returns the validated evidence record plus operation-only board/source observations. Default Git reads require a clean tree and actual HEAD plus a contained tracked regular plan with bytes equal to HEAD:path; test injection replaces external reads only.
- Current route returns `approved-current-scope`, `already-approved` or a typed `current-scope-refused` with blockers. Public CLI gives refusal a nonzero exit, and outcome text never calls current approval reconstructed.
- Reuse current governed plan/story resolution, checklist lint and forecast/trunk checks. A small shared validator extraction is permitted only with regression coverage and unchanged legacy routing.
- `validateCurrentScopeApproval({ body, comments, repository, issue, acceptedSourceHead })` returns a pure pass/fail result for the new digest-bearing form; legacy forms remain not-applicable. Verify the canonical record/digest, body scope, selected source HEAD, plan path, story binding and forecast. Thread acceptedSourceHead from the resident snapshot through buildReviewContext; enforce in resident observe as well as required-comments validation.

- [ ] Add failing producer tests for actual later-stage `not-required` history, new opt-in flag, explicit Full-Auto, supported states, flag conflicts, directory/epic/missing-plan refusals, current substantive intent and clean source requirements.
- [ ] Add fresh-base and readback races: changed AC while story stays equal; changed plan bytes/path, HEAD, trunk, forecast, board state, comment provenance or historical entry; concurrent human approval; persisted marker mismatch. Assert no success and no audit on a failed readback. Assert pre-write refusals perform no approval write.
- [ ] Run the existing and new focused producer tests and preserve red results.
- [ ] Wire current admission before ordinary/repair route selection. Reuse ordinary current validation but keep the new write narrow: marker only, no Plan-entry synthesis or deep-dive wrapping. Revalidate complete external observations immediately before the transaction and after persistence; validate body/source identity on every fresh-base callback.
- [ ] Add digest-aware idempotency and partial audit recovery. Exact record match preserves timestamp; changed current evidence requires a new explicit approval timestamp. Refuse existing human, unknown, ordinary Full-Auto and waiver approvals unchanged; only absent approval or a valid prior current-scope digest enters this lane.
- [ ] Implement the new-audit-only consumer freshness check. Add regression cases where a post-write scope/HEAD/plan-path/forecast change leaves a canonical audit but must fail both resident observe and required-comments validation; prove the selected artifact subject HEAD is used, never operator HEAD. Missing source context fails the new form. Prove legacy behavior unchanged.
- [ ] Verify producer green, legacy regression suites green, canonical matching current audit accepted by required-comments, and all new failure cases.
- [ ] Build a public-CLI integration fixture from the established integration harness: real command parser/producer, real authority and transition codecs/writer, isolated project scratch and Git state, provider transport substitution only. Reproduce policy-exempt Plan-to-Develop then Test/Review singleton replacement. Assert approval/audit success and unchanged source, visits and Test evidence. Include negative scope/source races and legacy route refusal.
- [ ] Add activation regression proving Review-to-Develop code-rework followed by genuine delivered correction yields a new HEAD, invalidates old exact-head acceptance, and requires new verification before Test/Review. Do not label the fixture native host proof.
- [ ] Document command eligibility, current-evidence meaning, refusal/retry handling and the exact #2147 activation sequence from the spec. Keep CLI/rule guidance concise and do not claim current policy exemption is approval.
- [ ] Run all root issue verifiers, configured Develop iteration/finalization, lint and format. Obtain independent exact-source review and resolve substantive findings before finalization.
- [ ] Commit with `[#2153] Add explicit current-scope Plan approval`; verify trace, clean exact SHA, full CI and native Test receipt. Follow the coordinator's native Review/delivery boundary; no direct state jump or merge shortcut.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/plan-approval-current-scope.test.mjs scripts/tests/unit/task-tracker/lib/plan-transition-authority.test.mjs scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs
node --test scripts/tests/integration/task-tracker/plan-approval-current-scope.test.mjs
node --test scripts/tests/unit/task-tracker/lib/agent-review/validators/required-comments.test.mjs scripts/tests/unit/task-tracker/verbs/plan-approve-core.test.mjs
```

## Review and execution sequence

Commit the draft specification and plan under #2153. Run ordered `spec,plan` review with Claude `claude-opus-5-5`, effort `medium`, initial `--max-turns 6`. Reuse the same reviewer/session across phases. At round four, if substantive revisions remain, inspect the documented active-session budget control and use only an author-authorized action; preserve the same review. No exhausted-review replacement or invented grant.

Accepted review is the implementation boundary. Link the accepted plan through the governed Plan Metadata operation, publish/mirror/stamp the deep dive, and complete current planning estimates. Invoke supported native `TT_FULL_AUTO=1 ... plan-approve 2153` in Plan even if policy says not-required; preserve audit and fresh readback. Advance normally to Develop, then follow the TDD tasks above.

## Activation readiness for #2147

Report readiness only after #2153 is delivered to verified trunk. Supply the merged correction SHA and public command documentation. The coordinator resumes #2147 at its recorded aaff checkout, preserves accepted head `83cbc7d2afd6268cf9913079497a8b40654533a6`, Test receipt `01M6N4D6WFFQSAYKTYJ8HW3ZZ6`, CI `41974816469`, PR #2152 and sealed reviews. Use normal `demote --rework "Integrate delivered #2153 current-approval correction"` for genuine delivered-code integration; integrate the corrected trunk by the supported branch workflow. Never substitute another checkout's runtime or self-link.

Review current scope/plan and the resulting source. Re-run required native qualification, exact-head source review, Develop finalization, CI and Test at the new HEAD. Then run the delivered current-scope approval with fresh readback against final stamped evidence before normal Review. If Review normalization changes the existing scope identity, explicitly re-review/approve that final body and retry Review; never normalize away drift. Old receipts remain history. If a genuine accepted-plan/scope mismatch remains, obtain a current review; neither the old exemption nor this repair authorizes it. This worker leaves #2147 untouched until the coordinator activates the reviewed route.

## Estimate rationale

Six human hours is the bounded maximum for this defect: two hours for strict historical evidence and codecs, two hours for producer/consumer transaction and freshness tests, one hour for public workflow/activation regression, and one hour for documentation, review fixes and delivery verification. The two implementation tasks are sequential parts of one approval capability, not independently released features. Reassess before implementation if accepted review expands this scope.
