# #1558 Implementation Plan — Reviewer Response, Round 2

| Field                       | Value                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Role                        | Reviewer (Claude)                                                                            |
| Author                      | Codex                                                                                        |
| Round                       | 2                                                                                            |
| Plan under review           | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance.md`                          |
| Plan SHA-256 (verified)     | `cf5a99239e0186e29c4f93a88e924c7d6e8b5c0955158eb3907528cf74e07de0`                           |
| Author response             | `docs/superpowers/reviews/1558/plan/2026-09-16-round-1-author-codex.md`                      |
| Author response SHA-256     | `edee3a6306a4ca981c3bdd585f6489de3bc75eb8c7d373e0c06141024b80887a`                           |
| My round-1 response SHA-256 | `594c7d0399d02b3373200beb16f58c828f34a9322ab89d746284770b342a3ee3` — preserved, verified     |
| Ratified design SHA-256     | `8f3f37bc4724c072fe222cd8f720499c825748934c8b1689950e66ce261a1a8d` — unchanged               |
| Baseline                    | `a5d0245b812959e906adc834f149cebca43ab08d`; revision commit `5f2d6357`                      |
| Another round               | **Required** — one open BLOCKER (R2-01) and three subordinate items                          |
| Recommendation              | **REQUEST CHANGES**, narrowed to the context-serialization model. Everything else is closed. |

## 0. Method — this round was shell-backed

`scripts/dev-env/setup-local-worktree.sh` has been run, so the constraint disclosed in §0 of
round 1 is lifted. Node v26.8.1. I independently executed every measurement and code claim
below; where I assert a number I ran it. I re-ran Appendix A.1 verbatim (extracted from the
committed plan between its fences) and reproduced **exactly** the author's reported values:
`clean 239`, `blocked 273`, `worstCase32Blockers 1319`, `traffic 4488`,
`codex 833/5321`, `claude 840/5328`. The probe is honest and reproducible.

I verified all three digests in the table above with `shasum -a 256`. My round-1 response is
preserved byte-for-byte at its stated digest and the ratified design is unchanged. Protocol
integrity is intact.

---

## 1. Round-1 dispositions — 14 of 15 closed, including five where I was wrong

I accept the author's corrections without reservation. Recording them so they are not
re-litigated:

| ID    | Outcome                | Verification I ran                                                                                                                                                                                                                                              |
| ----- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1-01 | **Closed → reopened narrowly as R2-01** | My baseline was stale. I quoted source comments (10,774 / 13,286); the live tool reports **13,381 codex / 13,482 claude**, which I reproduced. The early gate at plan lines 65–88 plus Task 1 Step 0 is the right structure. See §2. |
| R1-02 | **Closed**             | Confirmed `verbs/promote.mjs:441` reads `guardCtx.refinementPlan`, consumed at `:627-632`. Task 2's Interfaces now removes the `Reflect.set` write-back and migrates the consumer in the same change, with no write-through channel. Correct fix. The author is also right that `Reflect.set` returns `false` rather than throwing — my round-1 phrasing was imprecise. |
| R1-03 | **Closed**             | Confirmed the concrete effect chain: `close-gates.mjs:216` `commitsOnTrunkGate` → `trunk-ref.mjs:152` `await git(['fetch', remote, branch])`. Task 1 Step 1's four-way effect classification and Task 2 Step 1's out-of-band ledger asserted in a `finally` (outside guard error conversion) is a better mechanism than I proposed. The `ls-remote` objection is well taken — message-attribution needs a complete local object graph, which `ls-remote` cannot supply. |
| R1-04 | **Closed — my path was wrong** | The bootstrap is `scripts/task-tracker/lib/state-bootstrap.mjs`; `scripts/task-tracker/state-bootstrap.mjs` does not exist. Confirmed 9 modules in `scripts/task-tracker/states/`. Task 1's revised Scope names these correctly and keeps `guard-bootstrap.mjs` as a shim. I also accept the refusal-of-scope: one conservative `unclassified-refusal` per registered guard, with Tasks 4–8 migrating by family, is the right boundary. |
| R1-05 | **Closed — partly my error** | Confirmed `verb-preflight.mjs:163-164` makes the assignee predicate configuration-conditional and `:215-227` still fetches live board state in the disabled branch. A configured-inapplicable optional predicate is not a failed required read; my blanket proposal would have changed existing semantics. Task 4 Step 2's `authority-read-skipped` indeterminate for `TT_SKIP_NETWORK=1`, plus recording effective configuration as an observation and testing parity in both modes, is correct. |
| R1-06 | **Closed — fully resolved** | Verified directly: `node_modules/js-yaml/package.json` is **5.4.2**, and its ESM surface exports `parseEvents`, `constructFromEvents`, `getScalarValue`, `eventsToAst`, `EVENT_SCALAR`/`EVENT_MAPPING`/`EVENT_SEQUENCE`/`EVENT_ALIAS`/`EVENT_DOCUMENT`, `SCALAR_STYLE*`. The API exists. The parser gate, exact pin, single `guidance/parse.mjs` instrumentation point, and inclusion in cache/release identity all resolve the ripple concern. |
| R1-07 | **Closed**             | Confirmed `functional-dod-derive.mjs:66-77`. Task 3's Interfaces now names `evidenceStamp: true` as execution-only, and Step 4 requires both a positive injected-write assertion and a negative omission test hitting the real proof-introduction refusal. The negative test is what makes this durable — good addition beyond what I asked for. |
| R1-08 | **Closed — author's numbers are right and worse than mine** | Verified `bin/aitm-registry.mjs`: `VERBS` is a Set of **72** tokens, `SCRIPTS` **21**, `INTERNAL` **9**. My 21-entry cursor map was the wrong surface. `admission-surface.json` with one row per route and CI failure on an unclassified route is the right instrument, and the retained split gate addresses the sizing. |
| R1-09 | **Closed**             | Twelve descriptors, non-v1 five keep execution policy with null evaluators, `action-not-explain-ready` for explicit explanation, `unknown-vocabulary` for unknown IDs, neither recommending execution. Exactly the disposition requested. |
| R1-10 | **Closed — I overstated it** | The author is right: `&&` propagates the final nonzero exit, so the VC15 chain could not report aggregate green. My finding title was wrong. The substance — duplicated drifting limits and misleading legacy-only green output — is accepted and fixed by shared `lib/context-budgets.mjs` (plan line 123, Task 14 Scope, Task 15 Step 2). I also accept that static text and captured transcripts are deliberately different subjects and that retiring the static tool would be wrong. |
| R1-11 | **Closed**             | Task 4 now names `actionPolicyFor` from `lib/lifecycle-policy/actions.mjs` and `forwardTarget` from `lib/lifecycle-policy/executable-transitions.mjs`. |
| R1-12 | **Closed**             | Task 7 names `validateHistoricalRecoveryPreflight` with an explicit `action-not-explain-ready` disposition until its collector has parity evidence. |
| R1-13 | **Closed**             | Confirmed `verb-preflight.mjs:129-137` / `EXIT_MIGRATION_FREEZE = 14`. Task 4 Step 1 adds the global freeze fixture and Step 2 tests a freeze appearing between explanation and execution. |
| R1-14 | **Closed**             | Task 3 Step 3 now states: parse item checked/marker flags once from `base`, derive against progressively transformed `next`. That is the asymmetry at `functional-dod-derive.mjs:75-113`. |
| R1-15 | **Closed — my premise was wrong** | Verified: `routeIdentityForVerb('bind')` and `routeIdentityForVerb('rebind')` both return `null`; neither is in the 72-token `VERBS` set (`routeIdentityForVerb('deliver')` does return a route, confirming the probe works). A `CURSOR_TRIGGER_BY_COMMAND` label is not a registered command. Semantic `bind` covering cold bind and switch, with `explain --action rebind` as `unknown-vocabulary`, is correct. |

---

## 2. R2-01 — BLOCKER — The feasibility probe's one-observation assumption contradicts the plan's own schema, and observation cardinality dominates the budget

This is the only substantive open item, and it is a direct response to the author's request to
*"focus on the early context gate's assumptions."*

### 2.1 The probe already violates the plan's own decision contract

Appendix A.1 emits exactly **one** observation per decision:

```js
          observations: [
            { source: 'authority', identity: 'repo:fixture/aitm:issue:1558',
              observedAt: at, digest },
          ],
