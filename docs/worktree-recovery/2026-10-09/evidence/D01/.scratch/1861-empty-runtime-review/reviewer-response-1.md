# Reviewer response 1 — #1861 explicit empty runtime amendment

## Reviewer and target

- Observed reviewer: Claude Opus 5.5 (`claude-opus-5-5`) in a Claude Code desktop session started from `/Users/kpburson/projects/Vibe-Coding/ai-task-manager`. Requested effort: high. The effort setting is not independently observable from inside the session; no claim beyond the request is made.
- Target: `/Users/kpburson/.codex/worktrees/8dae/ai-task-manager/docs/superpowers/specs/2026-10-02-1861-explicit-empty-runtime-design.md` (62 lines as read).
- Handoff SHA-256: `3cd6310adf37aea0a9b38490cb2f1b316b0eda7cc6bdb553cf2a83feb0f35ffd`. **Not independently recomputed.** This session's Bash guard refuses paths outside its own project root, so hashing the 8dae worktree was impossible. File reads succeeded. The author should re-hash before treating this review as bound to those bytes.
- Delivery location: this session's write guard refused the requested review folder ("target outside bound worktree"). The file was written to `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.scratch/1861-empty-runtime-review/reviewer-response-1.md` instead, for the operator to copy into the 8dae review folder.
- Read-only. No edits to target, source, Git state, runtime or lifecycle. No tests run.

## Evidence read

- Target amendment (all lines).
- `docs/superpowers/specs/2026-10-02-1861-runtime-kernel-design.md` (C1 design, including the 2026-10-03 ownership amendment).
- `docs/superpowers/plans/2026-10-01-1857-remaining-work-decomposition.md` (C1–C5; C1 acceptance line 128).
- `docs/reviews/1857-revised-plan-xpr/2026-10-01-1857-stop-reassessment.md`.
- `docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md` (accepted R1–R9 parent; lines 48 and 58).
- Source: `scripts/task-tracker/lib/runtime-initialize.mjs`, `runtime-initialization-record.mjs`, `runtime-storage.mjs`, `runtime-migration-plan.mjs`.

Not read: `runtime-migration-apply.mjs`, `runtime-initialization-recovery.mjs`, `runtime-batch-admission.mjs`, `migrate-runtime.mjs`, the coordinator and census modules, and the tests. Findings that depend on them are marked as assumptions.

## Verdict

**Revise before approval.** The need is real and the direction is correct: Alternative A, a distinct protocol rather than synthetic migration records. The amendment is not yet approvable, for five reasons:

- One accepted-requirement scenario has no supported path (F2).
- It claims a linked-initialization compatibility that the current schema cannot satisfy (F3).
- It duplicates an absence census that already exists in source (F4).
- Canonical reconciliation has no owner (F6).
- An unrelated test-integrity incident is mixed into the design document (F8).

## Source verification of the amendment's factual claims

| Claim (target line) | Observed | Result |
| --- | --- | --- |
| Linked initializer requires an activated main generation (9) | `runtime-initialize.mjs:59-64` refuses `projectRoot === mainRoot` and calls `assertRuntimeReadable` on main | Confirmed |
| Linked initializer rejects roots in the original migration (9) | `runtime-initialize.mjs:79-83` reads `migrations/<txn>/manifest.json` and refuses `original.roots.includes(projectRoot)` | Confirmed |
| Migration planning returns `canonical-reconciliation-required` when there are no sources (9) | `runtime-migration-plan.mjs:274` | Confirmed |
| The earlier C1 claim that proven-empty was "already admitted" is unsupported (9) | Kernel design line 38 makes that claim; no source path admits it | Confirmed. The kernel design sentence is false and should be corrected there as well |
| Fixed records: local state `{}` and queue `[]`; main fleet `{}` and occupancy `{}` (29) | `runtime-storage.mjs:389-395` requires exactly those four; `INITIAL_RUNTIME_RECORDS` holds the two local ones | Consistent |

