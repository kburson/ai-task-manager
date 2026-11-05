<!-- cspell:ignore aaff WFFQSAYKTYJ precheck digestless handwaved -->

# Current Plan approval after a policy-exempt transition — #2153

## Problem and evidence

Issue #2147 legitimately entered Develop with a durable `approval.plan` outcome of `not-required`. It subsequently passed source verification and Test, but resident Review requires a canonical Full-Auto Plan-Approval Audit. Ordinary later-stage approval routes into waived-transition reconstruction; that reader first loses historical completion when the singleton move-complete sentinel advances and then only admits a revoked waiver. There is no waiver in this incident.

The native failure report is <https://github.com/kburson/ai-task-manager/issues/2147#issuecomment-6651060778> . The authority and completion comments are <https://github.com/kburson/ai-task-manager/issues/2147#issuecomment-6620373277> and <https://github.com/kburson/ai-task-manager/issues/2147#issuecomment-6620377056> . The authority's old scope identity differs from the current scope identity. This design makes no claim that the difference is harmless.

The baseline is trunk `13dba5c003eb3dd13d8042d5874bd0cc752d8653`. Relevant existing contracts are #1720 (immutable transition authority), #1716 (strict revoked-waiver repair), and #1721 (separate open session-mode selection defect). #2148 is complete and is not reopened. This is one bounded defect in the #2039 completion chain.

## Goals and non-goals

Provide an explicit supported present-time approval for current evidence after a genuine policy-exempt Plan-to-Develop move. Keep the historical decision immutable. Require the same current governed-plan, Story Intent, trunk and forecast validation as ordinary Plan approval, with stronger later-stage admission and race checks. Produce a canonical audit that plainly distinguishes present-time approval from historical waiver reconstruction.

Do not relax Review's audit requirement, change gate policy, broaden waived reconstruction, normalize away scope differences, infer approval from old exemptions, change #1721, or edit #2147 during development. No state jumps, runtime substitutions, manufactured source changes, historical timestamp backdating, or replacement of sealed reviews.

## Alternatives and decision

**A. Explicit present-time approval producer (selected).** Add `plan-approve #N --current-scope` for an explicitly Full-Auto caller in Develop, Test, or Review. Authenticate the old transition only to establish eligibility. Then approve today's governed source and scope, at today's timestamp, using the ordinary approval transaction. A different historical scope is visible context, never the approval basis.

**B. Make Review consume disabled current policy.** Skipping the audit when the gate is disabled would align one advisory policy snapshot with one consumer, but it would also change Review policy for every non-human or absent approval and supply no current approval evidence. Historical exemption cannot authorize current changed scope. A safe consumer correction would need a broader explicit distinction between historical transition policy and current Review requirements. That is larger semantic scope and does not meet this incident's current-audit requirement.

**C. Broaden reconstruction to accept not-required.** Rejected: it confuses an exemption with approval and cannot safely cross the observed scope mismatch.

A is deliberately opt-in. Ordinary later-stage approval and `--repair-from-evidence` retain their existing routing and refusals. Neither silently selects the new lane.

## Public contract

`TT_FULL_AUTO=1 npx aitm plan-approve <N> --current-scope` records a new current approval only for Develop, Test, or Review. The flag conflicts with `--repair-from-evidence`; unsupported combinations and missing explicit Full-Auto authority refuse before writes. Plan-state ordinary approval remains the existing route. Unknown flags should not be silently treated as authorization.

The caller must have reviewed the current Scope, ACs, linked plan, Story Intent, and applicable exact-source review evidence before invoking this command. The command does not claim a peer-review acceptance it cannot verify, and a successful command does not substitute for independent spec/plan or source review. The operator workflow retains those separate gates. This repair's spec and plan use ordered Claude review; implementation uses exact-head source review.

The new lane refuses directory authority (unsupported by the current Story Intent contract), epics with children, missing substantive linked plan, missing Plan/Develop entries, cancelled/rejected planning, incomplete deep-dive evidence, or unavailable current source observations. The bounded scope is standalone/child code issues with an existing governed linked plan. Existing human approval is preserved without relabeling; an incompatible existing Full-Auto repair marker refuses. Matching current approval is an idempotent audit-reconciliation path. Existing human approval always refuses this lane unchanged, including when stale; it must be handled by its own provenance-preserving workflow. Existing ordinary Full-Auto approval without the new digest also refuses unchanged. Unknown/legacy provenance and waiver-repair approvals refuse unchanged. Only absent approval or a well-formed prior current-scope approval enters this lane.

