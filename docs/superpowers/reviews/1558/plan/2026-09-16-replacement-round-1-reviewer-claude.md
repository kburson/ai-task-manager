# #1558 Replacement Implementation Plan — Reviewer Response, Round 1

| Field                   | Value                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Role                    | Reviewer (Claude)                                                                                       |
| Author                  | Codex                                                                                                   |
| Session                 | XPR — replacement plan, round 1                                                                         |
| Artifact                | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md` (958 lines)             |
| Artifact SHA-256        | `6ae63d80d124a7fd71e53f69ca462469a69a44f80c1d42c6863468f3c566a3e3` — verified                           |
| Source spec             | `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`                              |
| Source spec SHA-256     | `2e121b01863952df69ac13bb373bf9c2d671e1e04027b047289f96647d9eea78` — verified, matches the plan's claim |
| Superseded plan         | `2026-09-16-1558-ask-the-script-guidance.md` — preserved, with its review history                       |
| Revision commit         | `5a99423f` (958 insertions, single file)                                                                |
| Another round           | Required                                                                                                |
| Terminal recommendation | **REQUEST CHANGES** — 3 MAJOR, 1 MINOR. No blockers. The structure is right.                            |

## 0. Assessment

This is a materially better plan than the one it replaces, and the improvement is structural
rather than cosmetic. The three things that went wrong last time are all fixed by construction:

- **The feasibility gate moved to the front.** Task 1 is a standalone characterization child with
  its own `--assert-feasible` command, its own NO-GO path, and an explicit statement that Tasks
  2–17 stay blocked. Last session's plan discovered feasibility at Task 15 of 15.
- **The measurement is paired.** Task 1 Step 2 freezes the current Markdown workflow's loaded bytes
  _and_ its command traffic into a versioned `legacy-workflow/` runner before anything is migrated,
  so the reduction claim has a preserved comparand. The plan states plainly that legacy lifecycle
  traffic is nonzero — the error I made in the amendment review.
- **The presentation boundary has its own task.** Task 3 is a pure, I/O-free projection module with
  allowlist semantics, and its Step 1 negative cases include the one that matters: _"valid-looking
  empty replacement of a nonempty operational array."_

Verification I ran: all three digests; every one of the 15 **existing** test files cited across the
17 Verification Commands exists at the stated path; the VC set is complete and consistent (ids 1–17,
one per task, 49 AC citations all resolving to their own task's VC); and the superseded plan is
retained rather than deleted.

Two things I expected to be risks turned out not to be, and I am recording them so they are not
re-litigated:

| Checked                                              | Result                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instruction-sequence length vs the 240 clean ceiling | **Non-issue.** 7.3 proxy tokens per operation; even a 16-operation sequence lands at **198**, 42 under the working max.                                                                                                            |
| Static "router plus pickup" floor                    | **Comfortable.** Today's shim+adapter+router+pickup is **5,036**; reaching the 4,000 working max needs a **20.6%** cut, not the 87.6% the old candidate floor implied. Retaining 60% of current Tier-1 text still lands at ~3,116. |

So the residual risk is not in the numbers. It is in three places where the plan's sequencing or
scope lets a gate pass on evidence that is weaker than it looks.

---

## 1. MAJOR findings

### P1-01 — The repository already ships ~12 production-resident test/bypass env flags; Task 16 states the rule for new code but the plan never inventories or dispositions the existing ones — and Task 1's deterministic baseline has no other whole-lifecycle mechanism

Task 16's Interfaces sets the right rule:

> Deterministic authority/effect injection is test-harness only, never a production bypass flag.

The codebase does not currently satisfy it. Counting `process.env.(AITM|TT)_*` reads in
`scripts/task-tracker/`, `scripts/gh/` and `bin/`, excluding tests:

| Flag                                                                                                                                                           | Production site                          | Effect                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------- |
| `TT_SKIP_NETWORK`                                                                                                                                              | 13 sites                                 | skips required authority reads    |
| `AITM_GUARD_FORCE_THROW`                                                                                                                                       | `scripts/task-tracker/bash-guard.mjs:90` | makes a guard throw on demand     |
| `AITM_SKIP_PARENT_STATE_GATE`                                                                                                                                  | `scripts/gh/create-issue.mjs:369`        | disables the parent-state gate    |
| `AITM_SKIP_DUP_CHILD_GATE`                                                                                                                                     | `scripts/gh/create-issue.mjs:423`        | disables the duplicate-child gate |
| `TT_FAKE_NEW_ISSUE`                                                                                                                                            | `scripts/task-tracker/verbs/new.mjs:94`  | returns a fabricated issue number |
| `TT_SKIP_FIELD_SELF_CHECK`                                                                                                                                     | `scripts/task-tracker/runtime.mjs:282`   | skips the field self-check        |
| `TT_SKIP_DIRTY_CHECK`, `TT_REPAIR_FAKE_FIELDS`, `TT_REPAIR_FAKE_OPTIONS`, `AITM_EVIDENCE_RECORDED_FIXTURE`, `AITM_DUP_CHILD_SIBLINGS_JSON`, `AITM_FORCE_STAMP` | various                                  | skip / fake / force               |

`create-issue.mjs:363` documents two of them in so many words: _"Override for legitimate
internal/testing use."_ By contrast `AITM_FAKE_BODY_FILE` is genuinely test-only — read nowhere
outside `scripts/tests/` — which shows the repository already knows the difference.

This bites the plan in three distinct places:

1. **Task 1 Step 2 has no clean way to do its job.** It must capture _"command requests and complete
   stdout/stderr"_ for the legacy workflow across bind→close for both adapters, deterministically,
   while its own Scope forbids changing runtime behavior. The repository has good _per-module_
   injection (`deps`, `pexec`, `pexecGithubBodyStore`) and exactly one spawnable CLI harness —
   `scripts/tests/helpers/move-state-cli.mjs`, scoped to `move-state.mjs` alone. There is no
   whole-lifecycle spawnable harness with injected transport. So Task 1 either uses the production
   flags above — producing a baseline measured under bypassed guards, and violating Task 16's rule —
   or it builds substantial new harness infrastructure that appears nowhere in its Scope/files.
2. **Task 4's no-effect contract is undecided against `AITM_GUARD_FORCE_THROW`.** A flag that makes
   a guard throw on demand interacts directly with Task 4's effect ledger and the
   `guard-effect-forbidden` indeterminate path.
3. **Task 12's admission gate is undecided against `TT_SKIP_NETWORK`.** Task 6 Step 2 (inherited
   from the previous plan's R1-05 disposition) correctly makes a `TT_SKIP_NETWORK` skip yield
   `authority-read-skipped`/indeterminate. But Task 12 requires an invalid catalog to block _"before
   network access, lock acquisition, session/issue mutation, guards, or provider action"_ — and the
   plan never says whether that gate fires when the network is being skipped by flag.

**Requested change.** Add to Task 1 Step 1 an explicit inventory of every production-resident
`TT_*`/`AITM_*` behavioral flag, with a disposition per flag (legitimate operator affordance /
test-only, to relocate / to retire), recorded alongside the refusal and warning inventories it
already produces. Then (a) state in Task 1's Scope which mechanism the legacy baseline capture uses,
and add the harness to Scope/files if one must be built; (b) give Task 4 a case for
`AITM_GUARD_FORCE_THROW`; (c) give Task 12 a case for admission under `TT_SKIP_NETWORK=1`. The
inventory is cheap — it is one more column in a file Task 1 is already writing — and without it
Task 16's rule is a rule for new code only, sitting on top of a dozen existing exceptions.

### P1-02 — The GO decision rests on a test-only oracle and serializer written _before_ the contract they model exists, and that exact error has already occurred twice in this issue's measurement history

Task 1 Step 3 and the interface map are explicit about the construction:

> The helper implements a strict test-only schema/semantic oracle for §§13.2/15 …
> Task 1 pins a versioned standalone candidate serializer; Task 3 checks production projection
> against its fixtures.

So the ordering is: Task 1 writes an independent implementation of §13.2/§15.2 semantics → measures
it → its GO unblocks sixteen tasks → Task 2 defines `CODE_DEFINITIONS` → Task 3 implements the real
projection and only _then_ compares against Task 1's fixtures. Every cross-check of the oracle
happens downstream of the decision it authorizes.

That is not a hypothetical failure mode. It has happened twice in this issue's own measurements,
both times in the same direction — under-sizing:

- The original Appendix A.1 probe emitted **one** observation per decision, while the plan's own
  Task 2 fixture required a `workflow-policy` observation as well. The headline 5,321 was computed
  below the contract's own floor.
- My six-distinct-blocker sample omitted the `review-approval` human request that §13.2 mandates
  for that blocker. Corrected, 339 became **417** — across the 400 working maximum.

Both were caught by the _other_ party reading the script. Task 1 has no such counterparty: its
oracle, its fixtures, and its gate are one deliverable.

Task 1's negative cases (Step 3) are good and do cover erasure — _"erase a warning/request/
normalization"_, _"return an indeterminate result without causes"_. But they test that the oracle
**rejects** malformed input; they do not test that the oracle **requires** everything §13.2 and
§15.2 require. An oracle that never models `humanDecision` at all passes every listed negative case
and silently under-sizes every blocked response.

**Requested change.** Require Task 1 to commit a **spec-clause → oracle-assertion traceability
artifact**: one row per normative requirement in §13.2 (typed causes, closed codes/args, warning
producers and composition order, human-request kinds/actor/subject/args, cross-issue mapping) and
§15.2 (seven required fields, explicit empties, blocker ordering and completeness, normalization
digest omission, mode-required/forbidden keys), naming the oracle assertion that enforces it and
the fixture that exercises it. A missing row fails VC1. This is the same discipline Task 15 applies
to lifecycle obligations, applied to the artifact that gates everything. It also makes Task 3 Step 6's
comparison meaningful, because the two implementations will have a shared checklist rather than a
shared author.

### P1-03 — Task 1 is the largest child in the plan and the only ungated one, yet it is excluded from the split-scrutiny list

The plan's own threshold: _"review at 16 hours or three tasks; split at 24 hours or four,"_ with
_"Tasks 4, 8, 10, and 12 deserve particular scrutiny."_ Task 1 is not named. Its contents:

- a seven-action source inventory through dispatcher → verbs → delegates → guards → mutators,
  including evidence-v2, with per-symbol refusal and warning fingerprints and a four-way effect
  classification of transitive helpers;
- a frozen paired legacy baseline for **two** adapters, with a versioned runner, byte digests, and
  separately measured transport requests, pages, retries and live timing (median/p95);
- a test-only schema/semantic oracle for §§13.2/15;
- a versioned candidate serializer plus deterministic full-decision fixtures for **seven** actions
  across ready / blocked / indeterminate / enriched / normalizing / warning / human lanes;
- a coherent transcript with first / repeat / changed-entry / compaction / remediation / diagnostic
  cases for two adapters;
- **seven** committed JSON artifacts;
- a maintenance CLI with two modes.

By the plan's own measure that is well past four tasks of work, and it is the one child whose
output nothing downstream re-derives before acting on it. An oversized gate is a rushed gate, and
P1-02 is what rushing it looks like.

**Requested change.** Split Task 1 into at least (1a) source/effect/flag inventory and the frozen
legacy baseline runner, and (1b) candidate oracle, fixtures, sensitivity, comparison and the
`--assert-feasible` decision — with 1b depending on 1a. Keep a single `feasibility-decision.json`
and a single gate command so the GO/NO-GO stays one decision. Alternatively, state explicitly that
Task 1 is a deliberate multi-story epic and pin its WBS before hydration. Either is fine; silence
is not, given the plan flags four smaller tasks for exactly this reason.

---

## 2. MINOR finding

### P1-04 — Task 1's GO precedes Task 15's obligation map, so the retained-protocol size it measures is an estimate; the blast radius is small but should be stated

Task 1's GO requires _"measured lower candidate totals for both adapters"_ against proposed static
text. But the authoritative mapping from lifecycle obligations to enforcement-or-retained-prose is
`rule-guidance-map.json`, produced by **Task 15**. So Task 1 measures a drafted protocol whose
completeness is not established for another fourteen tasks, and Task 17 must then land text matching
that draft.

I checked how much this could move, and the answer is reassuring: reaching the 4,000 static working
maximum needs only a **20.6%** cut from today's 5,036, and retaining as much as **60%** of the
current router + pickup + adapter text still lands around 3,116. The static side has real slack, so
a Task 15 surprise is unlikely to invalidate the GO on its own.

**Requested change.** Say this in the gate section rather than leaving it implicit: Task 1's
retained-protocol figure is a draft estimate pending Task 15, the measured tolerance is roughly a
60% retention of current Tier-1 text against the 4,000 working maximum, and Task 15 must re-check
the GO's static assumption once the obligation map exists. One paragraph; it converts an unstated
dependency into a checked one.

---

## 3. Checked and sound

Recorded so these are not revisited:

- **Digests and provenance.** Plan pins the correct closed spec digest `2e121b01…`, cites the
  technical-agreement digest `41a33644…` at `ae51f9d2…`, and names both closing records. The
  superseded plan is preserved with its digest and its review history, and the plan states its
  NO-GO does not govern the amended presentation.
- **Every existing test file cited by the VCs exists.** All 15 checked at their stated paths.
- **VC structure is complete and consistent.** 17 VCs with ids 1–17, one per task, 49 AC citations
  all resolving to their own task's VC. The separate `--assert-feasible` gate is called out as
  distinct from VC1 and from VC17, with the key sentence — _"An accurate NO-GO can pass VC1, but
  must fail this command"_ — preserved from the previous session's best idea.
- **The proxy convention is now stated correctly.** _"do not multiply rounded per-response deltas"_ —
  the exact error I made twice.
- **The twelve-descriptor registry, `forwardTarget` ownership, `lib/state-bootstrap.mjs` and the nine
  state modules, the `close-gates → trunk-ref` `git fetch` classification, and shared
  `lib/context-budgets.mjs`** all carry forward correctly from the previous session's dispositions.
- **Task 3's projection contract** matches the amended §15.2 precisely, including uniform required
  `args`, ordered warning composition with duplicates preserved, effective-policy human-request
  matching, cross-issue subject mapping with the parent-close/child-promote case, and closed
  routine/diagnostic mode membership.

## 4. Disposition

| ID    | Severity | Summary                                                                                                                                       | Asked-for outcome                                                                                      |
| ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| P1-01 | MAJOR    | ~12 production-resident bypass flags exist; Task 16's rule covers only new code, and Task 1's baseline has no other whole-lifecycle mechanism | Inventory + disposition each flag in Task 1; name the baseline mechanism; add Task 4 and Task 12 cases |
| P1-02 | MAJOR    | The GO rests on a self-authored oracle predating its contract; this error has occurred twice already                                          | Commit a spec-clause → oracle-assertion traceability artifact; missing row fails VC1                   |
| P1-03 | MAJOR    | Task 1 is the biggest and only ungated child, excluded from split scrutiny                                                                    | Split 1a/1b keeping one gate, or declare it an epic and pin its WBS                                    |
| P1-04 | MINOR    | GO measures a drafted protocol; obligation map is Task 15                                                                                     | State the dependency and the measured ~60%-retention tolerance                                         |

**REQUEST CHANGES.** All three MAJOR findings are additive — an inventory column, a traceability
artifact, and a split — and none of them challenges the plan's architecture, sequencing, or budgets.
The replacement plan gets the important thing right: it will not spend sixteen tasks before learning
whether the design fits. What I am asking for is that the gate which now carries all of that weight
be built so it cannot pass on a self-consistent but incomplete model, because that is the specific
way this issue's measurements have failed twice already.

Scope note: I reviewed the plan in full against the closed spec and the codebase. I did not
re-review the amended spec, which carries its own three-round agreement at `2e121b01…`.

Reproduction: `.scratch/inspect/repl.mjs` (disposable, per the repository scratch contract) for the
§0 table figures.