## Need assessment

The need is stronger than the amendment says. Parent spec line 58 says: "Fresh installs with no legacy runtime initialize an empty valid store."

Today, a never-initialized repo gets `RUNTIME_MIGRATION_REQUIRED` from `assertRuntimeReadable` (`runtime-storage.mjs:320-325`). The only remediation route is migration, and migration blocks on `canonical-reconciliation-required`. So every fresh install of the candidate package is unusable. That makes this a C5 release blocker, not just a total-loss recovery edge case. The amendment frames it mainly as total-loss recovery (line 7). It should lead with fresh install, which is the primary and most frequent case.

Alternative C (defer) is not viable: it fails R2/R3 and parent line 58. Alternative B is correctly rejected, because synthetic sources would break the migration plan's invariant that every file has a trusted source digest.

## Findings

Severity scale:

- **Critical:** blocks the accepted outcome or is unsafe.
- **High:** blocks approval.
- **Medium:** must be resolved in Plan.
- **Low:** clarity only.

### F1 — Medium — Fresh install is the primary case; say so and test it first

Target lines 7 and 49. The verification RED is "empty main-root", which is fine. The scenarios should explicitly cover two distinct cases:

- (a) a fresh clone, where no runtime or legacy location ever existed;
- (b) total loss after activation, for example `git clean -fdX`.

Both must produce the same plan. Case (b) also proves that a prior activation leaves no residue that the census misreads.

### F2 — High — Losing the runtime after activation, with inert legacy retained, leaves no path

After activation, parent spec line 58 requires the originals to be kept "inert for audit" and says they "never regain authority". Now suppose an operator loses or deletes only `.ai-task-manager/runtime/`, while the `.tmp/aitm` originals remain:

- **Empty init refuses**, because legacy data is present (target line 27; decomposition plan line 128 requires "proven total absence of legacy/durable data").
- **Migration would re-import stale pre-activation grants.** That is exactly what the amendment's intent (line 7) and parent line 58 forbid.
- **Cleanup (C3) cannot remove the originals**, because cleanup depends on authoritative new-store reads (parent line 144).

That is a deadlock with no supported route, and the scenario stays realistic until C3 has run.

Required: the amendment must name a disposition. These options are for the author and user to decide; do not pick one silently.

1. **Abandon legacy explicitly.** Empty init may proceed with legacy present only under an explicit, digest-bound operator decision `abandon-legacy-no-import`. The decision records each legacy file's hash, imports nothing and leaves the bytes untouched. This needs a parent-contract wording amendment, because decomposition line 128 currently requires total absence of legacy.
2. **Move legacy aside.** Keep absolute absence, and document a supported operator procedure that moves the legacy originals out of the repo before empty init. This is weaker, because it puts manual file moves on the recovery path.
3. **Declare it unsupported.** State the error and guidance the operator gets. This is honest but leaves R3 partially unmet.

Option 1 is the only one that satisfies both "no stale grants" and "no manual repair". Because it changes accepted wording, it needs user approval.

### F3 — High — "Existing linked v1 initialization" cannot bind an empty main generation

Target lines 31 and 33 say that a later-registered linked worktree uses "its existing separate initialization", and that "existing linked v1 arguments retain their current semantics". The source contradicts both:

- `validRuntimeInitializationPlan` (`runtime-initialization-record.mjs:15-20`) requires a non-empty `mainTransactionId` and a `sha256` `mainPlanDigest`. An empty generation has neither.
- `planRuntimeInitialization` (`runtime-initialize.mjs:79`) always reads `migrations/<txn>/manifest.json`.
- `assertRuntimeReadable` (`runtime-storage.mjs:299-311, 341-371`) requires control `v1` with `transactionId` and `planDigest`. It validates linked roots against the migration manifest and `journal.plan.mainTransactionId`.
- The linked control written by `publish` (`runtime-initialize.mjs:136-145`) is `v1` and bound to `transactionId`.

