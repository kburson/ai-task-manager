# Manual peer review: reviewer response, round 2

- Issue: #1768
- Author source: `docs/superpowers/reviews/1768/2026-09-23-1768-review-lifecycle-author-response-r1.md`
- Reviewed spec: `docs/superpowers/specs/2026-09-22-1768-review-lifecycle-design.md`, version 4 at `c01a0620eceb22b1652b320da22886dac28fb9b1`
- Prior round: `docs/superpowers/reviews/1768/2026-09-23-1768-review-lifecycle-reviewer-response-r1.md`
- Review method: manual file exchange; this is not an `ai-peer-review` protocol submission or acceptance
- Reviewer: Claude Opus 5 (`claude-opus-5`), Claude Code
- Decision: accepted

## Summary

All six required findings from round 1 are resolved in version 4. I verified
each against the committed bytes at `c01a0620` rather than against the author
response's description of them.

Two of the fixes are better than the minimum I asked for. Finding 1's resolution
does not merely order the aggregate SAR after Refine; it also adds the
cross-child boundary case (a child's refinement invalidating a sibling's
boundary) that my finding did not name and that would otherwise have been the
next gap. Finding 2's resolution separates provenance bookkeeping from semantic
content in the digest — the exemption I suggested — and then adds a shared
ten-round budget across the plan-and-hydration cycle, which is the part that
actually guarantees termination. An exemption alone would have removed one
cycle; the budget bounds the rest.

Finding 4 is resolved as a clarification rather than a change of policy, and I
accept that reading. The author's position is that a hosted path selected under
a healthy preflight stays required even if the provider dies before launch, and
that the run blocks rather than downgrading. That is the stricter of the two
options I offered and it is the one consistent with the document's own honesty
constraints; a mid-run downgrade would have made the recorded review level a
function of provider uptime. Version 4 states it explicitly (lines 193-196) and
AC8 remains correct because it scopes SAR-only selection to preflight absence.

The remaining items below are optional. None of them blocks acceptance, and one
of them is a repository interaction the design cannot be expected to have
anticipated.

## Required findings from round 1

### 1. Hydration ordering and digest baseline — resolved

Verified at lines 216-235. "Only after the complete child inventory is in R4P
does the aggregate hydration SAR compare it to the exact ratified master plan."
The receipt digests "each child's semantic issue content at the moment of
acceptance," not at hydration, which removes the guaranteed-stale baseline. The
recheck before epic Plan exit is now well-defined because the baseline is taken
after the Refine mutations that previously invalidated it.

The added sentence at lines 216-218 — revise affected children and complete
their normal Refine gates when one child's refinement changes another's boundary
— closes the follow-on case my finding left open.

### 2. Master-plan revision cycle — resolved

Verified at lines 229-241. `Source-plan*` is named as provenance bookkeeping and
excluded from the semantic digest, so source-field reconciliation no longer
self-triggers an aggregate SAR. The shared ten-round budget across the
plan-and-hydration cycle, explicitly including rounds that produce a new plan
version, bounds the remaining loop. Exhaustion leaving the epic in Plan for an
explicit planning decision, with no silent budget reset, is the right terminal
state: it surfaces the condition instead of either blocking opaquely or looping.

### 3. Risk evaluator and unknown signals — resolved

Verified at lines 170-185. The SAR reviewer emits a yes/no/unknown value with
cited evidence per signal; AITM validates completeness and applies the rubric.
An unclear signal is retried in another SAR round; a persistently unknown value
is recorded with its reason, pauses Full-Auto on that issue, and refuses
selection, never defaulting to low risk. This names the producer, the validator,
the retry, and the terminal behavior — the four things the previous text left to
the implementer.

### 4. Provider loss after preflight — resolved as clarified

Verified at lines 193-196. Accepted as stated; see Summary for why I think the
block-rather-than-downgrade choice is the correct one rather than merely a
defensible one.

### 5. GitHub issue revision — resolved

Verified at lines 250-252. The nonexistent revision counter is gone. The receipt
now binds the issue number, the Deep-Dive section digest, and the digest of
scope, AC, verifier, dependency fields, and estimate. Those digests carry the
change sensitivity the removed field was reaching for, and they correctly ignore
the metadata churn that `updatedAt` would have picked up.

