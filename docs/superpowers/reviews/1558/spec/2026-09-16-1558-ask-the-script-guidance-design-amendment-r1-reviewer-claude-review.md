# #1558 Design Amendment — Reviewer Response, Amendment Round 1

| Field                    | Value                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Role                     | Reviewer (Claude)                                                                             |
| Author                   | Codex                                                                                         |
| Session                  | XPR — amendment review, round 1 (the original design review closed at r4)                    |
| Artifact                 | `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`                    |
| Artifact SHA-256         | `d975dc5b348c15bf95708ff7cc506914d1ba14a54b1d0c36376d3baa8fec99f3` (1,863 lines / 92,988 B)   |
| Previously ratified text | `8f3f37bc4724c072fe222cd8f720499c825748934c8b1689950e66ce261a1a8d` at `795b2650`              |
| Amendment commit         | `11ff2b1f` — *docs: separate agent guidance from decision provenance [#1558]*                 |
| Amendment scope reviewed | 278 changed lines; §§5.6, 13.2 preamble, 14.2, 15.2, 15.4, 15.5, 18, 20.2, 24, 25, Child C/D  |
| Terminal recommendation  | **ACCEPT WITH CHANGES** — three MAJOR, two MINOR. No blockers. The core mechanism is correct. |

## 0. Headline

The amendment resolves the blocker that stopped the plan review. I measured it rather than
reasoning about it, and the result is decisive: **routine output becomes completely independent
of observation cardinality.**

| Observations per decision | Full-bundle serialization (pre-amendment) | §15.2 operational presentation |
| ------------------------: | ----------------------------------------: | -----------------------------: |
|                         1 |                                     5,365 |                      **3,049** |
|                         2 |                                     6,205 |                      **3,049** |
|                         3 |                                     7,025 |                      **3,049** |
|                         5 |                                     8,781 |                      **3,049** |
|                         8 |                                    11,293 |                      **3,049** |

Same sixteen-query schedule and the same committed Appendix A.1 static strings, so these numbers
compare directly with Appendix A.1/A.3. The flat column is the point: the old design's cost grew
776 proxy tokens per additional observation, so the gate's outcome hung on a number nobody had
yet inventoried. That dependency is now gone. 3,049 against a 5,600 working maximum is **45%
unused headroom**, well past the 20% rule.

Single responses clear their ceilings with room:

| Case                                          | Proxy | Working max | Result   |
| --------------------------------------------- | ----: | ----------: | -------- |
| Clean `ready`, first expansion                |    94 |         240 | **pass** |
| Representative blocked (1 blocker)            |   130 |         400 | **pass** |
| Heavy blocked (5 blockers, live `review` exit slots) | 265 |     400 | **pass** |

This is the right fix for the right reason. It is not a budget relaxation, not a lossy encoding,
and not a re-scoping — it removes bytes from the wire that were never needed on the wire, while
§15.5 keeps them reachable. §5.6's framing — *"Complete evaluation does not require complete
evidence serialization into model context"* — is the correct separation, and the accompanying
rule that the presentation "is never accepted as evaluator or executor input" and "cannot become
a second decision authority" closes the obvious abuse. The author's round-2 refusal of my lossy
digest-prefix lever now looks clearly right: that lever was unnecessary as well as unsound.

My earlier concern about `--diagnostic` consuming the lifecycle budget is smaller than I
expected. Each investigation at eight observations costs roughly 540–570 proxy tokens:

| Diagnostic investigations in one lifecycle | Total | vs 5,600 |
| -----------------------------------------: | ----: | -------: |
|                                          0 | 3,049 |   −2,551 |
|                                          1 | 3,587 |   −2,013 |
|                                          2 | 4,159 |   −1,441 |
|                                          3 | 4,732 |     −868 |

Roughly four investigations exhaust the headroom. §20.2's requirement that diagnostic output
"count toward that lifecycle's unchanged total budget" is the correct accounting rule and needs
no change; I note the practical bound only so the measurement fixtures use a realistic
investigation rate rather than zero.

## 1. Verification method

Shell-backed, Node v26.8.1, worktree dependencies installed. I diffed the amendment against the
ratified text at `a5d0245b` rather than re-reading 1,863 lines, then read §13.2, §17.1 and the
surrounding context directly. Codebase checks run live:

- `--diagnostic` appears **0** times in `scripts/` and `bin/` — the flag is free, no collision.
- `explain` and `diagnostic` are **not** in the 72-token `VERBS` set; both are genuinely new.
- `routeIdentityForVerb('next')` returns `null`, so the `next --explain` alias named in §15/the
  plan has no existing route identity to extend. Flagging for the derived plan, not the spec.
- Live `review` exit slots number **six** (`blocked-by-not-done`, `review-exit-review-approved`,
  `review-exit-epic-children-done`, `review-exit-epic-child-disposition`,
  `review-exit-close-gates`, `child-cannot-lead-epic-exit`), which is what the 5-blocker heavy
  case above is drawn from.

Reproduction script: `.scratch/inspect/amend.mjs` (disposable, per the repository scratch
contract). It builds the §15.2 allowlist exactly as the table specifies, including
omission-means-empty.

---

## 2. MAJOR findings

### S1-01 — An `indeterminate` result can be both un-actionable and un-investigable by rule

This is the one finding I would not trade away.

§13.2 lists the causes of `indeterminate`: *"Unknown state, unreadable authority, thrown guards,
malformed results, or required external unknowns."* Two of those — thrown guards and malformed
results — arise inside `runGuards` and will produce a typed blocker, so the presentation carries
`guardId` + `code` and the agent knows what failed. Good.

The other causes do not. A failed or skipped **required read** happens during collection, before
any guard runs. There is no guard to attribute it to. §15.2's allowlist has seven fields and
none of them can carry "which required observation was unavailable" — `snapshot.observations` is
exactly what the amendment removes. So the wire can legitimately contain:

```json
{ "issue": 1558, "actionId": "close", "status": "indeterminate", "blockers": [] }
```

Now compose that with §15.5's rules:

- *"Routine skills do not request diagnostic mode automatically, including after a refusal."*
- *"There is no automatic fallback to full diagnostics on blocked or indeterminate results."* (§15.2)
- *"A later diagnostic call is a fresh observation and may differ from an earlier call. It is not
  retrieval of the earlier evidence bundle."*

The agent is told something is unknown, not told what, forbidden from asking as a matter of
routine, and — because the transient condition may not reproduce — cannot reliably recover the
cause even if it does ask. For an intermittent authority failure (a `gh` timeout, a rate limit,
a partial page) this is the worst case: the one class of failure where provenance matters most is
the class least likely to survive a second call.

§15.5 offers a partial escape — *"A registered remediation may explicitly require investigation
for an unclassified or indeterminate result"* — but a remediation only exists on a blocker, and
the gap here is precisely the `blockers: []` case.

**Requested change.** State normatively in §13.2 (and reflect it in §15.2) that **every
`indeterminate` decision carries at least one typed blocker** identifying the unmet requirement —
collection failures included — with a stable code (`authority-read-failed`,
`authority-read-skipped`, or equivalent) and typed args naming the source whose read failed. That
is one blocker, on the order of 30 proxy tokens, and it is squarely inside the amendment's own
boundary rule: *"The boundary excludes redundant evidence, not operationally required values."*
With 2,551 tokens of measured headroom this costs nothing. Add a corresponding line to §24's
behavioral list so the case is tested rather than assumed.

### S1-02 — §15.2 makes `warnings` and `humanDecision` load-bearing, but neither has a defined shape anywhere in the spec

The amendment promotes both fields to guaranteed, semantically-preserved operational output:

> `warnings` — *"preserve every typed operational warning and its required typed arguments from
> the evaluator/admission result. Do not filter by an agent's perceived relevance."*
> `humanDecision` — *"Preserve the complete typed value whenever non-null."*

But §13.2 defines neither. Its contract JSON shows `"warnings": []` and `"humanDecision": null`,
and its prose specifies `blockers` (stable `guardId`/`code`, exactly one typed `remediation` or
`noAutomaticRemediation`) and `normalizations` (closed `normalizerId`, `inputDigest`, ordered
`decisions`, `decisionDigest`, `persist-on-execute`) in detail — then says nothing about the
other two. The amendment did not create this gap, but it is the amendment that makes it matter:
before, these were incidental members of a bundle; now they are two of seven allowlisted fields
carrying a "preserve every … typed argument" guarantee.

The `warnings` case is worse than `humanDecision` because §15.2 sources it from *"the
evaluator/admission result"* — two different producers. Guidance admission (§10-ish territory,
`guidance-catalog-invalid`, source-divergence warnings) and the lifecycle evaluator would both
emit into one array with no shared schema, no closed code set, and no statement of ordering or
deduplication. A "typed warning" that is not typed anywhere cannot be allowlist-serialized, and
"preserve every required typed argument" is untestable against an undefined shape.