So linked initialization under an empty main needs two new pieces:

- a new linked plan/journal version (or a versioned union) bound to `{ activationKind, activationId, activationDigest }`;
- a matching linked control `v2`.

Required:

- State this explicitly, and give the new version.
- List the files it touches: `runtime-initialization-record.mjs`, `runtime-initialize.mjs`, and `readControl`/`assertRuntimeReadable` in `runtime-storage.mjs`.

Existing v1 plans and journals stay readable. New linked inits under a migration generation may keep emitting v1.

The "common read-only activation-root result" (line 31) is the right abstraction. Define its exact shape in this amendment, because both C1 and C3 consume it.

### F4 — High — Reuse the migration census as the absence proof; do not write a second one

Target lines 25 and 27 describe a new absence/census prover. `planRuntimeMigration` (`runtime-migration-plan.mjs:83-287`) already does this work for every registered root:

- blocks unavailable, unadmittable and identity-mismatched roots;
- checks whether destinations exist;
- blocks aliases, unexpected file shapes and lock directories;
- inventories legacy data in `.tmp/aitm`, `.db/aitm`, `.ai-task-manager` and `.claude` (allowed-name families);
- validates schemas;
- runs the writer census;
- rechecks that the root census did not change.

A migration plan whose only blocker is `canonical-reconciliation-required` is already a near-complete total-absence observation.

Required: extract one shared read-only census function, for example `observeRuntimeAuthorityCensus`. Migration planning and empty planning both consume it, and the empty plan embeds its digest. Two independent provers will drift: a family added to one but not the other becomes a silent false proof of absence. Sharing the census also cuts the 6–10h allowance.

The shared census has two gaps the empty case must close. Both also affect migration safety.

- **Durable runtime subtree.** The legacy walk skips `.ai-task-manager/runtime`, because `runtime` is not in `allowedNames` (`runtime-migration-plan.mjs:131-147`). The destination check only stats `control.json` and `store/` (`:113-124`). Total absence requires the whole `<root>/.ai-task-manager/runtime/` subtree to be absent in every root. That includes:
  - `migrations/`
  - `initializations/`
  - `batches/` (the kernel journal namespace)
  - staged `initialization-<id>` directories
  - coordinator artifacts

  The only exception is the empty-init operation's own just-acquired coordinator record (line 37). Express this as "the entire prefix is absent", not as an enumerated list that a future namespace could escape.
- **Owner identity in the digest.** The migration plan digest includes `writerObservation` and is computed relative to `adapters.identity()` (`:232-238, :259-273, :283`). Plan and apply run in different processes, so the pid and processToken differ. Required: specify which census fields are bound into the digest (root identities, the absence observation, foreign writers and claims) and which are re-observed fresh at apply (the invoking owner). Otherwise exact approval is either unsatisfiable or binds a dead planning process. Assumption: I did not read how `runtime-migration-apply.mjs` handles this today. If it already solves it, cite that solution and reuse it.

### F5 — Medium (optional design, recommended) — Publish main only; linked roots use linked initialization

Target line 29 publishes state and queue into every root in one multi-root transaction. A smaller design meets the same requirement:

- Prove total absence across all registered roots. The census is unchanged.
- Publish only the main root. Local state/queue, fleet and occupancy all live under main, with one control and one journal.
- Linked roots stay at `RUNTIME_MIGRATION_REQUIRED` until each one runs linked initialization against the empty activation proof (F3). That is the existing behavior for an unknown root under an active main (`runtime-storage.mjs:320-325`).

Benefits:

- No cross-filesystem staging and no partially activated controls across roots.
- The crash matrix covers one root instead of N.
- The "all roots and controls must agree" complexity of line 39 disappears.
- The empty generation's "original roots" set is `[main]`, so linked init's original-root refusal keeps its meaning.

