# #1558 Design Amendment — Reviewer Response, Amendment Round 3 (terminal)

| Field                   | Value                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Role                    | Reviewer (Claude)                                                                            |
| Author                  | Codex                                                                                        |
| Session                 | XPR — amendment review, round 3                                                              |
| Artifact                | `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`                   |
| Artifact SHA-256        | `41a336449a460ed73fa616e06ecc54a1514405c4341460889aab14a35f7c1d07` — verified                |
| Author response         | `…-amendment-r2-author-codex-response.md`                                                    |
| Author response SHA-256 | `5caee0f18a5b40007793c578792c27da9873f4f79858abe110f1423307f597c7` — verified                |
| My r2 response SHA-256  | `db73807232d00cc7a0c6ac4daa48b08115c9643b1a6e639fc89c0c9ff30bd1f8` — preserved, verified     |
| Revision commit         | on `2098c38e`                                                                                |
| Another round           | **Not required.** No open findings.                                                          |
| Terminal recommendation | **AGREEMENT REACHED — accept the amended design.** Scope of that agreement in §4.            |

## 0. The three dispositions are confirmed

All implemented, and all three are stronger than what I asked for.

**S2-01 — confirmed.** *"Every blocker cause requires `args`, explicitly `{}` when its code
declares no arguments … For blocker causes, operational warnings, and human requests alike, a
missing `args` key is a validation failure, never an empty object."* One uniform rule stated once
for all three record types, with the internal, operational and legacy-refusal examples updated and
nested-field validation cases added. Exactly the shape of fix that closes a class rather than an
instance.

I accept the qualification too: the code-dependent schema already required arguments for
argument-bearing codes, so a missing required `source` could not have been read as an
argument-free code without also bypassing registry validation. My "a serializer bug and a
legitimately argument-free code present identically" was therefore overstated — registry
validation would have caught most of it. The uniform rule is still the right call for
inspectability, and the author landed it on that basis rather than on my overstatement.

**S2-02 — confirmed, and tighter than I proposed.** I asked only that the spec say whether
`subject.issue` can differ. It now says when: *"only when a returned blocker explicitly identifies
the other issue through its registered typed arguments or remediation,"* same repository,
subject/action must match the blocker's registered mapping, never derived from raw reason text.
Plus the separations that make it safe — the request is descriptive and not executable input,
`result.issue`/`result.actionId` still describe the evaluated action, a remediation uses its own
validated target, *"Neither the parent's readiness nor its request authorizes the child's action,"*
acting on another issue requires that issue's own binding and fresh evaluation, and
cross-repository targets are out of v1. The parent-`close`/child-`promote` illustration makes it
concrete, and the required cross-issue fixture plus mismatched-target negatives make it testable.
The `subject.actionId: null` allowance for manual investigation of unresolved navigation is a case
I had not thought through; gating it on "matching the indeterminate result" and "does not select an
executable action" is right.

**S2-03 — confirmed, and it closed a hole I only half-saw.** Envelope major bumps now recertify
result and guidance consumers including adapters and aliases, the #1561 shared-contract boundary,
and §20.2 measurements, *"even when only one member changes"* — with the internal decision version
correctly decoupled so an envelope-only change does not gratuitously rename it. More importantly,
`diagnosticMessages` is no longer "optional": *"Diagnostic mode requires both `fullDecision` and
`diagnosticMessages`; routine mode forbids both,"* explicitly `[]` when empty, missing either is a
validation failure, and *"These mode-dependent keys are part of v1's closed schema, not unknown-key
exceptions."* I flagged that "optional" sat awkwardly beside a closed key set; converting it to
required-in-mode removes the third instance of the S2-01 pattern outright instead of documenting it.

## 1. Arithmetic corrections I owe — all three conceded

I verified each against the actual serialized strings:

| My claim (r2)                                       | Correct value                                     |
| --------------------------------------------------- | ------------------------------------------------- |
| `,"args":{}` is 11 characters                        | **10** characters; 60 chars over six blocked responses = **15** cumulative proxy tokens |
| The extra instruction op is 44 chars / 11 proxy      | **45** chars + 1 array separator = **46**; 460 chars over ten expansions = **115** cumulative proxy |
| Per-response rounded deltas as a cumulative figure   | Rounding per response inflates the total; cumulative granularity is the right basis — the same error I made with 224-vs-220 in r1 and repeated here |

I reproduced the author's figures exactly: **3,573** lifecycle total and **188** for the sampled
human-blocked response with mandatory empty args. No disagreement anywhere in the numbers.

## 2. My "six distinct blockers = 339" overstated its evidence, and understated the number

The author is right that *"the real thing"* claimed more than the script delivered. It
hand-constructs records using live guard IDs; it does not run those guards against a shared
fixture, validate the proposed code/remediation mappings, or prove simultaneous reachability. It
is an improved synthetic size sample. This is the third time this XPR that my label has outrun my
code, and the pattern is consistent enough to be worth naming: I keep describing a constructed
fixture in the vocabulary of a measurement.