### 6. Artifact version authority — resolved

Verified at lines 69-75. Commit and blob are authoritative; `version` is "a
readable ordinal, never a substitute for the commit." Monotonicity is checked at
three named points (governed writer before commit, review entry, before Refine
or Plan approval). Duplicate, skipped, and regressed versions refuse review or
promotion, and repair is a new correctly versioned commit plus an anomaly
record rather than a relabeled acceptance. All three of my sub-questions —
authority, detection site, violation behavior — are answered.

## Optional suggestions

1. **The operation-ID marker perturbs an existing fingerprint.** Line 135-137
   places `<!-- aitm-idea-operation id="<uuid>" -->` in the `Story Origin`
   section. In this repository, `scripts/task-tracker/lib/refinement-history.mjs:134`
   computes `storyOriginFingerprint` as `sha256(rootSection(body, 'Story Origin'))`
   over that section's whole content. Adding a marker inside it therefore changes
   that fingerprint for every enrolled issue. Separately, "preserved by the
   issue-body mutator" requires enrolling the marker in the registry in
   `scripts/task-tracker/lib/body-invariants.mjs`, whose header comment calls out
   that non-standard shapes need their own branch in `findLostMarkers`. Neither
   is a design error — both are implementation consequences the design could name
   in a sentence so they are not discovered during Develop.

2. **"Repeated material SAR findings" is self-assessed.** Line 175 makes this a
   rubric signal, and lines 170-171 make the SAR reviewer the producer of every
   signal value. So the SAR reviewer judges whether its own findings were
   material, and that judgment feeds the score deciding whether an independent
   reviewer is engaged. The incentive is mild and the honesty constraints
   elsewhere mitigate it, but a one-line definition of "material" — for example,
   a finding the author accepted and fixed, rather than one the reviewer felt was
   important — would make the signal mechanical rather than reflexive.

3. **AC4 under-specifies what it gates.** Line 306-307 still reads as an
   obligation ("revisions increase their integer version on every committed byte
   change") plus a binding statement. The genuinely verifiable behavior added by
   Finding 6's fix is the refusal: duplicate, skipped, or regressed versions block
   review or promotion. Consider restating AC4 around that refusal, which can be
   tested, rather than around the obligation, which cannot.

4. **Aggregate SAR findings that change the child set.** Lines 222-235 handle
   revision of existing children and inventory change, and correctly charge both
   to the shared budget. What is not stated is whether an aggregate-SAR finding
   may retire an already-created child, and if so what that costs — closing a
   governed issue is a heavier and less reversible operation than revising one,
   and the WBS coverage guard has an interest in it. A sentence stating whether
   child retirement is in scope for aggregate-SAR corrections would remove the
   ambiguity.

5. **Two claims on `Story Origin`.** Step 1 (lines 134-137) puts the operation-ID
   marker there; step 3 (lines 140-142) puts the spec path and commit in "the
   issue's Story Origin or another canonical issue-owned reference." The section
   can hold both, but the second clause's optionality now reads oddly next to the
   first clause's specificity. Naming one location for both would be clearer.

## Verification performed

- Confirmed `c01a0620eceb22b1652b320da22886dac28fb9b1` exists and is
  `[#1768] docs(spec): address manual peer review findings`; diff against
  `59e63f59` is 77 insertions, 31 deletions in the spec only.
- Read the version-4 spec from the commit object, not the working tree.
- Confirmed `Story Origin` is a real section with helpers
  (`scripts/task-tracker/lib/story-origin.mjs`) and that
  `refinement-history.mjs:134` fingerprints it.
- Confirmed `scripts/task-tracker/lib/body-invariants.mjs` carries an explicit
  marker registry with a documented extension point.
- Re-confirmed the round-1 repository claims still hold: `brainstorm` is an
  alias of `discover` (`scripts/task-tracker/verbs/help-data.mjs:851`), and the
  WBS `Source-plan` family is consumed by
  `scripts/task-tracker/lib/decomposition-wbs-coverage.mjs`.
- No repository files were modified in this round other than this response.

## Decision

accepted

The five optional suggestions are the author's to take or decline; none requires
another reviewer pass. If any is adopted, the version bump and its normal gates
apply as the spec itself now requires.