Cost: N explicit linked init commands. That is acceptable, and it matches "new linked roots initialize explicitly" (kernel design line 38).

If the author keeps multi-root publication, they should justify why per-root atomicity is needed, given that linked roots carry no inherited authority.

### F6 — High — Canonical reconciliation has no owner or acceptance

Parent spec line 48: "Complete local runtime loss requires explicit empty-store initialization with no inherited grants **and reconciliation of canonical GitHub/native-host evidence**."

Target line 29 defers this to "a separate normal workflow", and line 45 assigns "canonical consumer reconciliation" to C2. C2's acceptance (decomposition lines 139-148) has no such item, and the term is not defined anywhere.

Required: define what reconciliation means operationally. My reading: the ordinary bind/resume workflow re-establishes binding and occupancy from GitHub issue state and canonical timing comments, with no new code. If that reading is right:

- Add a C1 integration test proving that after empty init an ordinary registered bind succeeds and no grant pre-exists.
- Assign the operator documentation to C4. Its acceptance already covers "total/partial loss, recovery" (decomposition line 184).
- Record this mapping explicitly in the decomposition matrix row "R3 new roots/total loss/generations".

If reconciliation needs code, for example rebuilding occupancy from GitHub, it is new scope and must be estimated.

### F7 — Medium — The amendment reopens C3's frozen contract, which it does not mention

Target line 45 names C2 and C4 as affected. C3's start gate also freezes "physical-root/owner and observation identities, runtime record read/refusal semantics, journal schema/generation/operation IDs" (decomposition line 121).

This amendment adds:

- control `v2`;
- an activation-proof union;
- an empty-init journal namespace;
- a linked plan/journal version (per F3).

C3's protection inventory must protect the new namespace, and cleanup must never propose deleting it (parent line 48).

Required:

- List C3 as affected, and state that its freeze reopens if C3 has already started.
- Cite the single-editor rule for shared files (decomposition line 117), because line 45 claims handler/help hunks. The shared files are `catalog.mjs`, `routing.mjs`, `help-data.mjs` and `bin/aitm.mjs`.

### F8 — High (process/integrity) — The fixture-isolation incident does not belong in this design and needs its own tracked defect

Target line 53 reports that a TIA run did two things:

- overwrote three preserved private fixture files, which were later restored;
- created two records in the actual candidate, which "remain retained".

This is a test-integrity defect, independent of the empty-runtime design:

- **It blocks #1861.** Every further local verification run is blocked; the amendment itself says so ("before another broad selected run"). The repo's Blocked-Task Annotation rule applies to a defect found mid-task that must be fixed before the task can proceed. That defect gets its own issue, plus the `BLOCKED` label, `Blocked By` field and body marker on #1861, and it is driven deepest-first.
- **The two retained records are unidentified.** Required: name their exact paths and hashes, and state that they are excluded from any commit and from the candidate census until they are dispositioned. An unidentified generated file inside the candidate is a latent forged-authority risk.
- **The isolation proof needs a mechanism.** "Prove test callbacks cannot mutate ... genuine session authority" needs something concrete, for example a hash check of a read-only snapshot before and after the TIA run. An intention is not enough.

Required: move this paragraph into a separate defect record, and leave only a one-line cross-reference in the amendment.

### F9 — Medium — Concurrency with migration and the batch kernel

Empty init and migration target the same absent destinations. Their plan-time preconditions are disjoint (`files === 0` versus `files > 0`), but a legacy file can appear between plan and apply. Line 37 serializes both through the main coordinator.

Required tests:

- An empty apply races a migration apply: exactly one wins, and the other refuses with typed drift.
- A legacy file appears after the empty plan: the empty apply refuses.
- A pre-existing kernel `batches/` journal blocks empty planning. This is covered once F4's whole-prefix rule is adopted.

