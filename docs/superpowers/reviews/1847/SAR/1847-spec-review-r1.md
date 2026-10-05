---
model: gpt-6-astra
requested_effort: medium
native_reviewer_task: sar_1847_astra
artifact_commit: b1c86bd8685910f6d172d876eb5a8ea8b3e8ab5d
review_kind: native-single-agent-review
date: 2026-09-30
---

# Single Agent Review — #1847 governed acceptance-criteria revisions

## Review identity and scope

- **Reviewer:** GPT-6 Astra, Single Agent Review.
- **Reasoning effort:** The effective runtime setting is not exposed to this reviewer; no effort value is asserted.
- **Artifact:** `docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md`.
- **Reviewed commit:** `b1c86bd8685910f6d172d876eb5a8ea8b3e8ab5d`.
- **Source baseline:** `4187a64fae6319808ec350f3beb0f126fc36769b`.
- **Review type:** Read-only first-draft design feedback. No binding, edits, implementation, commits, or lifecycle changes were performed.
- **Verification:** Inspected the committed draft and relevant source. Material source findings below were checked with `git show` against the stated baseline. No implementation tests were run.
- **Authority:** This review is not Refine acceptance, specification ratification, AITM Plan approval, or ai-peer-review protocol acceptance. Provider refusal attempts are not counted as reviews.

## Verdict

**Revise before Refine acceptance.**

The proposed direction is sound: a dedicated, human-authorized revision operation is preferable to weakening ordinary issue-body protections. The draft correctly separates declarations from execution proof, retires aggregate evidence on semantic changes, preserves historical facts, and acknowledges GitHub’s lack of atomic multi-resource writes.

Four material gaps remain. Three affect the promised executable lifecycle and recovery guarantees; one conflicts with the existing canonical-contract invalidation model. These are design acceptance issues, not claims that the unimplemented feature already contains defects.

| ID | Priority | Finding |
|---|---|---|
| SAR-1 | P1 | Canonical issues cannot complete the mandated Plan reapproval path at the baseline |
| SAR-2 | P1 | Coordinator authorization and a prepared comment do not yet define exclusive transaction admission |
| SAR-3 | P1 | Recovery cannot reconcile sealed ownership with replacement executors and partial canonical writes |
| SAR-4 | P2 | Selective preservation conflicts with canonical amendment’s complete proof reset |

## Findings

### SAR-1 — P1: Resolve the canonical Plan-approval incompatibility

**Draft pointers:** Lines 98–102, 127–130, 146–147, and 197–200.

The draft requires a revised issue to obtain new Plan approval and pass normal downstream gates. It also includes canonical-contract issues in its supported behavior. Those promises do not currently compose.

At the baseline, `scripts/task-tracker/verbs/plan-approve.mjs:150–162` explicitly refuses Plan approval when a directory-backed contract or issue directory is present, returning `directory-authority-unsupported` with the explanation that story approval binding is unsupported for directory authority.

A canonical issue revised in Develop and demoted to Plan therefore reaches a required step that the normal command refuses. Merely adding the revision digest to existing approval checks does not resolve that incompatibility.

**Why it matters:** An otherwise successful revision could leave a supported issue unable to regain the authority needed to continue. The end-to-end verification requirement is not achievable through the cited baseline path without additional scoped work or a prerequisite.

**Concrete correction:** State the supported lifecycle matrix explicitly. Choose and document one of these approaches before acceptance:

1. Include canonical Plan approval and revised-contract binding in #1847’s scope.
2. Name a required prerequisite that supplies that path, and refuse canonical revision before writing until it is available.
3. Restrict version one to legacy-body authority and amend the canonical-support claims and tests accordingly.

If canonical support remains, require a canonical fixture to complete actual Plan approval after revision. An injected approval result or manually seeded approval record would not prove the promised lifecycle.

### SAR-2 — P1: Define exclusive transaction admission separately from coordinator authorization

**Draft pointers:** Lines 64–68 and 134–143; cooperative-writer qualification at lines 167–169.

The draft makes the prepared record a fence and requires an exclusive coordinator/writer grant, but it does not define how competing authorized operations become serialized before either changes authority.

The inspected primitives establish narrower properties:

- `github-records/coordination-authority.mjs:866–883` checks grant identity, epoch, coordinator, issue scope, operation, and branch. That authorizes an operation; it does not acquire an exclusive transaction slot.
- `github-records/capsule-chain.mjs:262–280` reads the current head, checks the expected predecessor, and then creates a comment.
- The append path checks the resulting chain again at lines 309–316 and detects forks. It does not provide a server-side conditional append.
- `github-records/contract-source.mjs:166–171` returns `authority: null` for legacy-body contracts. A legacy issue therefore needs an explicit answer for where its proposed exclusive revision ownership originates.

