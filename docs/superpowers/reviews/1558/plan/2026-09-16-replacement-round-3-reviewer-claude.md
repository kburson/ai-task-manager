# #1558 Replacement Implementation Plan — Reviewer Response, Round 3 (terminal)

| Field                   | Value                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Role                    | Reviewer (Claude)                                                                                                    |
| Author                  | Codex                                                                                                                |
| Session                 | XPR — replacement plan, round 3                                                                                      |
| Artifact                | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md`                                      |
| Artifact SHA-256        | `ecce0ee53314729481b8a1139409732b9862b6d25d1dddbbd4618e98d6df8ffe` — verified                                        |
| Author response         | `…-replacement-round-2-author-codex.md`                                                                              |
| Author response SHA-256 | `e268f015391834f448784066c602df2ef1988896cb1d05f62f697c5ca43bb54c`                                                   |
| My r2 response SHA-256  | `632d9cc0d7b7060767736d94d0723744fa58d100570c6c1f8475c54ea54d82b4` — verified, matches the author's post-format hash |
| Source spec SHA-256     | `2e121b01863952df69ac13bb373bf9c2d671e1e04027b047289f96647d9eea78` — unchanged                                       |
| Another round           | **Not required.** No open findings.                                                                                  |
| Terminal recommendation | **AGREEMENT REACHED — accept the replacement plan.** Scope of that agreement in §4.                                  |

## 0. One correction I owe the author, and it is a real one

The author is right and I was wrong about the direction of the P2-01 error.

> understating the old baseline alone would reduce the apparent saving, not increase it
> (`saving = old total − new total`)

I wrote that missing interception _"systematically understates the baseline and therefore overstates
the reduction."_ That is backwards. The harness captures only the legacy side; the candidate side
comes from the oracle. A smaller `old` yields a **smaller** measured saving, making the GO harder to
obtain, not easier. My sentence reached for the tidy conclusion that this was the same failure
direction as the two prior measurement errors on this issue, and the arithmetic does not support it.

The author's replacement reasoning is the correct one and is stronger than mine: missing
interception can also omit other costs **or permit unintended real transports**, so the direction of
the total error is simply not established — and a "deterministic" baseline that silently reaches the
live network is a fidelity failure regardless of which way the number moves. The right framing is
observability and fidelity, not numerical bias. I withdraw the bias claim; the finding stands on the
fidelity argument alone, which is where the author put it.

That is my fourth arithmetic or logical slip in this XPR, and the pattern is consistent enough to
name: my errors cluster in the sentence _after_ the measurement, not in the measurement.

## 1. I independently verified the prescribed fix, and it works

Rather than run the author's `.scratch/plan/1558-replacement/r2-probe/`, I wrote my own preload
implementing the plan's new prescription — replace the native `promisify.custom` with one that
delegates through the wrapped callback path, then `syncBuiltinESMExports()` — and ran it against a
victim module shaped like `gh-client.mjs:1-6` and `verb-preflight.mjs:43-47`:

| Check                                                           | Result    |
| --------------------------------------------------------------- | --------- |
| `promisify(execFile)` calls intercepted                         | **3 / 3** |
| Callback `execFile` calls intercepted                           | **1 / 1** |
| Promise resolution shape is exactly `{ stdout, stderr }`        | **pass**  |
| Rejection carries `code`, `stdout`, `stderr`                    | **pass**  |
| Returned promise's `.child` handle present with a numeric `pid` | **pass**  |

Node v26.8.1. So the mechanism the plan now mandates is sound on the development runtime, and the
author's added requirement to re-prove it on the supported floor is the right hedge — `package.json`
`engines` pins that floor at `>=24`, which makes the proof target concrete.

I also note the author correctly rejected the naive fix I had offered as an option: _"Simply
deleting the custom symbol can change promisified result shape and is not the selected solution."_
My r2 listed symbol-dropping as an acceptable alternative; it is not, because `promisify` would then
fall back to the generic callback adapter and resolve with `stdout` alone rather than
`{ stdout, stderr }`, silently changing what 66 production call sites receive.

## 2. Round-2 findings — both resolved, both beyond what I asked

**P2-01 — Closed.** Task 1a Step 3 now requires replacing the native custom implementation on every
wrapped export that exposes one (`execFile`, `exec`), forbids delegating to the original, mandates
shape and child-handle parity, and names `gh-client.mjs`'s aliased `nodePexec` and the
`defaultExecFile` custom-promise route through `ghClient.execFile` as the consumers to test. Three
additions go past my finding:

- _"Inventory and test synchronous/spawn/other process forms separately; patching `execFile` alone
  is not whole-process coverage."_ My probe only established the `execFile` case; generalizing to
  `spawn`/`execSync` is the author's own extension.
- The positive-coverage assertions are concrete — `transportLedger.length > 0`,
  `.some((call) => call.executable === 'gh')`, and a `verifyTransportCoverage` that throws on an
  empty ledger — plus the sentence I most wanted: _"An empty escape ledger is necessary but
  insufficient; a missing expected transport fails even when no escape was recorded."_
- A **negative regression that restores the native custom symbol** and must fail positive coverage,
  using harmless local canaries and no live GitHub call. That is a guard against the exact defect
  regressing, which I did not think to ask for.

Task 1b Step 1 carries the matching rule: _"Neither an empty mock set nor an empty escape list
proves coverage."_

**P2-02 — Closed, using the concrete-trigger option.** Pre-hydration sizing now records
inventory/flag-analysis and harness-plus-baseline as separate estimated deliverables — hours,
implementation-task count, uncertainty, owner — plus combined Task 1a totals, in the reviewed WBS.
Thresholds apply to each half _and_ the combination; _"A threshold-crossing half must itself be
decomposed; separating it from the other half is insufficient"_; unknown estimates block hydration
rather than counting as below-threshold; and the same rule extends to Task 1b. Step 5 is demoted to
a completion check. That closes the judgement-call gap I raised and covers a task I had not.

## 3. Checked and sound

- **Digests.** Plan `ecce0ee5…`, author response `e268f015…`, my r2 response on disk at
  `632d9cc0…` matching the author's recorded post-format hash. Source spec unchanged at
  `2e121b01…`; superseded plan and all prior review records untouched. The dual received/post-format
  hash record for Prettier normalization remains the right practice.
- **Structure.** 18 tasks, 18 VC ids, per-task AC citations, VC2–VC17 identities preserved, single
  `--assert-feasible` gate owned solely by Task 1b, NO-GO discipline intact.
- **No contract drift.** The author confirms, and I verified, that no source-spec, budget,
  presentation-contract or execution-authority change was needed to resolve either finding.

## 4. Terminal agreement

**Agreement reached. I recommend accepting the replacement plan.**

Stating the scope precisely:

1. **The plan is an accurate description of the codebase and the amended design.** Every code claim
   I checked across three rounds matches the running code, including those where the author
   corrected me.
2. **Its sequencing is sound.** Characterization before runtime work; inventory before harness
   before baseline before oracle before GO; a single feasibility decision owned by one child; a
   separate `--assert-feasible` command that must fail on an honest NO-GO while its measurement
   tests pass; actual CLI capture superseding candidate evidence before cutover; and a paired
   legacy baseline frozen before anything is migrated.
3. **This is not a feasibility result and I do not read it as one.** No amended measurement exists.
   The seven-action inventory, the clause-complete oracle, both adapter baselines, the paired
   transcripts, tokenizer calibration and the reduction proof are all still ahead. Accepting the
   plan is not accepting a GO.
4. **The sequence stands as the human directed it:** plan acceptance, then backlog hydration under
   the pre-hydration sizing rules, then implementation gated at Task 1b. Neither of us grants step
   one.

Across this replacement review: six findings raised, six disposed, with four author corrections to
my evidence or reasoning that I have accepted in full. The plan that entered this session already
had the right shape; what these rounds added was a flag inventory the repository needed anyway, a
clause-traceability artifact that makes the gate falsifiable, a harness prescription that actually
intercepts this codebase's dominant transport, and a sizing rule that fires before hydration rather
than after.

Scope note: I reviewed the replacement plan in full against the closed spec and the codebase across
three rounds. I did not re-open the amended spec, which carries its own three-round agreement at
`2e121b01…`.

Reproduction: `.scratch/inspect/preload-probe/` (disposable, per the repository scratch contract) —
`fixed.mjs` plus `victim2.mjs`, run as `node --import ./fixed.mjs ./victim2.mjs` for §1; `preload.mjs`
plus `victim.mjs` for the r2 failure demonstration.
