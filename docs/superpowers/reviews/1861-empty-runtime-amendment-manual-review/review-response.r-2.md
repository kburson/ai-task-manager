# Reviewer response r-2 — #1861 explicit empty runtime amendment

## Reviewer, inputs and limits

- **Reviewer:** Claude Opus 5.5 (`claude-opus-5-5`), the same session as r-1. Requested effort: high. The session cannot observe its own effort setting, so this review claims nothing beyond the request.
- **Target:** `docs/superpowers/specs/2026-10-02-1861-explicit-empty-runtime-design.md` (112 lines as read).
  - The author reports its SHA-256 as `0e0b2bd447b5e3fb301cccbed620bbac5554ac476a4e1740c9836a59d00dcd8d`.
  - **I did not recompute this hash.** This session's Bash guard now fails closed in this worktree ("Foreign project root requires registered admission: CLAUDE_PROJECT_DIR", which is left over from the session's original directory). I did not bypass the guard.
  - The author should re-hash before binding any acceptance to these bytes.
- **Also read in full:**
  - `author-response-r1.md`
  - `verification-integrity-r1.md`
- **Source spot-checks for this round:**
  - `skill/shared/rules/block.md` (v1.2.0)
  - `docs/reviews/1857-revised-plan-xpr/1857-delivery-report.md:26`
  - `runtime-migration-apply.mjs:207-216`
  - the r-1 reads of `runtime-storage.mjs`, `runtime-initialize.mjs`, `runtime-initialization-record.mjs` and `runtime-migration-plan.mjs`
- **Scope:** read-only. No edits to the target, source, Git state or lifecycle, and no tests or package tooling.

## Verdict

**Revise (minor).** I accept every F1–F11 disposition, including the four the author contested.

Two new contract gaps remain in the revised linked-v2 interface (R2-1, R2-2). Both are small and local. If round 3 closes them without other material change, I expect to accept the exact bytes manually.

Nothing here is Plan approval, implementation authority, XPR acceptance or delivery.

## Corrections to my r-1

- **F5 premise was wrong.** `runtime-storage.mjs:320-324` returns `RUNTIME_CONTROL_INVALID` ("Partial runtime loss") when a linked root has no local control but a shared control exists. It does not return `RUNTIME_MIGRATION_REQUIRED`. The revised line 27 correctly treats reader classification as new work.
- **F8 annotation recipe was outdated.** Delivered `skill/shared/rules/block.md` v1.2.0, lines 35-54, makes GitHub native dependencies the sole graph authority. It forbids hand-rolling the legacy `BLOCKED` label, the `Blocked By` field or the body marker. I had followed this repo's `CLAUDE.md` "Blocked-Task Annotation" section, which still prescribes the legacy procedure. That stale instruction is out of scope here, and I recommend a separate docs correction.
- **F2 "only option 1" was overstated.** Option 1 is the only option that satisfies both "no stale grants" and "no manual repair". Neither the accepted R3 nor any other accepted clause requires recovery from selective durable loss. Parent line 48 ("partially missing stores refuse as corruption"), parent line 72 (exact package/backup restoration) and delivery report line 26 ("absence of legacy durable data") all support option 3.

## Disposition review

| Finding | Author disposition | Reviewer position |
| --- | --- | --- |
| F1 | Fresh install leads; "same plan" means the same policy and records, not the same bytes | Accepted. My intent was the same policy. |
| F2 | Option 3: protected refusal; abandonment is deferred to a separate contract decision | Accepted. The revised line 15 is explicit and honest. C4 docs must describe this refusal and its supported dispositions. That is already within C4's "total/partial loss, recovery" acceptance. |
| F3 | Activation observation, control v2, linked plan/journal/control v2; v1 preserved | Accepted, except for R2-1. |
| F4 | Shared `observeRuntimeAuthorityCensus`; whole-prefix absence including empty directories; stable projection; fresh owner | Accepted. Verified: `runtime-migration-apply.mjs:213-215` compares full fresh-plan digests, so the author's claim that the empty design needs its own stable projection is correct. The cross-process approval test is rightly listed as a required test, not a reported pass. |
| F5 | Main-only publication; `originalRoots: [mainRoot]` | Accepted. |
| F6 | Operational definition; split across C1/C2/C4/C5 | Accepted. The C2 row adds acceptance that is not in the accepted decomposition (lines 139-148). It must enter the decomposition/C2 issue through the governed amendment at design approval, as the author states. It must not be inferred from this document. |
| F7 | C3 included; shared files have a single editor | Accepted. |
| F8 | A durable incident record plus an unresolved verification gate; no new issue graph now | Accepted. The incident blocks unsafe verification, not document review, so a graph decision belongs before the next admitted TIA run. See R2-4. |
| F9 | Same census and exclusion; refined race oracle | Accepted. The author's oracle is more precise than mine: an incompatible stale empty/migration pair may refuse both. |
| F10 | Interface details; no generic prune advice | Accepted. Withdrawing my `git worktree prune` suggestion is correct under the preservation contract. |
| F11 | Design consensus kept separate from governed re-estimate/Plan | Accepted. Re-estimation is a gate before implementation, not before document consensus. |
| Kernel sentence | Superseded by revised line 9; historical bytes preserved | Accepted. |