The local mutation lock helps within its defined lock domain. It does not, by itself, settle admission across separate machines or all processes authorized under the same coordinator identity.

**Why it matters:** Two cooperative clients can both observe no pending transaction before either prepared record is visible. Fork detection provides a refusal mechanism once the competing writes are observed, but it is not equivalent to the exclusive admission assumed by the transaction steps. The specification needs to establish when authority mutation is permitted relative to competing preparation and in-flight ordinary writes.

**Concrete correction:** Define the transaction admission contract, including:

- The exact serialization boundary and its owner.
- How legacy issues obtain that authority without silently adopting an unrelated record model.
- Whether multiple processes may act under one coordinator session.
- What happens when two prepared records share a predecessor.
- How an ordinary writer already in progress responds when a revision fence appears.
- Which step is allowed to publish preparation, and which stronger condition permits contract mutation.
- The precise unsupported topology that causes refusal before preparation.

The cooperative-writer limitation should remain. It does not remove the need to specify cooperation among supported clients.

**Required evidence:** Deterministic interleaving tests for two preparations, preparation versus a normal writer, and preparation versus authority replacement. Assert that an unsuccessful contender never mutates current contract or proof.

### SAR-3 — P1: Specify recovery states and an authorized ownership-transfer path

**Draft pointers:** Lines 64–74, 134–163, and 173–176.

The proposal seals the active session/worktree and authority epoch, requires current authorization to match, and then promises recovery from another checkout. It also says that partial or third-party changes require an explicitly authorized repair proposal. The relationship among those rules is incomplete.

Consider these ordinary crash cases:

1. Preparation succeeds, then the executing session disappears and its grant expires or is replaced.
2. A canonical amendment capsule is written, but its singleton projection has not yet been updated.
3. Canonical authority changes successfully, but the issue-body projection remains old.
4. A terminal record is published, but its read-back fails.

For case 1, another checkout may have a different session, worktree, or authority epoch, so the original sealed ownership preconditions no longer hold. For cases 2 and 3, neither “exact before” nor a body-only “exact after” describes the whole authority state.

The baseline demonstrates an intermediate state directly: `github-records/contract-write.mjs:190–201` appends the capsule before updating the contract projection. Its executor explicitly accommodates interruption after either phase.

The draft’s general rule to retain the fence is safe, but it does not define the operation that can resolve these states. A repair proposal also needs a narrow exception to the pending fence; otherwise its own required write could be blocked by the transaction it is meant to repair.

**Why it matters:** The design can fail closed indefinitely after an expected crash unless an operator invents an out-of-band procedure. Alternatively, an implementation may quietly relax the exact authorization or ownership rules to make recovery work.

**Concrete correction:** Add a recovery transition table covering at least:

- Prepared with all before-state resources intact.
- Capsule written, canonical projection old.
- Canonical projection new, body projection old.
- All affected resources new, terminal record absent.
- Terminal publication outcome uncertain.
- Unrelated drift or conflicting authority.
- Original grant expired, revoked, or replaced.

For every state, identify the authoritative observations, permitted next write, required actor/grant, retained fence, and terminal outcome.

Define whether successor ownership requires a new authorization that explicitly references the original transaction and approved proposal. Keep the original authorizer and executor as historical facts, and record the recovering executor separately. Also define the repair proposal’s schema and the narrowly permitted pending-fence operation.

**Required evidence:** Fresh-checkout recovery tests should change the executor and exercise grant replacement, rather than merely reload an unchanged journal under the original identity. Inject failures after each canonical capsule, singleton, body, and terminal-record write.

### SAR-4 — P2: Reconcile selective proof preservation with canonical amendment semantics

**Draft pointers:** Lines 104–108, 117–125, and 146–147.

The draft promises to preserve valid unaffected individual proof while updating canonical contracts through their supported path. The baseline canonical amendment operation does not preserve that subset:

- `github-records/delivery-contract.mjs:449–459` increments the contract epoch, replaces definitions, resets all lifecycle projections, and clears all accepted record IDs.
- Its invalidation result at lines 463–467 reports the removed records and reset checks.
- `invalidateContractProof` also resets the complete lifecycle projection and accepted record list at lines 385–389.
- `github-records/contract-write.mjs:21` exposes `set-check`, `record-evidence`, `seal`, and `invalidate`; its operation interface does not currently expose semantic amendment.