## Historical admission

Create `scripts/task-tracker/lib/plan-approval-current-scope.mjs` as a focused reader. It consumes a complete GitHub comment observation plus the fresh issue body, repository and issue. It does not call the legacy completed-authority classifier or change its semantics.

Require exactly one admissible Plan-to-Develop authority and matching transition commit for the issue. Both are strict decoded records with matching repository, issue, source, target and transition ID; authority outcome must be `not-required`. Its evidence must be the existing closed gate-policy shape. The matching Develop entry must occur exactly once and match the commit's exact `visitMarker` bytes. Parse the entry with the existing grammar; preserve its visit suffix. Missing commit is a refusal even though old writers treated commit publication as best-effort.

Both comments require stable IDs, trusted OWNER/MEMBER/COLLABORATOR authors, valid creation/update instants, and creation equal to update. Require the two comment authors to match. The completion record actor remains a non-empty historical diagnostic; it is not substituted for GitHub author authentication. Require authority recorded time and comment creation no later than the Develop entry; commit creation no earlier than the entry and authority comment. Use interval ordering for GitHub timestamps: a timestamp lacking fractional precision denotes [second, second + 999ms]. Reject only if the required ordering is impossible across those intervals. A millisecond timestamp denotes that exact instant. This permits a completion comment in the same displayed second as a later millisecond Develop entry without permitting a comment from an earlier second. Require a valid SHA-256 sentinel fingerprint in the immutable commit, but do not pretend it reconstructs displaced sentinel bytes. The completion record is the trusted writer's immutable attestation after board/sentinel verification.

The current singleton sentinel may describe Test, Review, or a later legitimate Develop visit. It neither authenticates nor invalidates the original completion. The exact historical Develop entry must remain present. A missing, edited, malformed, duplicate, conflicting or orphaned authority/commit for the candidate transition fails closed. Multiple valid policy-exempt candidates are ambiguous and refuse. Malformed wrappers cannot be dropped to obtain a unique candidate. Unrelated non-Plan transitions remain unrelated history.

Return immutable admission data: transition ID, authority/commit comment IDs, historical scope identity and exact record fingerprints. Historical scope equality is not required for a new present-time approval. The historical identity is retained in the new audit so the difference remains explicit.

## Current validation and mutation safety

After admission, use the ordinary governed-plan and Story Intent resolver, checklist-command lint, current trunk provenance, adaptive forecast checks when configured, and existing source observation identity. Resolve and record the clean checked-out HEAD and the linked plan's path/content SHA-256. Require the linked plan to be a tracked regular file contained in the checkout, and verify its working bytes equal the same path in HEAD. This binds the plan content to the source commit and excludes ignored or external mutable plans. Compute current scope with the existing scope-identity algorithm without new normalization. An unreadable/dirty source, mismatched binding, missing plan, invalid story, invalid scope, stale required forecast, or failed current validation refuses without approval writes.

Capture a current evidence identity containing repository, issue, state, HEAD, trunk SHA, current scope identity, plan path/content digest, Story Intent binding, forecast identity and authenticated historical admission. Refresh the complete comment observation, board state and source identity immediately before the governed transaction. Every fresh-base callback revalidates body scope, source, plan, Story Intent, forecast, admission-relevant entries and incompatible approval markers against this captured identity. No scope/source drift may be silently rebased into the write. Preserve the existing complete persisted-approval readback and add current-evidence checks after it. If external observations change during the operation, refuse or report persistence mismatch; never claim acceptance from an outdated result.

Keep the write narrow: the new lane writes only the approval marker and canonical current-approval audit. It does not stamp historical Plan entries, wrap/rewrite the deep dive, change source, change state, update visits, or invalidate Test/CI/review receipts. Reuse the ordinary approval binding fields and provenance rather than inventing a waiver ID. Do not set `repairRecordId`.

The new audit variant uses the same canonical heading and approval timestamp, with a closed current-evidence payload containing current scope identity, source HEAD, trunk SHA, linked plan path/digest, and the authenticated historical transition/comment IDs and old scope identity. The producer and canonical audit reader share its exact grammar. The text says the approval is made now under explicit Full-Auto authority and that the historical not-required outcome was admission context only. Existing ordinary and waiver audit bytes remain compatible.

