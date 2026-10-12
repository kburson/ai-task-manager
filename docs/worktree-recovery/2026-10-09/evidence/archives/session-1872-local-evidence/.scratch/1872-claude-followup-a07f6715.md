[05:00:15]
I've finished tracing a07f6715 against the tests and am writing up the verdict.

# PR 1875 correction review: `a07f6715` vs `2e1731d7`

**Verdict: NOT READY.**

Both findings from my last report are fixed: withdrawals that give a reason, and negation with curly apostrophes, adverbs or no apostrophe. Every new test row refuses, and so does every earlier withdrawal row. All the preservation cases and the grant allowlist still hold. But the correction adds one new fail-open, and the negation fix leaves an obvious gap. I checked by reading `epic-rank-wave-source.mjs`, its test file and the guide, and tracing the code by hand. I ran nothing and edited nothing.

## Blocking

**1. New regression: scope named before the verb no longer counts.** `epic-rank-wave-source.mjs:409-414`

- **At `2e1731d7`:** the scope check ran over the whole clause. A clause whose subject named rank 2, the members or the wave counted as relevant.
- **At `a07f6715`:** relevance comes only from `principalObject(object)`, the text after the verb. The text before the verb is only used when the object contains `it`, `this` or `them`.
- **Result:** when the scope sits in the subject and the object has no scope or is cut short, the withdrawal is skipped.

Each of these refused at `2e1731d7` and is now **verified** after the grant "Run parallel epic #107 rank 2 children [140,144,145].":

| Message | Object text after the cut | Old result | New result |
|---|---|---|---|
| "The parallel stories should stop for now." | `for now.` (no scope) | the clause's `wave` matched, refused | skipped |
| "Rank 2 needs to pause until CI is green." | `""` (cut at `until`) | ranks `[2]`, empty object counted, refused | skipped |
| "I'd like the rank 2 wave to hold off for now." | `for now.` | refused | skipped |
| "Rank 2: hold off on that." | `on that.` (`that` isn't in the pronoun list) | refused | skipped |

The rule meant to stop a foreign epic in a reason from hiding the real target is right, but it went too far.

**Fix:** if the object has no scope words of its own, fall back to `reversalScope(prefix + target)`, not only for pronouns. Keep the object-only scope when the object does name a scope. The foreign epic in "because epic #108 …" is cut off after the main object, so it never reaches either check, and test `:611` still passes. Use the part of the prefix after its last comma or reason word, so that "Because epic #108 is red, the parallel stories should pause" doesn't get rejected because of #108.

**2. Plain `not` after a modal doesn't count as negation.** `:406`

The pattern is `(?:do not|don['’]?t|n['’]t|never|no longer)`. It accepts the contracted form but not the spelled-out one:

- "Rank 2 shouldn't run in parallel." now refuses, because of `n't`.
- "Rank 2 should not run in parallel.", "We must not run rank 2 in parallel.", "Let's not run rank 2 in parallel." and "Rank 2 cannot run in parallel." stay **verified**. `run` isn't seen as negated, it isn't a reversal verb, and nothing says "sequential".

This gap was already there at `2e1731d7`, so it isn't a regression from this correction, and I missed it in my last report. I'm calling it blocking because it's the same kind of negation this correction claims to handle, and the contracted/spelled-out split is a concrete fail-open on ordinary wording. I can't tell whether `7a9736a0` handled it without git.

**Fix:** add `(?:should|must|will|would|can|let['’]s)\s+not|cannot` to the pattern at `:406`, add the matching alternatives to the clause splitter at `:443`, and add test rows for each.

## Minor (fail-closed or not shown to be regressions)

- **Head-only check now refuses some test instructions.** "Stop running tests for rank 2." and "Pause running CI on rank 2." refuse because the head word is `running`. At `2e1731d7` the `tests`/`CI` match anywhere in the object kept them neutral. "Stop all rank 2 tests." refuses because the head is `all`. Fix by adding `running|all` to the words skipped before the head.
- **Some cut words leave the object empty and miss the withdrawal.** "Stop as many rank 2 stories as possible" cuts at `as`. "Pause rank: 2." cuts at `:` before the scope token; `partialScope` accepts `rank: 2` in grants, but `principalObject` breaks it apart here.
- **Negation must still sit right before the verb.** "Don't let rank 2 run in parallel." and "Do not, under any circumstances, run rank 2." stay verified. This is the same kind of gap as last time, now narrowed by the adverb list.
- **Guide is slightly stale.** `docs/guides/epic-rank-waves.md:223-224` still says reversals are checked "per clause". They are now checked per verb against the object, which is what blocker 1 turns on. With blocker 1 fixed, the claim at `:224` that discussion can't hide a withdrawal is otherwise accurate now.

## Interactions checked with no defect found

- **Number commas in member lists:** `,(?!\s*#?\d+\b)` keeps `[140,144,145]`, `[140, 144]` and `#140, #144` together. "Run unit tests for children […] one at a time." stays neutral.
- **Possessive and modifier skipping:** "the stories' tests" and "unit tests" resolve to `tests`; "the full rank 2 wave" resolves to `wave` and refuses. "Pause the epic #107 timer." resolves to `timer` and stays neutral.
- **Reason rows:**
  - All 8 new reason rows refuse.
  - "Hold off … and close the session" is cut by `principalObject`, even though the clause splitter doesn't split there.
  - The foreign epic in "because epic #108 rank 3 CI" gets cut off.
- **Pronoun lookback:** "Epic #108 rank 2 is broken so stop it." doesn't apply, because 108 doesn't match. The #107 version refuses.
- **"Not approved" loop:** "Epic #107 rank 2 PR is not approved." stays neutral because its head is `PR`. "Epic #107 is not approved yet." isn't specific to admission. "Rank 2 is not approved anymore." refuses.
- **Negated reversal verbs:** "Don't pause/hold off on/stop testing …" keeps the grant. "can't stop rank 2" is a negated reversal and isn't treated as a withdrawal.
- **Revoke purpose:** "Don't restart epic #107 rank 2." and "Run sequentially instead." still verify after a revocation (`:464`, `:552`).
- **Grant side:** `contradicts` now also matches `dont`, which only makes grants refuse more often. The allowlist (`:312`) is unchanged.

## Test gaps

- Scope before the verb: "The parallel stories should stop for now.", "Rank 2 needs to pause until CI is green."
- Spelled-out modal negation: "should not / must not / let's not / cannot run rank 2 in parallel."

**Verdict: NOT READY.** The reason and curly-apostrophe fixes hold. But "The parallel stories should stop for now." and "Rank 2 needs to pause until CI is green." now leave a host-verified grant in place, which is a regression the correction introduced. "Rank 2 should not run in parallel." does the same; that gap was already there.