This is not a request to reuse old aggregate evidence. The draft correctly invalidates that evidence. The unresolved question is how unaffected individual evidence becomes valid under the new canonical epoch while old aggregate evidence remains unusable.

**Why it matters:** Following the current amendment semantics loses the promised selective preservation. Reattaching old accepted record IDs without an explicit carry-forward rule risks treating evidence bound to an earlier contract epoch as current authority.

**Concrete correction:** Choose a consistent policy:

- Permit complete canonical proof invalidation and narrow the preservation promise; or
- Add a bounded carry-forward disposition that identifies the old evidence, unchanged criterion identity, verifier bytes, source bindings, and new contract epoch.

If selective preservation remains required, explicitly scope the canonical write-path extension and define which consumers recognize the carry-forward disposition. Historical execution facts must remain unchanged, and carry-forward must never masquerade as a new execution.

**Required evidence:** A fixture with changed AC A and unchanged AC B must show the precise expected outcome for B. Repeat with unchanged B text but a changed shared verifier: B must then be invalidated.

## Refine acceptance obligations

The draft already marks several items as unresolved. That is appropriate for a Backlog input. Before acceptance, turn those items into concrete contracts rather than treating their mention as resolution.

1. **Authorization trust boundary.** Choose at least one implementable adapter. Specify how it obtains an authentic human approval, establishes that the actor may authorize this issue, binds the exact proposal, and handles edited or revoked approval. A caller-supplied “host message” object is not itself trusted evidence. Do not inherit existing boolean human-override behavior as proof of this stronger authorization claim.

2. **Closed wire schema.** Define required fields, stable identifiers, normalization, unknown-field handling, and authorization references. Clarify lines 73–76: verifier changes necessarily contain command data, while the text prohibits a “shell command.” Distinguish inert replacement verifier bytes from any command-execution parameter.

3. **Digest domain.** Define the semantic-contract digest for both authority formats, including criterion identity, declarations, resolved VC bytes, DoD dependencies, and source bindings. Specify which projection-only changes do not change that digest. Legacy positional IDs must not accidentally identify a different criterion after insertion or deletion.

4. **Consumer inventory.** Map the pending fence and revised-contract binding to concrete readers and writers: ordinary issue edits, AC/VC/DoD stampers, Plan approval, transition guards, Test receipts, Agent Review, Final Review, delivery, close, canonical dispositions, and projection repair. Inventory bypass and repair entry points as well as normal CLI routes.

5. **Invalidation matrix.** For each evidence type, state its source of authority, dependency identity, archive representation, retirement operation, and subsequent eligibility rule. Whole-contract approvals and aggregate receipts must remain invalid even when HEAD and verifier commands are unchanged.

6. **Declaration/proof fixtures.** Preserve the draft’s requirement to split consolidated declaration and execution properties. Cover legacy embedded commands, canonical VC references, obsolete unchecked criteria carrying declarations, shared verifiers, malformed citations, and missing declarations. An unchecked replacement must not gain execution authority through marker normalization.

7. **Stage compatibility.** Specify whether the Plan reapproval requirement applies to every semantic revision or only revisions also requiring other story/plan edits. Define expected next actions separately for Refine, Ready for Planning, Plan, and Develop. Preserve the prohibition on direct stage skipping.

8. **Archive and record compatibility.** Select concrete record types and schemas for preparation, application, abort, recovery adoption, and repair. Define size-limit and secret-policy refusals before durable preparation. “Immutable” should mean append-only protocol history under the documented cooperative boundary, not a claim that GitHub comments cannot be edited.

9. **Scope and estimation.** Decide whether the canonical lifecycle work, serialization support, and recovery transfer machinery belong in #1847 or are prerequisites. Derive estimate and size only after those decisions. Keep live ai-peer-review #124 edits and unrelated records outside this work.

## Positive design decisions to retain

- Exact human authorization for a sealed proposal, separated from the executing agent.
- No generic marker-loss or invariant-disable flag.
- Replacement criteria begin unchecked with declaration-only citations.
- Shared-verifier changes invalidate every dependent item.
- Old equal-HEAD aggregate evidence cannot become current again.
- Historical execution facts and lifecycle timing remain historical.
- No automatic rollback that restores retired proof.
- Explicit failure on ambiguous authority, incomplete archives, and unknown formats.
- No inference that drafting or reviewing the specification satisfies implementation checkboxes.

**Final assessment:** Retain the selected dedicated-transaction approach. Resolve SAR-1 through SAR-4 and discharge the concrete Refine obligations before accepting the design. The issue remains a Backlog design input; this review grants no implementation or lifecycle authority.