Idempotency requires the current audit's evidence identity and marker binding to match. After a partial audit-post failure, the same marker timestamp can be reconciled only after all current evidence is freshly revalidated. An existing human approval refuses unchanged and does not acquire a Full-Auto audit. An existing current-scope approval whose evidence no longer matches requires a fresh explicit invocation/review and receives a new timestamp; it is never declared already approved from story text alone. Preserve old audit comments as history.

## Implementation boundaries

Modify the existing approval producer, marker/audit codec and the new-audit-only Review freshness check; add the focused current-scope evidence module and tests. Update CLI help and operator guidance for the explicit route. Do not rewrite the legacy waiver reader or broad lifecycle policy. Any shared extraction must preserve existing behavior with regression tests; prefer narrow reuse over refactoring unrelated approval branches.

## Verification

Unit tests use real authority and transition codecs, not handwaved completion booleans. Cover replaced singleton sentinels, multiple visits, valid differing historical scope, duplicates, malformed wrappers, edits, authors, timestamps, missing commits, mismatched identities, orphan intents and refusal before writes.

Producer tests cover explicit mode/flag/state admission; existing human and waiver approval preservation; fresh governed plan/story/source/scope/forecast checks; body retry races, concurrent approval changes and source/board/comment drift; exact persisted readback; partial audit failure and idempotency. Existing ordinary approval and revoked-waiver suites must remain green.

Integration tests exercise the registered public CLI with real codecs and durable isolated local authority, replacing only external provider transports. Generate the original not-required authority and completion via the real transition writer, then advance the singleton through Test/Review. Assert the new route produces current approval and a canonical required-comment audit without changing source, visits or Test evidence. Test supported code-rework integration as the activation sequence and assert old receipts cannot qualify a new HEAD. Such transport-isolated tests are not labeled genuine native host qualification.

The delivered change must also receive fresh exact-head configured Develop verification, full CI/Test receipt, and independent source review. Preserve red/green output and report what was and was not run natively.

## #2147 activation after delivery

Keep #2147 unbound until this repair is accepted, implemented, reviewed and delivered. Record the merged trunk SHA and verify it contains #2153. The coordinator then resumes #2147 at its recorded worktree and accepted source `83cbc7d2afd6268cf9913079497a8b40654533a6`, preserving PR #2152, Test receipt `01M6N4D6WFFQSAYKTYJ8HW3ZZ6`, CI `41974816469`, and all sealed review artifacts.

The old checkout cannot execute code that is absent from its accepted source. Use the existing registered `demote --rework "Integrate delivered #2153 current-approval correction"` route from Review to Develop for genuine integration of the delivered #2153 code. This is real corrective code integration, not an empty change to obtain state access. Integrate the delivered trunk correction using the repository's supported branch synchronization/merge workflow; do not hot-swap node_modules or point the running issue at another checkout's scripts. Resolve conflicts without altering protected source intent; record the new HEAD and retain the old accepted source as ancestry/evidence.

At the new HEAD, review today's scope/plan and the integration, and run the full applicable native qualification, exact-source review, Develop finalization, CI and Test receipt again. Then invoke the delivered `plan-approve --current-scope` against final stamped evidence and verify marker/audit readback. Follow the freshness/retry contract below if subsequent Review normalization changes scope identity. The old receipt/review remains historical, not current acceptance for the new HEAD. Continue through normal Test and Review only when those gates pass. If source/scope no longer matches accepted design, obtain new current review before approval. No audit waiver or historical exemption resolves that mismatch.

This plan defines activation readiness; it does not authorize this worker to bind or mutate #2147 before the coordinator reaches that boundary.

## Durable current-evidence binding

Add one optional marker field, `current-approval-digest`, parsed as `currentApprovalDigest`, containing the SHA-256 fingerprint of the closed current-evidence record. Existing marker fields and legacy approvals remain byte-compatible. The record uses schema `aitm.current-plan-approval/v1` and includes repository, issue, current scope identity, source HEAD, trunk SHA, plan path/content SHA-256, Story Intent binding, nullable forecast ID, historical transition ID, authority/commit comment IDs, historical scope identity and both historical record fingerprints. It excludes the approval timestamp and observed board state: those are operation observations, not scope/source identity. The timestamp remains the approval marker's timestamp.