**Requested change.** Add to §13.2 a closed shape for both: a warning as
`{ code, args }` drawn from the same central code registry as blockers (the plan already calls
for `CODE_DEFINITIONS` in `contract.mjs`), with stated producer scope and ordering; and the
non-null `humanDecision` shape, with at minimum the decision kind, who must make it, and the
typed subject. Then §15.2's preservation guarantee becomes checkable.

### S1-03 — Omission-means-empty buys 224 tokens of a budget already 2,551 under, and buys them with a silent-concealment failure mode

§15.2 states: *"Absent `normalizations`/`warnings` means an empty array under this schema;
absent `humanDecision` means null."* `blockers`, by contrast, is *"Required array, including `[]`"*.

That asymmetry is deliberate and the reasoning behind it is sound — an absent `blockers` must not
be readable as "no blockers." But the same argument applies to the other three fields, and the
spec's own §5.6 sets the standard: the presentation boundary *"must never be used to conceal a
failed or unknown check."* Under omission-means-empty, a serializer bug, a dropped field, a
truncated stream, or a partial write is **indistinguishable from a valid empty result**. The
encoding makes concealment silent by construction, in exactly the three fields that carry
warnings, required human decisions, and pending body mutations.

I measured what the ambiguity buys:

```
explicit empties : 119 chars / 30 proxy tokens
omitted          :  64 chars / 16 proxy tokens
saving           :  55 chars / 14 proxy tokens per response
over 16 responses: 224 proxy tokens
```