## Remaining findings

### R2-1 — Medium (required) — The linked-v2 journal location and the reader's classification evidence are unspecified

Revised line 53 defines the linked-v2 plan and journal schemas but gives no path. Line 27 requires readers to tell a "supported uninitialized" root apart from "loss of original/previously initialized roots", but does not name the evidence they use.

The v1 journal lives at main `initializations/<sha256(root)>.json` (`runtime-initialize.mjs:49-56`). That deterministic path is what makes the v1 history check work (`:82`). v2 adds an operation UUID. If v2 journals are keyed by operation, finding a root's prior history needs a search or an index. If they stay keyed by root, the operation UUID needs its own lookup for `initialize-resume --operation`.

**Required:**

1. Give the exact v2 journal path. My recommendation: keep it root-keyed under main, so that v1 and v2 history share one lookup. Put the operation UUID inside the journal, and have resume validate it.
2. State the reader rule. When a linked root has no local control and the main activation is active and valid, the outcome depends on main's protected per-root history:
   - **Root not in `originalRoots` and no history:** the typed "initialization required" refusal.
   - **History present, or the root is in `originalRoots`:** the existing partial-loss refusal.
   - **Main activation absent, incomplete or invalid:** the existing main-state refusal.

### R2-2 — Medium (required: decide or defer explicitly) — Re-creating a linked worktree at the same path is permanently refused

The deterministic root ID (`runtimeInitializationId(root) = sha256(path)`) together with "protected prior-root history prevents reinitialization" (line 53) means that once a linked root has initialized, no worktree at that path can ever initialize again. Remove-then-re-add of a worktree at the same path is ordinary practice: the `.worktrees/<slug>` convention, and C3 retirement followed by later reuse.

v1 has the same behavior (`runtime-initialize.mjs:82`), so this is inherited, not introduced. But this round designs v2 freshly, and C3's retirement contract interacts with it.

**Required:** state one of the following.

- **(a) Retirement admits re-initialization.** History binds the physical `gitDir` identity, or a C3 retirement receipt, so a verified retirement admits a fresh linked init. Name the owner (C1 contract, C3 receipt).
- **(b) Documented limitation.** Same-path re-creation stays refused, with a named typed refusal and remediation, documented by C4.

Either is acceptable. Leaving it silent is not.

### R2-3 — Low — The control v2 wording conflates main and linked

Revised line 51 says "Main control: `aitm.runtime-control/v2` ... and only for separately initialized linked roots, `initialization`". Restate this as "Control v2 (main and linked)", and list which fields each variant requires. The closed validators depend on that split.

### R2-4 — Low — Attribute the incident before the next TIA run

`verification-integrity-r1.md` routes attribution to future owners or epic triage. The two additions point at specific writer families:

- `sessions/caller-sid/pending-pause.json` points to the question/pause writer tests.
- `locks/issue-6561169.lock/holder.json` points to the issue-mutator-lock tests.

Static attribution is cheap and does not require running tests. It decides whether the repair falls to C1 (kernel/catalog prerequisites) or C2 (affected fixture conversion, decomposition line 147). Record it in the integrity record before the next admitted TIA run.

Also decide at Plan how step 3 ("enforce write access") will be met on the macOS host (for example a sandbox profile, a separate OS user or a read-only snapshot mount). Without a feasible mechanism, the gate blocks all affected local TIA indefinitely.

### R2-5 — Low (optional) — Record created ancestor directories in the journal

Line 33 blocks a pre-existing empty runtime directory. Line 37 exempts ancestor directories created by the operation itself. After a crash, resume has to tell those two apart. Recording the directories the operation created in the first journal (or stating that they are fully derivable from the fixed layout, with no pre-existing ones permitted) closes this.

## Not findings

- Protocol surface: main-only publication plus shared census removes the multi-root empty transaction. The remaining additions (activation observation, control v2, linked v2, resume grammar) are each forced by F3 or by recovery. I found no unnecessary surface.
- No contradictions between the revised lines 13-15, 27-37, 51-53 and 66-72 beyond R2-1 and R2-3.

## Required for manual acceptance in round 3

- **R2-1:** the v2 journal path, and the reader classification rule.
- **R2-2:** an explicit disposition for same-path re-creation.
- **R2-3:** clearer control v2 wording.
- A recomputed target hash, reported with the revision.

R2-4 and R2-5 may be addressed or explicitly deferred.

This review claims no verification, approval or lifecycle status.