The audit contains this exact record in canonical encoded form and its fingerprint. The marker binds that fingerprint. This makes partial audit-post recovery safe: reuse the marker timestamp only when a freshly recomputed record hashes to its stored digest. If a record changes, an explicit current-scope invocation may produce a fresh timestamp and digest after current review; preserve prior audits. An ordinary Full-Auto approval without this field refuses unchanged; ordinary approval remains its owner. Invalid or duplicate current-approval marker fields fail closed.

## Review freshness and partial-failure safety

A producer persistence-mismatch result is not sufficient protection: persisted evidence must also be unusable when stale. For approvals bearing the new current-approval digest, require the canonical current audit and matching marker digest, current issue/repository and scope identity, accepted source HEAD, current linked-plan path, marker Story Intent binding and forecast identity. The exact source HEAD binds the tracked plan bytes established at approval. Missing accepted-source observation refuses only this new audit form. Ordinary/human/waiver behavior stays unchanged.

Pass the already-selected source HEAD from the resident Review snapshot through the pure review context. Do not substitute the operator checkout's HEAD when Review is accepting an artifact subject. Validate this new audit both before resident Review reuses an existing pass and when it runs the required-comments gate. This is a narrow integrity check for the new evidence format, not option B's removal of the audit requirement.

After any post-write race, preserve the partial marker/audit for diagnosis and return non-success. Do not attempt a blind rollback over concurrent writes. The narrow consumer check prevents that stale record from qualifying Review. A supported explicit rerun observes and approves the final current evidence or refuses.

Because the existing scope algorithm includes some runtime AC proof attributes, final Test/Review normalization can change scope identity without changing source. Do not silently normalize those changes away. Perform current-scope approval after final Test evidence is stamped; if subsequent Review normalization changes the identity, the new audit must refuse and the operator repeats the explicit current review/approval at the same source before retrying Review. Such refresh does not claim the historical scope was equivalent.

## Normative dispatch and convergence requirements

The CLI must reject unknown flags (including --current-scop), duplicate flags, duplicate issue arguments, and --current-scope combined with --repair-from-evidence with usage exit 2 before any issue/provider read or write. After argument parsing and the board-state read, dispatch --current-scope before automaticModernEligible, waived reconstruction, and the ordinary Plan-only wrong-state precheck. The current-scope lane must never invoke evaluateModernPlanTransitionEvidence or waived reconstruction. Tests must spy on these ports and prove no invocation for a not-required candidate.

Stable current-lane outcomes are approved-current-scope (exit 0), already-approved-current-scope (exit 0, including successful same-digest audit reconciliation), and current-scope-refused (exit 15 with explicit blockers). A failed post-write validation or readback returns current-scope-refused, never exit 0. Existing ordinary/waiver statuses retain their existing exits. Unknown flags must fail loudly even on installations that do not implement --current-scope, rather than fall through to automatic reconstruction; the strict parser change therefore applies to the whole verb.

For a digest-bearing marker, only a matching current-form canonical audit satisfies Review. Ordinary and waiver audits at the same timestamp must fail. Conversely, a current-form audit cannot satisfy a marker lacking the digest. Both resident pass-reuse and required-comments validation must exercise these negative cases.

The public integration test must run the actual resident Review path, including pass-reuse checks, required-comments and applicable body normalization. After final Test evidence is stamped, demonstrate successful Review either directly or after at most one explicit current re-approval at the same source. The second Review pass must leave scope identity stable; an endless approve/normalize/refuse cycle fails acceptance. Do not solve a non-converging fixture by bypassing normalization or changing scope canonicalization. Investigate the real normalization ordering and implement only the bounded sequencing correction required for the new evidence form; if that requires a broader normalization change, return for review before implementation.

Trunk SHA is approval-time provenance. Producer retries resolve current trunk afresh: live-trunk movement intentionally changes the evidence digest and requires a new approval timestamp even when source HEAD is unchanged. Review checks the accepted source and recorded current-evidence binding, rather than requiring live trunk to remain fixed after approval. Test both the producer retry rule and Review's source-based rule.

The real #2147 observation fixture must pin immutable comment provenance: authority 6620373277 has createdAt=updatedAt=2026-11-04T01:51:50Z; completion 6620377056 has createdAt=updatedAt=2026-11-04T01:52:06Z. These are observed values from the diagnosis, not a claim about every non-content GitHub event. Preserve strict equality admission; if future metadata differs, refuse and diagnose rather than silently substituting record fingerprints for the edit signal. Tests exercise this exact pair and a changed-updatedAt refusal.
