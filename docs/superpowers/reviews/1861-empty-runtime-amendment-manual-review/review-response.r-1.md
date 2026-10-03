# Reviewer response r-1 — #1861 explicit empty runtime amendment

## Reviewer and target

- **Reviewer:** Claude Opus 5.5 (`claude-opus-5-5`), Claude Code desktop session, working directory `/Users/kpburson/.codex/worktrees/8dae/ai-task-manager`. Effort requested: high. The session cannot observe its own effort setting, so this review claims nothing beyond the request.
- **Target:** `docs/superpowers/specs/2026-10-02-1861-explicit-empty-runtime-design.md` (62 lines as read).
- **Target SHA-256:** `3cd6310adf37aea0a9b38490cb2f1b316b0eda7cc6bdb553cf2a83feb0f35ffd`. I recomputed it, and it matches the hash in the handoff README.
- **Scope:** read-only. No edits to the target, source, Git state, runtime or lifecycle, and no tests run.
- **File name:** this file follows the user's instruction (`review-response.r-<turn>.md`), not the README's `reviewer-response-N.md`.

## Evidence read

- Target amendment (all lines).
- `docs/superpowers/specs/2026-10-02-1861-runtime-kernel-design.md` (C1 design, including the 2026-10-03 ownership amendment).
- `docs/superpowers/plans/2026-10-01-1857-remaining-work-decomposition.md` (C1–C5; C1 acceptance is at line 128).
- `docs/reviews/1857-revised-plan-xpr/2026-10-01-1857-stop-reassessment.md`.
- `docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md` (the accepted R1–R9 parent; lines 48 and 58 matter most here).
- Source:
  - `scripts/task-tracker/lib/runtime-initialize.mjs`
  - `runtime-initialization-record.mjs`
  - `runtime-storage.mjs`
  - `runtime-migration-plan.mjs`

**Not read:**

- `runtime-migration-apply.mjs`
- `runtime-initialization-recovery.mjs`
- `runtime-batch-admission.mjs`
- `migrate-runtime.mjs`
- the coordinator and census modules
- the tests

Findings that depend on these files are marked as assumptions.

## Verdict

**Revise before approval.**

The need is real, and the direction is correct: Alternative A, a distinct protocol instead of synthetic migration records.

The amendment is not approvable yet, for five reasons:

- **F2:** One scenario covered by the accepted requirements has no supported path.
- **F3:** It claims compatibility with linked initialization that the current schema cannot support.
- **F4:** It specifies a second absence census, although one already exists in source.
- **F6:** Canonical reconciliation has no owner.
- **F8:** An unrelated test-integrity incident is mixed into the design.

## Source check of the amendment's factual claims

| Claim (target line) | Observed in source | Result |
| --- | --- | --- |
| The linked initializer requires an activated main generation (9) | `runtime-initialize.mjs:59-64` refuses `projectRoot === mainRoot` and calls `assertRuntimeReadable` on main | Confirmed |
| The linked initializer rejects roots included in the original migration (9) | `runtime-initialize.mjs:79-83` reads `migrations/<txn>/manifest.json` and refuses `original.roots.includes(projectRoot)` | Confirmed |
| Migration planning returns `canonical-reconciliation-required` when there are no sources (9) | `runtime-migration-plan.mjs:274` | Confirmed |
| The earlier C1 claim that proven-empty initialization was "already admitted" is unsupported (9) | Kernel design line 38 makes that claim; no source path admits it | Confirmed. The kernel design sentence is false and should be corrected there too |
| The fixed records are local state `{}` and queue `[]`, plus main fleet `{}` and occupancy `{}` (29) | `runtime-storage.mjs:389-395` requires exactly those four; `INITIAL_RUNTIME_RECORDS` holds the two local ones | Consistent |

## Need assessment

The need is stronger than the amendment states.

Parent spec line 58: "Fresh installs with no legacy runtime initialize an empty valid store." Today that path does not exist:

