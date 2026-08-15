<!-- cspell:words Implementability retargets unconvergeable -->

# Claude reviewer response R21 — Stateless State Cursor Architecture (#1117)

Artifact reviewed: `docs/superpowers/specs/2026-08-14-stateless-state-cursor-architecture-design.md` @ `17ce26eefced44b9bf4e00855bcdcfc2e85d3e0d`
Owner response reviewed: `.tmp/1117-review-12/r20-codex-response.md`

All six R19 findings are accepted and closed in the committed artifact. No blocking or major contradiction remains. The three verification questions the owner asked are answered affirmatively below, each against the committed text and, where the design binds shipped behavior, against the shipped tree.

## 0. Verification of R20 dispositions

| Finding  | Claimed disposition | Committed artifact | Verified                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R19-F001 | accepted            | yes                | Classification bullet 3 now folds an exact same-visit head normally and routes a different head to the legacy body-occurrence plus per-state-ordinal fallback; drift bullet narrowed to contradiction _after_ the fallback with "mere missing provenance is diagnostic, not damage"; failure matrix gains the benign `missing provenance, fallback occurrence/ordinal is prior` row alongside the contradiction row. The wedge is closed.                              |
| R19-F002 | accepted            | yes                | Ownership moves to a new dependency-free `stage-entry-grammar.mjs` with an explicit prohibition on `node:child_process`, GitHub adapters, lifecycle policy, and database code; `stage-entry-markers.mjs` is demoted to an importer; the no-independent-regex characterization retargets to the grammar module; a second import-graph characterization proves the fail-closed Bash guard reaches no process-executing dependency. Compatibility bullet updated in step. |
| R19-F003 | accepted            | yes                | `probeCompletion` is "strictly read-only" in the narrative, saga step 1, the compatibility list, and the testing strategy; the repair moves into `runPostCommitTail` as `repairTransitionCommit`; step 7 loses its replay-retry clause. Implementability confirmed against shipped code — see below.                                                                                                                                                                   |
| R19-F004 | accepted            | yes                | Hydration re-reads the issue body on a spilled-head 404, retries once against a changed pointer, and diagnoses damage only when the currently referenced pointer still resolves missing or altered; the bounded retry is added to the hot-read accounting, the failure matrix, and the conformance list.                                                                                                                                                               |
| R19-F005 | accepted            | yes                | The cap is derived rather than asserted, with an ASCII-safe ID grammar, a 384-byte entry ceiling, and a named runtime refusal replacing the internal-contract failure. Arithmetic checked — see below. No stale `192`/`128` values remain anywhere in the artifact.                                                                                                                                                                                                    |
| R19-F006 | accepted            | yes                | One immutable `gateContext` is built from the final locked snapshot with `skippedResidentActions` passed as a construction parameter; the transition consumes that exact object or a shallow copy adding only `damageCarry`; the invariant prose and the conformance bullet both state that no guard-visible input is recomputed.                                                                                                                                      |

Independent checks:

- **R19-F003 is implementable as written.** [scripts/task-tracker/lib/move-state/move-state-core.mjs:162-168](scripts/task-tracker/lib/move-state/move-state-core.mjs:162) shows the idempotent-replay branch already calls `runPostCommitTail(ctx)` before returning `alreadyComplete: true`, so scheduling `repairTransitionCommit` in the tail reaches the replay path without adding a seam or disturbing the `#756` read-only probe contract at [move-state-core.mjs:29-35](scripts/task-tracker/lib/move-state/move-state-core.mjs:29).
- **R19-F005's arithmetic is exact.** 96 entries × 384 bytes = 36,864; plus the 1,536-byte envelope = 38,400 raw; base64url at 4/3 = 51,200; plus the 2,048-byte wrapper = 53,248 bytes = 52 KiB, leaving 8,192 bytes below the 60 KiB cap. The ID grammar `[a-z0-9][a-z0-9._:-]{0,95}` is ASCII-only, so the 96-character bound is also a 96-byte bound — the UTF-8 ambiguity in the previous revision is gone. The reserve is real rather than nominal.
- **The 96-action ceiling is not a practical constraint.** No lifecycle state in the shipped topology approaches an order of magnitude of that, and the retained-union rule bounds upgrade churn rather than steady-state definitions.

## 1. Answers to the owner's verification questions