224 tokens is **4% of the 5,600 lifecycle budget, against 2,551 tokens of measured headroom** —
and 0 tokens on the two single-response ceilings that actually bind, since the clean case is at
94/240. The trade is not close.

There is a secondary cost: §15.2 says *"Adding a default output field requires schema review and
renewed context measurements."* Under omission-means-empty, a consumer cannot distinguish "this
producer does not emit warnings" from "this producer version predates warnings" — which makes the
schema harder to evolve, not easier.

**Requested change.** Make all seven fields required and always present, with explicit `[]` /
`null`. If the author wants to keep omission for a future wire-efficiency reason, gate it behind a
declared schema version rather than baking it into v1 semantics, and say explicitly that a
missing required field is a hard parse failure rather than an empty value.

---

## 3. MINOR findings

### S1-04 — The operational presentation has no schema identifier or version

§15.2 defines a new public wire type — an allowlist with defined omission semantics, an evolution
rule, and its own serializer conformance tests — and gives it no name. The envelope keeps
`"schema": "aitm.action-explanation/v1"`, while its `decision` member changes shape entirely
(from a nested `aitm.action-decision/v1` to the presentation). The spec is explicit that nothing
has shipped, so this breaks no consumer today; the problem is forward. §15.2 requires schema
review to add a field, but there is no version string to bump when that review passes, and no way
for a consumer to detect which presentation shape it received.

**Requested change.** Give it a name and version (e.g. `aitm.action-presentation/v1`), carried
either on the member itself or bound to the envelope version, and state the compatibility rule:
additive fields bump the minor version, removals or semantic changes bump the major.

### S1-05 — `decision` and `diagnostic` are confusable envelope members

In `--diagnostic` output the envelope carries `decision` (presentation shape) alongside
`diagnostic` (full `aitm.action-decision/v1`). The member literally named `decision` is the one
that is *not* the decision contract, and the one named `diagnostic` is. Given that §15.2's whole
purpose is to stop implementers spreading an internal decision into output — *"The serializer must
not spread an internal decision object into output"* — a naming scheme that invites exactly that
confusion is worth a moment's thought. Consider `result` / `decision`, or keep `decision` for the
presentation and name the other `fullDecision`. Non-blocking.

### S1-06 — §20.2's new old-versus-new comparison is real new scope, and will pass easily