1. A never-initialized repo gets `RUNTIME_MIGRATION_REQUIRED` from `assertRuntimeReadable` (`runtime-storage.mjs:320-325`).
2. The only remediation route is migration.
3. Migration blocks on `canonical-reconciliation-required` when there are no sources.

So every fresh install of the candidate package is unusable. That makes this a C5 release blocker, not just a total-loss recovery edge case. The amendment frames it mainly as total-loss recovery (line 7). It should lead with fresh install, which is the main and most frequent case.

The alternatives:

- **Alternative C (defer) is not viable.** It fails R2/R3 and parent line 58.
- **Alternative B is rightly rejected.** Synthetic sources would break the migration plan's invariant that every file has a trusted source digest.

## Findings

Severity scale:

- **Critical:** blocks the accepted outcome, or is unsafe.
- **High:** blocks approval.
- **Medium:** must be resolved in Plan.
- **Low:** clarity only.

### F1 — Medium — Make fresh install the primary case, and test it first

Target lines 7 and 49. The verification RED is "empty main-root", which is fine. The scenarios should explicitly cover two distinct cases:

- **(a) Fresh clone.** No runtime or legacy location ever existed.
- **(b) Total loss after activation.** For example, after `git clean -fdX`.

Both must produce the same plan. Case (b) also proves that a prior activation leaves no residue that the census misreads.

### F2 — High — If the runtime is lost after activation while inert legacy data remains, there is no recovery path

After activation, parent spec line 58 requires the originals to be kept "inert for audit", and says they "never regain authority".

Now suppose an operator loses or deletes only `.ai-task-manager/runtime/`, while the `.tmp/aitm` originals remain:

- **Empty init refuses,** because legacy data is present. See target line 27, and decomposition plan line 128, which requires "proven total absence of legacy/durable data".
- **Migration would re-import stale pre-activation grants.** That is exactly what the amendment's intent (line 7) and parent line 58 forbid.
- **Cleanup (C3) cannot remove the originals,** because cleanup depends on authoritative new-store reads (parent line 144).

The result is a deadlock with no supported route. The scenario stays realistic until C3 has run.

**Required:** the amendment must name a disposition. These options are for the author and user to decide; do not pick one silently.

1. **Abandon legacy explicitly.** Empty init may proceed with legacy present, but only under an explicit, digest-bound operator decision `abandon-legacy-no-import`. The decision records each legacy file's hash, imports nothing, and leaves the bytes untouched. This needs a parent-contract wording amendment, because decomposition line 128 currently requires total absence of legacy data.
2. **Move legacy aside.** Keep absolute absence, and document a supported operator procedure that moves the legacy originals out of the repo before empty init. This is weaker, because it puts manual file moves on the recovery path.
3. **Declare it unsupported.** State which error and guidance the operator gets. This is honest, but it leaves R3 partly unmet.

Only option 1 satisfies both "no stale grants" and "no manual repair". Because it changes accepted wording, it needs user approval.

### F3 — High — The existing linked v1 initialization cannot bind an empty main generation

Target lines 31 and 33 say a linked worktree registered later uses "its existing separate initialization", and that "existing linked v1 arguments retain their current semantics". The source contradicts both claims:

- `validRuntimeInitializationPlan` (`runtime-initialization-record.mjs:15-20`) requires a non-empty `mainTransactionId` and a `sha256` `mainPlanDigest`. An empty generation has neither.
- `planRuntimeInitialization` (`runtime-initialize.mjs:79`) always reads `migrations/<txn>/manifest.json`.
- `assertRuntimeReadable` (`runtime-storage.mjs:299-311, 341-371`) requires a control `v1` with `transactionId` and `planDigest`. It validates linked roots against the migration manifest and `journal.plan.mainTransactionId`.
- The linked control written by `publish` (`runtime-initialize.mjs:136-145`) is `v1` and bound to `transactionId`.

So linked initialization under an empty main needs two new pieces:

- a new linked plan and journal version (or a versioned union), bound to `{ activationKind, activationId, activationDigest }`;
- a matching linked control `v2`.

