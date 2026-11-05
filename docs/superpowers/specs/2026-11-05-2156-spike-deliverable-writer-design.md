# Governed spike deliverable publication — #2156

## Intent

A spike can deliver genuine findings in its issue record without producing source code. The existing no-commit delivery and resident-audit Close paths understand that distinction, but the only production caller of `setDeliverablePosted` is `epic-reconcile`, which intentionally refuses non-epics. #2146 therefore has no registered command to attach its existing report as deliverable evidence. This change adds that missing writer; it does not close or activate #2146.

## Scope and authority

Human AFK completion authority for #2039, delegated through coordinator chat 01a1a1d9-519c-7db0-b41f-858ad4826d25, authorizes this independent production issue through reviewed implementation and delivery. Source baseline is delivered trunk bb0c008dce2dd56c32a766964f43724250fb1b4e. Preserve #2153's accepted checkout/history and all #2146/#2145 evidence. #2155 owns deep-dive recovery. The epic owner alone manages the shared Claude installation.

The implementation is native Node ESM in the existing AITM package, with no new dependency. Proposed builder calls below are author decisions for review, not claims that the human selected the exact interface.

## Public behavior

Add exactly one registered command:

`npx aitm spike-deliverable <issue> --from-comment <numeric-id|canonical-same-issue-url>`

It attaches an existing comment; it does not create, edit or delete that comment. The issue number and comment option are each required exactly once. Reject malformed numbers, cross-repository/issue URLs, trailing URL material, duplicate/unknown flags and ambiguous input with usage exit 2. A supported refusal returns nonzero with a stable category, without a success message. Success reports the issue, exact verified comment URL and whether publication changed or already matched the body.

The deliberately narrow first version operates only on an open **spike** in **Develop**, the current stage of #2146. Code, docs-only, epic, audit and research kinds are refused. Backlog, Refine, Ready for Planning, Plan, Test, Review and Done are refused. It never changes kind or stage. Restricting publication to Develop avoids modifying an accepted Test/Review artifact after verification; publishing the marker remains a prerequisite to subsequent ordinary native Test and Review.

There is no new artifact-selection flag: publication is bound to the actual operator's clean current source HEAD. The writer does not claim that HEAD has passed Test, Review, source acceptance or delivery. Those remain independent exact-source gates. A separately installed reviewed runtime may operate in the real spike checkout only through an independently qualified activation route; changing the runtime must not change or substitute the spike's source subject.

## Source-grounded existing interfaces

- `scripts/task-tracker/task-tracker.mjs`: registered dispatch and `PREFLIGHT_MODE`; use target-required preflight.
- `scripts/task-tracker/verbs/epic-reconcile.mjs`: existing comment-reference parsing and epic-only behavior; preserve its public contract.
- `scripts/task-tracker/lib/issue-kind.mjs`: existing `parseIssueKind`, `parseDeliverablePosted` and conflict-intolerant `setDeliverablePosted`. Preserve the marker wire format (`url`, `ts`) and existing readers.
- `scripts/task-tracker/lib/issue-body-mutate.mjs`: fresh mutation closure, governed versioning, marker/section preservation, synchronous and asynchronous fresh-base validation, verified returned body.
- `scripts/task-tracker/lib/artifact-execution.mjs`: real native operator/session/binding capture and reassertion. Do not pass another session's identity or relabel execution context.
- `scripts/task-tracker/lib/issue-proof-authority.mjs`: capture and compare governed scope, stage/visit and receipt authority while preserving unrelated updates.
- `scripts/task-tracker/lib/decomposition-effect-admission.mjs`: `assertScopedDecompositionEffect`, activity `scoped-deliverable`, before each write.
- Existing native preflight/ownership/state readers must remain production authority. Dependency seams may isolate provider transport in tests; a substituted authority result is never live native proof.
- `deliverNoCommit` in `verbs/deliver.mjs`, `lib/no-commit-delivery-record.mjs`, `lib/delivery-preflight.mjs` and the resident-audit Close path already own later acceptance and no-commit delivery. This writer does not alter them.

## Before-write evidence

Capture the genuine current session's issue, binding generation, real worktree, branch and HEAD with the existing native operator primitives. Require an active unpaused timer, exact target binding, singleton authenticated issue ownership, live board/body Develop agreement and spike kind. The tracked worktree/index must be clean. Ignored findings and scratch are not source code and may remain. Do not create a commit trail for a spike, override identity, or accept a caller-supplied SHA as authority.

Fetch the exact comment through the provider from this configured repository. Require a positive matching numeric comment ID, canonical HTML URL identifying this exact repository and issue, nonempty body, current authenticated author's login, and valid provider creation/update metadata. The writer validates a current observation; it does not impose a new historical immutability requirement on an edited report. Capture a deterministic observation identity over ID, URL, author, body and timestamps for race comparison. A bot/deleted/missing/cross-issue/malformed or differently authored comment is refused. This establishes current provenance, not the semantic truth of every finding in the report.