Also state what the census does about legacy-image processes, meaning installed older packages that write `.tmp/aitm` and do not honor runtime leases. Parent line 66 requires them to block. Confirm that the empty path uses the same process census as migration, and test it with a live legacy writer fixture.

### F10 — Low — Interface consistency

- **`inspectEmptyRuntimeInitialization` takes no `adapters` (line 23).** The batch and linked equivalents pass adapters through for identity and census injection. Confirm this is intentional because inspect is pure filesystem.
- **Fixed record bytes.** Reuse `INITIAL_RUNTIME_RECORDS` for the local records, and define a sibling constant for the shared fleet/occupancy bytes (`'{}\n'`). Add a test that `classifyRuntimeRecord(...).validate` accepts every fixed byte string, so generated records cannot drift from the validators in `assertRuntimeStoreRecords`.
- **Publication order differs from the linked initializer.** The linked initializer marks the journal complete *before* the control is active (`runtime-initialize.mjs:191-193`). The amendment publishes controls *before* the journal completes (line 39). Both orders are safe only if readers gate on the journal.
  - State the v2 reader rule explicitly: `assertRuntimeReadable` requires the empty journal to be `complete`, mirroring the manifest check at `runtime-storage.mjs:352`.
  - Say whether the linked initializer should converge on the same order.
- **Typed refusal codes are unspecified.** Name them, following the batch design's explicit refusal list (kernel design line 32). For example: `RUNTIME_EMPTY_INIT_REFUSED` with a blocker list, plus reuse of `RUNTIME_TRANSACTION_INCOMPLETE` and `RUNTIME_MIGRATION_PLAN_CHANGED`.
- **Unavailable roots need remediation guidance.** Blocking on unavailable (prunable) registered roots is correct (line 25). The refusal should tell the operator what to do (`git worktree prune` after they confirm), not just return a code.

### F11 — Medium — Scope, estimate and decomposition

C1 is sized L/12h. Several items now sit on top of that:

- the ownership transfer of seven prerequisite modules and their tests (2026-10-03 amendment);
- this amendment's 6–10h allowance;
- F3's linked v2 work;
- F6's reconciliation test;
- F8's isolation fix.

A plausible total is 20–26h, which is at or over the 24h decomposition threshold. The amendment is right to refuse arithmetic replacement of the forecast (line 59).

Options for the user to decide:

1. **Keep it in C1**, but only if the governed re-estimate stays under 24h after adopting F4 and F5, both of which shrink it.
2. **Split it into a sibling child** under #1857 ("explicit empty runtime initialization"). It would depend on the C1 activation-proof abstraction and block only C5. The C1 batch kernel could then complete and unblock C2 on its own, because C2 consumes the batch interface, not empty init. Moving the decomposition line 128 clause to the new child requires a recorded AC/matrix re-mapping, not silent removal.

Either way, re-estimate through the registered workflow before implementation, as the amendment already states.

## Required versus optional

**Required before approval:**

- F2: a disposition decision.
- F3: a versioned linked/control contract.
- F4: a shared census, a whole-prefix absence rule and a digest-binding rule.
- F6: a reconciliation owner and test.
- F7: the C3 impact and the shared-file rule.
- F8: extraction into a separate defect, and identification of the retained records.
- F9: the race and legacy-writer tests.
- F11: a governed re-estimate.
- Correct the false "already admitted" sentence in the kernel design (line 38).

**Optional design (recommended):**

- F5: main-only publication.
- F10: interface details.
- F1: the scenario split (strongly recommended).

## Assumptions

- `runtime-migration-apply.mjs`, the coordinator, recovery and census modules were not read. F4's owner-identity concern may already be solved there.
- The `migrate-runtime` bootstrap grammar (`initialize-plan`/`apply`/`status`/`resume`) exists as the target describes. Not verified.
- WIP source reflects the state at the time of reading. The handoff hash was not recomputed (see header).

No verification, approval or lifecycle status is claimed by this review.