**Required:**

- State this explicitly, and give the new version.
- List the files it touches: `runtime-initialization-record.mjs`, `runtime-initialize.mjs`, and `readControl`/`assertRuntimeReadable` in `runtime-storage.mjs`.

Existing v1 plans and journals stay readable. New linked initializations under a migration generation may keep writing v1.

The "common read-only activation-root result" (line 31) is the right abstraction. Define its exact shape in this amendment, because both C1 and C3 consume it.

### F4 — High — Reuse the migration census as the absence proof; do not write a second one

Target lines 25 and 27 describe a new absence and census prover. `planRuntimeMigration` (`runtime-migration-plan.mjs:83-287`) already does the same work for every registered root:

- blocks unavailable, unadmittable and identity-mismatched roots;
- checks whether destinations already exist;
- blocks aliases, unexpected file shapes and lock directories;
- inventories legacy data in `.tmp/aitm`, `.db/aitm`, `.ai-task-manager` and `.claude` (allowed-name families only);
- validates schemas;
- runs the writer census;
- rechecks that the root census did not change.

A migration plan whose only blocker is `canonical-reconciliation-required` is already a near-complete observation of total absence.

**Required:** extract one shared read-only census function, for example `observeRuntimeAuthorityCensus`:

- Migration planning and empty planning both call it.
- The empty plan embeds its digest.

Two independent provers will drift. A family added to one but not the other becomes a silent false proof of absence. Sharing the census also cuts into the 6–10h allowance.

The shared census has two gaps that the empty case must close. Both gaps also affect migration safety.

**Gap 1: the durable runtime subtree.**

- The legacy walk skips `.ai-task-manager/runtime`, because `runtime` is not in `allowedNames` (`runtime-migration-plan.mjs:131-147`).
- The destination check only stats `control.json` and `store/` (`:113-124`).

Total absence requires the whole `<root>/.ai-task-manager/runtime/` subtree to be absent in every root. That covers:

- `migrations/`
- `initializations/`
- `batches/` (the kernel journal namespace)
- staged `initialization-<id>` directories
- coordinator artifacts

The only exception is the coordinator record the empty-init operation itself has just acquired (line 37). Write the rule as "the entire prefix is absent", not as an enumerated list that a future namespace could escape.

**Gap 2: owner identity in the digest.**

The migration plan digest includes `writerObservation` and is computed relative to `adapters.identity()` (`:232-238, :259-273, :283`). Plan and apply run in different processes, so their pid and processToken differ.

**Required:** specify which census fields are bound into the digest, and which are freshly re-observed at apply:

- **Digest-bound:** root identities, the absence observation, foreign writers and claims.
- **Re-observed at apply:** the invoking owner.

Otherwise exact approval is either impossible to satisfy, or it binds a planning process that has already exited.

Assumption: I did not read how `runtime-migration-apply.mjs` handles this today. If it already solves the problem, cite that solution and reuse it.

### F5 — Medium (optional, recommended) — Publish only the main root; linked roots use linked initialization

Target line 29 publishes state and queue into every root, in one multi-root transaction. A smaller design meets the same requirement:

- **Census across all roots.** Prove total absence across every registered root, exactly as now.
- **Publish main only.** Local state, queue, fleet and occupancy all live under main, with one control and one journal.
- **Linked roots initialize themselves.** They stay at `RUNTIME_MIGRATION_REQUIRED` until each runs linked initialization against the empty activation proof (F3). That is the existing behavior for an unknown root under an active main (`runtime-storage.mjs:320-325`).

Benefits:

- No staging across filesystems, and no partially activated controls spread across roots.
- The crash matrix covers one root instead of N.
- Line 39's "all roots and controls must agree" complexity disappears.
- The empty generation's set of original roots is `[main]`, so linked init's refusal of original roots keeps its meaning.

Cost: N explicit linked-init commands. That is acceptable, and it matches "new linked roots initialize explicitly" (kernel design line 38).

If the author keeps multi-root publication, they should justify why per-root atomicity is needed, given that linked roots carry no inherited authority.