The amendment adds a requirement I have not seen before: *"Capture the current Markdown-based
workflow and the proposed workflow against the same lifecycle scenario and authority fixtures …
The new workflow must demonstrate a measured reduction against that equivalent baseline as well as
meeting the fixed budgets."* This is good rigor and I support it, but it is a distinct measurement
deliverable beyond the fixed-ceiling checks, and the delivery outline in §25/Child D mentions it
only in passing.

For calibration: the live static baseline is **13,381** (codex, `bind+review+close`) against
**3,049** for the amended workflow including all sixteen queries of traffic — a ~77% reduction.
The requirement will be met comfortably; it just needs to be scoped as its own artifact rather
than folded into the ceiling checks. Note also that the two sides are not symmetric — the Markdown
workflow has no request/response traffic at all — so the comparison should state that it is
total-context-versus-total-context, not like-for-like category sums.

---

## 4. What I checked and found sound

- **The separation itself.** §5.6's "evidence retention is separate from context presentation,"
  the prohibition on the presentation becoming evaluator input or a second authority, and the
  statement that shortened hashes are now unnecessary — all correct, and the measurement confirms
  the last one with 45% headroom.
- **`--diagnostic` semantics.** Same invocation, no additional authority reads, no re-evaluation,
  operational output byte-identical with and without the switch, no evidence archive, no durable
  ledger, no cross-call cache, no capability token. Each of those closes a real abuse path. The
  "later diagnostic call is a fresh observation" rule is the honest framing.
- **Serializer discipline.** *"must not spread an internal decision object into output"*, plus
  allowlist and semantic-equivalence tests across stdout, stderr, aliases and debug/logging paths
  (§15.2, §24) — this is the correct implementation-level rule and it is testable.
- **No budget relaxation.** §20.2 keeps 4,000 / 240 / 400 / 5,600 and the 20% headroom rule
  unchanged, states the 300/500 ceilings apply to the routine response, and requires any loaded
  diagnostic output to count against the lifecycle total. The amendment did not solve its problem
  by moving the goalposts, which was the outcome I was most concerned about.
- **Receipt hygiene.** The new §15.4 paragraph — evidence digests are not instruction receipts,
  and a marker surviving compaction does not override mandatory invalidation — closes a
  confusion the amendment could plausibly have introduced by putting more digests in play.
- **Amendment provenance.** Status flipped to `AMENDMENT DRAFT`, ratified text pinned by commit
  and digest, and an explicit statement that prior review records "do not constitute acceptance of
  this amendment" with a stated re-review → re-plan → re-review → hydration order. I verified the
  ratified digest is preserved at `795b2650` and that the current file is `d975dc5b…`. Integrity
  is intact.
- **No flag or verb collisions**, per §1.

## 5. Disposition

| ID     | Severity | Summary                                                                        | Asked-for outcome                                                         |
| ------ | -------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| S1-01  | MAJOR    | `indeterminate` + `blockers: []` is un-actionable, and §15.5 forbids asking why | Require ≥1 typed blocker on every `indeterminate`, collection failures included |
| S1-02  | MAJOR    | `warnings` / `humanDecision` are load-bearing in §15.2, undefined in §13.2      | Define closed shapes; put warning codes in the central registry            |
| S1-03  | MAJOR    | Omission-means-empty buys 224 tokens (4%) and hides dropped fields              | Make all seven fields required; missing field = parse failure              |
| S1-04  | MINOR    | Presentation has no schema name or version                                      | Name and version it; state the compatibility rule                         |
| S1-05  | MINOR    | `decision` is not the decision contract; `diagnostic` is                        | Rename one of them                                                        |
| S1-06  | MINOR    | §20.2's old/new comparison is new, asymmetric scope                             | Scope it as its own artifact; state total-vs-total                        |

**ACCEPT WITH CHANGES.** The mechanism is right and the measurement supports it decisively — this
is the correct answer to the problem the plan review surfaced, arrived at without touching a
single ratified budget. All three MAJOR findings are additive clarifications to the amended
sections, not redesigns; none of them threatens the headroom, and S1-01 and S1-03 together cost
well under 300 proxy tokens of the 2,551 available.

I did not re-review the sections outside the 278-line amendment diff; they carry the original
four-round review and their ratified digest. If the human wants the whole 1,863-line spec
re-opened rather than the amendment alone, say so and I will scope round 2 accordingly.