Before every attempted body write, revalidate the native operator, ownership/live state, issue proof authority and exact source HEAD/cleanliness, fetch the comment again, compare its observation identity, and assert scoped-deliverable admission. A comment edit/deletion, source/index mutation, binding/generation/actor drift, stage/kind/scope/receipt change or ownership loss refuses. Body-version-only or unrelated additive changes may be preserved by the existing fresh-base transaction. A changed governed scope requires a fresh invocation, not silent rebinding.

## Mutation, conflicts and readback

Use `mutateIssueBody` with a closure deriving from every fresh base; never push a captured complete body. Add only the existing deliverable marker through `setDeliverablePosted`. The new writer strictly validates its own marker claims in the authoritative AITM Progress Markers section before treating a pre-existing marker as idempotent: duplicate, malformed, bare legacy or conflicting-URL claims refuse. Do not broaden existing marker readers or loosen epic reconciliation to solve this story.

If one valid existing marker names the same exact comment URL, preserve the body bytes and original timestamp. Repeating the operation is a true no-op after all current authority/comment checks, not a success from an unchecked cached marker. A different URL is a conflict requiring explicit future reconciliation; this command cannot replace it.

After the transaction, require a coherent returned versioned body and exactly one valid marker with the expected URL; compare the persisted governed authority and source/operator again. Re-fetch the comment once more and require the same observation. Failed write, missing or mixed marker, changed scope/source/comment, malformed result or readback mismatch must never print success. If uncertainty occurs after a remote write, preserve the evidence and surface the refusal; do not erase the marker, forge a success, or silently retry with a changed subject. A later explicit invocation starts from current authority and may converge idempotently.

## Files and boundaries

Prefer two focused runtime files: `lib/spike-deliverable.mjs` for pure argument/comment/marker validation and observation identities, and `verbs/spike-deliverable.mjs` for the guarded native transaction. Keep production I/O in the verb/default adapters. Register dispatch, preflight, canonical catalog/help, effect/admission inventories and any required command-surface grammar. Add exactly the intentional runtime entries to package-boundary expectations; retain the exact ceiling with no spare allowance. Do not refactor large neighboring subsystems.

Tests belong in `scripts/tests/unit/task-tracker/verbs/spike-deliverable.test.mjs` for pure and transport-isolated behavior and `scripts/tests/integration/task-tracker/spike-deliverable.test.mjs` for real Git/native binding/body-writer boundaries. Keep physical Git out of unit tests. Use canonical test discovery and story tags, normal public temporary-repository helpers and explicit provider transport seams. No live issue is a test fixture.

## Verification and acceptance

Observe RED before implementing each missing behavior, then GREEN. Cover valid publication, exact no-op preserving timestamp, malformed/duplicate/conflicting markers, all kind/stage refusals, wrong actor/owner/issue/branch/generation, paused timer, dirty/source drift, malformed/edited/deleted/wrong-author comment, real fresh-base retries, preserved unrelated updates and false provider readback. Assertions require real marker/body/exit behavior, not mock existence or source-text snapshots.

Public command tests cover help/usage and registered dispatch/preflight behavior; integration runs the real writer and real governed versioned body transaction with isolated provider transport. Exercise native binding/source checks against real disposable Git and timing/binding records. Document every substituted boundary and do not call fixture success native host qualification. Retain existing epic-reconcile non-epic refusal and no-commit delivery/Close tests as regression checks.

Run both declared targeted suites, full unit/integration/slow CI including separate CodeQL, full lint/format and package compatibility at the final exact head. Independent whole-source review, native AC proof, Develop finalization, Test, Review, approval and live-verified supported delivery remain distinct gates. #2147 currently owns the exclusive native Test slot; wait for coordinator release before this issue's Test.

## Review and activation

Before implementation, obtain builder check and ordered Claude specification/plan review. Use official launch/resume with `DISABLE_AUTOUPDATER=1`, fresh actual binary health and verified supported child-environment handling. Do not repair shared Claude or infer successful child propagation from a helper-only probe. A launch ACK is not review submission or acceptance. Preserve any uncertain review and follow event-derived recovery.

After this issue's reviewed delivery, the coordinator separately qualifies #2146 activation, potentially using the scoped-install precedent from #2106. Preserve the spike's original source/timing/history; do not claim old investigation checks test this new code. The actual report comment must be freshly validated by the delivered writer, then the spike must obtain current native no-commit qualification and delivery/Close through its own authority. This implementation does not activate or advance #2146.