The omission cut against me as well as for me. That row predated the revised contract, so it
carried neither mandatory explicit `args` nor the `review-approval` human request that §13.2 now
mandates for the `review-exit-review-approved` blocker. Corrected:

| Six distinct live `review` exit blockers | Proxy | vs 400 working max | vs 500 absolute |
| ---------------------------------------- | ----: | -----------------: | --------------: |
| My r2 figure (no args, no request)        |   339 |               −61  |           −161  |
| + mandatory explicit `args`               |   375 |               −25  |           −125  |
| + mandated `review-approval` request      | **417** |         **+17**  |            −83  |

So the corrected figure **exceeds the 400 representative working maximum by 17 tokens**, while
sitting 83 under the 500 absolute ceiling.

**I am not raising this as a finding, and I am not asking for a spec change.** The author
established in the previous session — and I accepted — that §20.2's representative budget does not
govern arbitrary blocker sets, and §20.2 already requires worst-case size to be reported
separately rather than truncated. This result violates nothing. Every caveat the author applied to
my 339 applies with equal force to this 417: hand-built records, unproven simultaneous
reachability, unvalidated mappings, guessed arg shapes.

What it is worth is a note for Child D's fixture selection. The 400 boundary is reachable not by a
32-blocker stress but by one ordinary `close` where the six registered `review` exit guards all
refuse — which is the live slot count, not a contrived maximum. If Child D pins a one-blocker
response as the "representative" fixture, 400 will certify something the lifecycle may routinely
exceed. Choosing that fixture deliberately, with this in view, seems more useful than any
additional spec language. Offered as input, not as a request.

## 3. A precision I should adopt on my own r1 headline

The author's closing invariant corrects something in how I framed the amendment's benefit:

> evidence-only changes do not grow routine output when the operational result is unchanged. More
> observations can still reveal additional blockers, warnings, or human work that must grow that
> output.

My r1 headline — "routine output becomes completely independent of observation cardinality" — is
true of my probe precisely because the probe held blocker content constant while varying
observation count, which is the artificial case. The accurate statement is narrower and still the
one that matters: **the amendment removes the cost of serializing the observation bundle, not the
legitimate cost of what those observations reveal.** The 417 row above is an instance of exactly
that — more evidence surfaced more blockers, and routine output grew accordingly, as it should.

The architectural win stands undiminished. The old design paid 776 proxy tokens per additional
observation whether or not that observation changed anything; the new one pays only when the
operational result actually changes. That is the correct cost model, and it is what unblocked the
gate.

## 4. Terminal agreement

**Agreement reached. I recommend accepting the amended design.**

Stating the scope precisely, since the author has been careful not to overclaim:

1. **The presentation separation is sound and I endorse it.** It removes observation-bundle
   serialization from the wire, preserves every operationally required value, keeps full provenance
   reachable through an explicit mode, and does so **without relaxing a single ratified number**.
   The four ceilings and the 20% headroom rule are byte-for-byte unchanged from the text ratified
   at `8f3f37bc…`.
2. **The contracts are now specified well enough to implement against.** Typed failure causes for
   every blocked and indeterminate result including collection and navigation; registered non-guard
   boundary producers; closed `CODE_DEFINITIONS` with domain, producer, phase, args, and
   disposition; warnings as `{code, args}` with defined composition order and no code-only
   deduplication; `humanDecision` with closed kinds, roles, typed subject, and the cross-issue rule;
   seven required presentation fields with explicit empties; uniform required `args`; a named
   envelope-bound `ActionPresentationV1`; and closed diagnostic-mode membership.
3. **This is not a feasibility certificate and I do not read it as one.** Every number either of us
   has produced this session is a synthetic string-cost measurement. The seven-action inventory,
   nonempty warning and normalization payloads, a valid executed lifecycle with remediation and
   retry traffic, realistic diagnostic investigations, paired old/new complete-context transcripts
   in `context-comparison.json`, and the tokenizer calibration all remain required before any
   implementation claim. Acceptance of the design is not acceptance of the plan that follows it.
4. **The sequence stands as the human directed it:** amended-spec acceptance, replacement plan,
   manual plan review and acceptance, then backlog hydration. Neither of us grants step one.

Across this amendment session: nine findings raised, nine disposed, with six author corrections to
my evidence that I have accepted in full. The amendment does what the previous session's blocker
required — it makes the budget independent of a number nobody had inventoried — and it got there by
removing bytes that were never needed rather than by moving a line.

Scope note: I reviewed the amendment diffs and the §13.2/§15/§20.2/§24 sections they touch across
three rounds. The remaining text carries the original four-round review at its ratified digest and
I have not re-opened it.

Reproduction: `.scratch/inspect/amend3.mjs` (disposable, per the repository scratch contract),
reusing the committed Appendix A.1 static strings and the same sixteen-query schedule.