```

The plan requires more than that in two places:

- Plan line 149 (interface contract): *"all effective observations appear in `decision.snapshot`."*
- Plan line 249 (Task 2's own RED fixture):
  `assert.ok(decision.snapshot.observations.some((o) => o.source === 'workflow-policy'));`

Task 2's test therefore requires a `workflow-policy` observation **in addition to** the
authority read the probe models. The probe's headline 5,321 is computed at a cardinality the
plan's own test fixture forbids. That is not a conservatism quibble — it is the difference
between passing and failing.

### 2.2 Measured sensitivity

I re-ran the appendix probe with observation count and blocker count as parameters, holding
every other input string, the 16-query schedule, and the `ceil(len/4)` convention identical to
Appendix A.1. Codex adapter; claude differs by +7 throughout.

| Observations per decision | 1 blocker per blocked response | 3 blockers per blocked response |
| ------------------------: | -----------------------------: | ------------------------------: |
|            1 *(as probed)* |                      **5,321** |                           5,726 |
|   2 *(plan line 249 min.)* |                      **6,097** |                           6,502 |
|                          3 |                          6,853 |                       **7,258** |
|                          5 |                          8,397 |                           8,802 |
|                          8 |                         10,697 |                          11,102 |

Marginal cost of one additional observation: **48 proxy tokens per response**, ×16 responses
= **768 tokens per observation across the lifecycle**. A single blocked response grows from 273
to 609 proxy tokens going from 1 to 8 observations.

Read against the ratified numbers:

- The probe's entire reported margin (279 tokens) is consumed by the **second** observation.
- At the minimum cardinality the plan's own Task 2 fixture requires (2), the total is
  **6,097 — 497 over the 5,600 working maximum.**
- At 3 observations with 3 blockers, **7,258 exceeds the 7,000 absolute ceiling.**
- At 8 observations — a plausible `close` decision reading board state, issue body, HEAD,
  commit trail, delivery records, approval evidence, child states and CI — the total is
  **10,697, i.e. 53% over the absolute ceiling**, which is worse than today's un-slimmed
  13,381 by a smaller factor than the slimming was supposed to buy.

Prose slimming cannot recover this. The static floor is only 833 of the 5,321 total; even
deleting the router, pickup and adapter **entirely** saves 833 and leaves 5,264 of traffic at
one observation, or 9,864 at eight.

### 2.3 The dominant lever is serialization, and the plan has not chosen one

I measured two serialization levers against the same schedule:

| Serialization                                    | obs=1 | obs=2 | obs=3 | obs=5 |     obs=8 |
| ------------------------------------------------ | ----: | ----: | ----: | ----: | --------: |
| As specified (64-hex digests, per-obs identity+time) | 5,321 | 6,097 | 6,853 | 8,397 |    10,697 |
| 12-hex digests                                   | 4,377 | 4,945 | 5,493 | 6,621 |     8,297 |
| Hoisted source list + shared timestamp            | 5,009 | 5,425 | 5,821 | 6,645 |     7,865 |
| **Both**                                         | 4,065 | 4,273 | 4,461 | 4,869 | **5,465** |

With both levers, **eight** observations per decision fits inside the 5,600 working maximum.
Without them, **two** does not. The §20.2 ceilings are reachable — but only through
serialization decisions the plan has not made, and which two current passages can be read as
forbidding:

- Task 12 Step 3: *"Preserve full decision/provenance truth in compact serialization."*
- Task 14 Step 2: golden fixtures must catch *"measuring selected JSON fields instead of full
  output"* and *"truncating blockers to meet the budget."*

Truncating a 64-hex digest to 12 hex, interning repeated source identities, and hoisting a
shared observation-window timestamp are **not** truncation of decision content — every
observation still appears, with distinct identity and a digest. But nothing in the plan says
so, and a reviewer of Task 14 enforcing the anti-truncation fixture could reasonably block them.

### 2.4 Requested change

Add to the **Early feasibility and parser gates** section, and to Task 1 Step 0:

1. **Fix the probe's floor.** Re-run Appendix A.1 at the minimum cardinality the plan's own
   contract requires (≥2, including `workflow-policy`) and report *that* as the candidate
   number. The current 5,321 should not be the headline figure in a gate document.
2. **Make Step 0 produce a parameterized model, not a point estimate.** Require it to publish
   marginal cost per observation, per blocker, and per query, plus a sensitivity table across
   the inventoried cardinality range — the table in §2.2 is the shape, and it took minutes to
   produce. A point estimate that happens to land at 5,321 can be wrong by 2x; a slope cannot.
3. **Decide the serialization contract in Step 0, before extraction.** State explicitly which
   of digest truncation, source interning, and timestamp hoisting are permitted, and amend
   Task 12 Step 3 / Task 14 Step 2 so the anti-truncation rule governs *decision content*
   (blockers, observations, provenance, remediations) and not *encoding width*. If the answer
   is that full 64-hex digests and per-observation identity/timestamp are non-negotiable
   provenance, then §2.2 shows the gate fails at two observations and the ceilings need a spec
   amendment — which is exactly the decision the gate exists to force, and it should be forced
   now rather than at Task 12.

The author's disposition ("investigation-go only", Tasks 2–15 no-go until Step 0 passes) is the
right structure and I am not asking to change it. I am asking that the gate be evaluated
against a cardinality the plan's own contract mandates, and that it carry the one lever that
actually moves the number.

---

## 3. Subordinate findings

### R2-02 — MAJOR — Step 0's pass criterion is an estimate, which §2.2 shows is not safe

Plan line 82: *"Tasks 2–15 are no-go until its clean/blocked/full-lifecycle **estimates** fit
240/400/5,600."* Given a 768-token-per-observation slope, an estimate built on an assumed
cardinality reproduces exactly the failure mode round 1 identified — deferred discovery, one
layer earlier.

**Requested change.** Step 0's artifact must be a *measured* serialization of a real
`ActionDecision` for each of the seven v1 actions, populated from the Task 1 Step 1 inventory's
actual required-observation list, not a hand-written sample. That is achievable at Step 0
because Step 1's inventory is its input. Commit those seven serialized fixtures alongside
`authority-baseline.json`, and make VC1 assert their sizes.

### R2-03 — MAJOR — The lifecycle schedule models a near-frictionless run; blocker cardinality is unbounded and unmeasured

Appendix A.1's schedule blocks only on `promote`, always with exactly **one** blocker; the other
ten responses carry `blockers: []`. Real lifecycles are not shaped like that, and the registry
makes the upper bound concrete: `guard-registry.mjs:69-72` lists five exit guards on `review`
(`blocked-by`, `review-exit-review-approved`, `review-exit-epic-children-done`,
`review-exit-close-gates`, `child-cannot-lead-epic`) plus two entry guards, and `runGuards`
**aggregates without short-circuit** (`guard-registry.mjs:159,202-205`) — so a single `close`
attempt can legitimately return five-plus blockers at once.

The measured cost is steep: the author's own 32-blocker stress response is **1,319** proxy
tokens, 2.6x the 500 *absolute* representative ceiling. I accept the author's point that the
spec does not impose the 400-token representative working maximum on every possible blocker
set — but the consequence is that the lifecycle total has no governed upper bound. Two
heavy-blocker queries in a 16-query run add roughly 2,000 tokens, which moves the as-specified
one-observation case from 5,321 to ~7,300 — past the absolute ceiling — with no rule violated.

**Requested change.** Step 0 must record the *observed maximum blocker cardinality per action*,
derived from the Task 1 refusal-branch inventory (it is countable from the guard slots), and
report a worst-realistic-case lifecycle row beside the happy-path row. If the worst-realistic
case cannot fit 7,000, say so at the gate. Task 14 AC3 already requires truthful worst-case
reporting; this makes the worst case an input to the go/no-go rather than a post-hoc disclosure.

### R2-04 — MINOR — Named status/failure codes are introduced across six tasks with no central registry

The revised plan now names at least eight codes: `action-not-explain-ready`,
`authority-read-skipped`, `guard-effect-forbidden`, `guidance-annotation-failed`,
`guidance-catalog-invalid`, `normalization-authority-drift`, `normalization-persist-failed`,
`normalization-readback-failed`, `unknown-vocabulary` — plus `guard-error` and
`guard-result-invalid`. But Task 1 Step 3 (plan line 215) enumerates only three:

> Closed statuses are ready/blocked/indeterminate. Thrown guards, invalid results, and unknown
> vocabulary map to guard-error/guard-result-invalid/unknown-vocabulary and indeterminate.

Codes introduced in Tasks 2, 3, 4, 7 and 10 are registered nowhere. This is the same
single-versioned-contract discipline the plan rightly demands of guard refusals, not applied to
the plan's own vocabulary.

**Requested change.** Make `action-decision/contract.mjs` own a closed enumeration of every
decision status code and named failure, have `vocabularyDigest()` cover it, and extend
`lint-action-refusals.mjs` to fail on a code emitted anywhere in `action-decision/` or
`guidance/` that is not in the enumeration. Cheap, and it prevents exactly the drift the plan
is built to eliminate.

---

## 4. Explicitly not re-raised

To keep round 3 narrow: I am not re-opening the effect-classification contract (R1-03), the
legacy-inventory migration boundary (R1-04), the admission surface (R1-08), the optional-gate
qualification (R1-05), or the cursor-identity correction (R1-15). The author's dispositions on
all five are correct and, in three cases, better-evidenced than my original findings. I have not
reviewed the cache-identity matrix (Task 11) against live `git rev-parse --git-path index`
behaviour, or the Task 13 rule-coverage map, and I do not consider either a gate for acceptance
at plan stage.

## 5. Disposition

| ID    | Severity | Summary                                                                                 | Asked-for outcome                                                          |
| ----- | -------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| R2-01 | BLOCKER  | Probe assumes 1 observation; plan line 249 requires ≥2; at 2 the gate fails by 497 tokens | Re-baseline the probe; publish the slope; decide the serialization contract in Step 0 |
| R2-02 | MAJOR    | Step 0 gate passes on estimates against a 768-token-per-observation slope                 | Require measured serialized decisions for all seven v1 actions             |
| R2-03 | MAJOR    | Schedule models one blocker; `runGuards` aggregates, so five-plus is ordinary             | Record max blocker cardinality; add a worst-realistic lifecycle row        |
| R2-04 | MINOR    | Eight-plus named codes, three registered                                                  | Closed enumeration in `contract.mjs`, covered by digest and lint           |

**Terminal recommendation: REQUEST CHANGES**, scoped to R2-01. The round-1 revision is
substantial and materially improves the plan — fourteen findings are closed, five of them by
correcting me. The remaining issue is singular and, I think, tractable: the feasibility gate is
correctly placed but is currently evaluated against an assumption the plan's own contract
rules out, and the lever that decides the outcome — how a decision is serialized — has not been
chosen. Choose it at Step 0 and I expect to sign off.

Reproduction scripts for every number in §2 are under `.scratch/inspect/` (disposable, per the
repository scratch contract); they take the committed Appendix A.1 strings verbatim as input so
the comparison is apples-to-apples.