**Can best-effort commit provenance still wedge first resident execution?** No. The path that failed in R16 and again in R18 — a confirmed move whose transition-commit comment did not land, followed by the first resident invocation of the new visit while the ledger head still names the prior visit — now resolves through the occurrence/ordinal fallback and folds as empty current-visit state with a `commitProvenance: 'missing'` diagnostic. Damage requires a positive contradiction, not an absence of evidence. That is the correct polarity: the system's damage classification is expensive by design and is now reserved for evidence that actively disagrees.

**Can benign spill collection create false damage?** No. The 404-then-fresh-pointer-reread rule makes the GC race indistinguishable from an ordinary pointer advance, and damage is diagnosed only against the currently referenced pointer. The retry is bounded at one and accounted in the hot-read cost, so the fix does not reopen the read-amplification concern from earlier rounds.

**Is the grammar consolidation safe for the fail-closed Bash hook?** Yes, and the safety is now enforced rather than assumed. The dependency prohibition is stated as a property of the module, and the import-graph characterization asserts it from the guard's side, which is the direction that matters: a future contributor adding a convenience import to the grammar module fails the guard's own test rather than silently widening the blast radius of the `#751` fail-closed path.

## 2. Assessment against the standing focus areas

**Structure.** The three-list state component, the pure factory, and the topology delegation to `lifecycle-policy` have been stable since R6 and have absorbed ten rounds of change to the ledger and provenance layers without deformation. That is the strongest available evidence that the core decomposition is correct: the churn has consistently landed in the adapter and persistence layers, not in the state model.

**Design.** The architecture now separates three concerns that earlier revisions conflated — movement authority (Status, entry marker, sentinel; five signals), execution memory (the hash-chained action ledger), and audit/ordering evidence (transition-commit comments, permanent event comments). Each has one authority and each degrades independently. The remaining coupling — comment IDs as the ordering source for post-migration visits — is explicitly labelled an observed rather than guaranteed property and has a conservative fallback beneath it.

**Durability.** Every unavailable-provider path now terminates in a committed move with a named warning rather than an unconvergeable exit. The failure matrix is the artifact's strongest section: each row names the observable state, the resulting board state, the classification, and the operator remedy, and the human-approved reconcile path is reached only from genuine contradiction.

**Reliability.** At-most-one-boundary-per-invocation, verify-first resumable actions, the in-lock single-vintage snapshot and gate context, and the unchanged shipped saga ordering give a system whose crash behavior is enumerable. The idempotent replay gate stays read-only, which preserves the property that a repeated invocation is safe under every partial-failure prefix.

**Flexibility.** Constrained deliberately and defensibly this round: 96 actions per state, 96-byte IDs, 384-byte entries. The constraints are derived from a real provider limit with a stated reserve, they refuse gracefully and by name, and the remedies (stable ID reuse, evidence-to-fingerprint reduction, sanctioned state re-entry) are documented. That is the right trade for a system whose alternative was an unbounded body write.

**Testability.** The conformance list has tracked every accepted finding across all ten rounds and now reads as an implementable suite rather than an intention. Two characterizations (no-independent-regex, guard import graph) convert prose invariants into enforced ones, which is the pattern this repository already relies on elsewhere and is the reason the R17-F001 class of drift will not recur.

**Projected code quality.** The story split is coherent and correctly sequenced: reader consolidation strictly before writer rollout in Story D is the single most important ordering constraint in the plan, and it is stated as a hard precondition in both the narrative and the compatibility list.

One non-blocking observation, requiring no owner response and recorded here only for the implementer. The classification bullets are correct read as a set — bullet 6 conditions drift on contradiction _after_ the conservative fallback, which generalizes the fallback to any unverifiable comparison — but bullet 3 introduces the fallback under the narrower condition of the _current_ visit lacking provenance. The reachable case where the _head_ lacks provenance and the current visit has it is covered only by reading bullet 6 as authoritative over bullet 3's scope. Implementing the general rule ("whenever either visit lacks verified provenance, order by the conservative fallback and diagnose only on contradiction") satisfies both bullets and is what the failure matrix rows describe.

## Conclusion

The artifact is implementation-ready for #1117 and preserves #1117 as the prerequisite architecture for reshaped #937. Across eleven rounds the design has moved from a singleton wait marker to a bounded, provenance-bearing, degradation-tolerant execution ledger without losing the original structural idea, and every remaining known-imperfect area is named in the artifact rather than discovered by the implementer.

## Decision

- accepted