### F6 — High — Canonical reconciliation has no owner and no acceptance

Parent spec line 48: "Complete local runtime loss requires explicit empty-store initialization with no inherited grants **and reconciliation of canonical GitHub/native-host evidence**."

The amendment does not cover this:

- Target line 29 defers it to "a separate normal workflow".
- Line 45 assigns "canonical consumer reconciliation" to C2.
- C2's acceptance (decomposition lines 139-148) contains no such item, and the term is not defined anywhere.

**Required:** define what reconciliation means in operation. My reading: the ordinary bind/resume workflow re-establishes binding and occupancy from GitHub issue state and canonical timing comments, with no new code. If that reading is right:

- **Test.** Add a C1 integration test proving that, after empty init, an ordinary registered bind succeeds and no grant pre-exists.
- **Docs.** Assign the operator documentation to C4. Its acceptance already covers "total/partial loss, recovery" (decomposition line 184).
- **Matrix.** Record this mapping in the decomposition matrix row "R3 new roots/total loss/generations".

If reconciliation needs code, for example rebuilding occupancy from GitHub, it is new scope and must be estimated.

### F7 — Medium — The amendment also reopens C3's frozen contract, and does not say so

Target line 45 lists C2 and C4 as affected. C3's start gate also freezes "physical-root/owner and observation identities, runtime record read/refusal semantics, journal schema/generation/operation IDs" (decomposition line 121).

This amendment changes that frozen surface. It adds:

- control `v2`;
- an activation-proof union;
- an empty-init journal namespace;
- a new linked plan/journal version (per F3).

C3's protection inventory must protect the new namespace, and cleanup must never propose deleting it (parent line 48).

**Required:**

- List C3 as affected, and state that its freeze reopens if C3 has already started.
- Line 45 claims handler/help hunks in shared files, so cite the single-editor rule for those files (decomposition line 117). The shared files are `catalog.mjs`, `routing.mjs`, `help-data.mjs` and `bin/aitm.mjs`.

### F8 — High (process/integrity) — The fixture-isolation incident does not belong in this design; it needs its own tracked defect

Target line 53 reports that a TIA run:

- overwrote three preserved private fixture files, which were later restored;
- created two records in the actual candidate, which "remain retained".

This is a test-integrity defect, independent of the empty-runtime design.

**It blocks #1861.** Every further local verification run is blocked; the amendment says so itself ("before another broad selected run"). The repo's Blocked-Task Annotation rule applies, because this defect was found mid-task and must be fixed before the task can proceed. Under that rule:

- the defect gets its own issue;
- #1861 gets the `BLOCKED` label, the `Blocked By` field and the body marker;
- the defect is driven to Done deepest-first, before #1861 resumes.

**The two retained records are unidentified.** Name their exact paths and hashes. State that they are excluded from every commit, and from the candidate census, until they have a disposition. An unidentified generated file inside the candidate is a latent forged-authority risk.

**The isolation proof needs a mechanism.** "Prove test callbacks cannot mutate ... genuine session authority" needs something concrete. One option: hash a read-only snapshot before and after the TIA run, and fail on any difference. An intention is not enough.

**Required:** move this paragraph into a separate defect record, and leave a one-line cross-reference in the amendment.

### F9 — Medium — Concurrency with migration and the batch kernel

Empty init and migration target the same absent destinations. Their plan-time preconditions are disjoint (`files === 0` versus `files > 0`), but a legacy file can appear between plan and apply. Line 37 serializes both operations through the main coordinator.

**Required tests:**

- **Racing applies.** An empty apply races a migration apply. Exactly one wins, and the other refuses with typed drift.
- **Late legacy file.** A legacy file appears after the empty plan, and the empty apply refuses.
- **Existing batch journal.** A pre-existing kernel `batches/` journal blocks empty planning. F4's whole-prefix rule covers this once adopted.

Also state how the census treats legacy-image processes: installed older packages that write `.tmp/aitm` and do not honor runtime leases.

- Parent line 66 requires such processes to block.
- Confirm that the empty path uses the same process census as migration.
- Test it with a live legacy-writer fixture.

### F10 — Low — Interface consistency

**`inspectEmptyRuntimeInitialization` takes no `adapters` (line 23).** The batch and linked equivalents pass adapters through for identity and census injection. Confirm the omission is intentional, i.e. that inspect is purely a filesystem read.

**Fixed record bytes.**

- Reuse `INITIAL_RUNTIME_RECORDS` for the local records.
- Define a sibling constant for the shared fleet and occupancy bytes (`'{}\n'`).
- Add a test that `classifyRuntimeRecord(...).validate` accepts every fixed byte string. Then generated records cannot drift from the validators in `assertRuntimeStoreRecords`.

**Publication order differs from the linked initializer.** The linked initializer marks the journal complete *before* the control becomes active (`runtime-initialize.mjs:191-193`). The amendment publishes controls *before* the journal completes (line 39). Both orders are safe only if readers check the journal first.

- State the v2 reader rule explicitly: `assertRuntimeReadable` requires the empty journal to be `complete`, mirroring the manifest check at `runtime-storage.mjs:352`.
- Say whether the linked initializer should converge on the same order.

**Typed refusal codes are unspecified.** Name them, following the batch design's explicit refusal list (kernel design line 32). For example:

- `RUNTIME_EMPTY_INIT_REFUSED`, with a blocker list;
- reuse of `RUNTIME_TRANSACTION_INCOMPLETE`;
- reuse of `RUNTIME_MIGRATION_PLAN_CHANGED`.

**Unavailable roots need remediation guidance.** Blocking on unavailable (prunable) registered roots is correct (line 25). The refusal should also tell the operator what to do (`git worktree prune`, after they confirm), not just return a code.

### F11 — Medium — Scope, estimate and decomposition

C1 is sized L/12h. Several items now sit on top of that:

- the ownership transfer of seven prerequisite modules and their tests (2026-10-03 amendment);
- this amendment's 6–10h allowance;
- F3's linked v2 work;
- F6's reconciliation test;
- F8's isolation fix.

A plausible total is 20–26h, at or over the 24h decomposition threshold. The amendment is right not to replace the forecast with arithmetic (line 59).

Options for the user to decide:

1. **Keep it in C1,** but only if the governed re-estimate stays under 24h after adopting F4 and F5. Both of those shrink the work.
2. **Split it into a sibling child** under #1857, "explicit empty runtime initialization".
   - It would depend on C1's activation-proof abstraction and block only C5.
   - The C1 batch kernel could then complete and unblock C2 on its own, because C2 consumes the batch interface, not empty init.
   - Moving the decomposition line 128 clause to the new child needs a recorded AC and matrix re-mapping, not silent removal.

Either way, re-estimate through the registered workflow before implementation, as the amendment already states.

## Required versus optional

**Required before approval:**

- **F2:** a disposition decision.
- **F3:** a versioned linked and control contract.
- **F4:** a shared census, a whole-prefix absence rule and a digest-binding rule.
- **F6:** an owner and a test for reconciliation.
- **F7:** the C3 impact, and the shared-file rule.
- **F8:** a separate defect record, and identification of the two retained records.
- **F9:** the race tests and the legacy-writer test.
- **F11:** a governed re-estimate.
- **Kernel design fix:** correct the false "already admitted" sentence (kernel design line 38).

**Optional, recommended:**

- **F5:** main-only publication.
- **F10:** interface details.
- **F1:** the fresh-install / total-loss scenario split (strongly recommended).

## Assumptions

- I did not read `runtime-migration-apply.mjs`, or the coordinator, recovery and census modules. F4's owner-identity concern may already be solved there.
- I assumed the `migrate-runtime` bootstrap grammar (`initialize-plan`, `apply`, `status`, `resume`) exists as the target describes. I did not verify it.
- The WIP source reflects its state at the time I read it.

This review claims no verification, approval or lifecycle status.
