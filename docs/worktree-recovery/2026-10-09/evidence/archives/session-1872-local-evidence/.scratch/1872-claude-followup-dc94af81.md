[05:07:52]
# PR 1875 correction review: `dc94af81` vs `a07f6715`

**Verdict: NOT READY.**

I reviewed this by reading `epic-rank-wave-source.mjs:344-467`, the test file and the guide diff, and tracing each case by hand. I ran no tests or git commands, edited nothing, and used no agents. Because this is a read-only review, I also skipped the plan-file step that plan mode asks for. I took the owner's 42/85 passing tests as reported and did not re-run them.

Most of the correction works. All the new test rows trace correctly, the test-activity fixes hold, and so do the colon and "as many" changes. But one bug was already there and blocks both claimed fixes in their most natural wording, and one new regression comes from the shortened text before the verb.

## Blocking

**1. A withdrawal or negated verb at the end of a sentence is never seen.** `:397`

- **Cause:** the verb pattern requires whitespace after the verb (`…|go)\s+`). Sentences are split on `[.;!?\n]` and trimmed, so a verb that ends the sentence has nothing after it and doesn't match.
- **Result:** with no verb found, the message is never checked for a withdrawal. The immediate-reply patterns at `:456`/`:463` don't cover these either, so all of these stay **verified** after the grant:
  - "The parallel stories should stop." (the first new test row without "for now")
  - "Rank 2 needs to pause."
  - "Epic #107 rank 2 should hold off."
  - "Rank 2 should not run."
  - "Rank 2 cannot proceed."
- **Why it blocks:** this line is unchanged in this diff, so the bug was already there, and I missed it last time. It still blocks: every new test row passes only because some text follows the verb ("for now", "in parallel", "until …"). So neither fix holds for the plainest wording.
- **Fix:** match `(?=\s|$)` instead of `\s+`, using `match.index + match[1].length` as the start of the object. An empty object already works: it has no scope of its own, so the subject supplies it, and the head-word check passes. Add the five sentences above as test rows.

**2. New regression: the shortened text before the verb loses what "it" refers to.** `:412-418`

- **Cause:** a07f6715 checked the whole text before the verb when the object was `it`/`this`/`them`. Now that text is cut at the last comma or reason word. "It" refers back to something named earlier, which is usually inside that reason, so the thing it refers to is cut off.
- **Result:** these refused at a07f6715 (my last report confirmed "The #107 version refuses") and are now **verified**:
  - "Epic #107 rank 2 is broken so stop it." The text before "stop" becomes empty after `so`.
  - "CI on rank 2 keeps failing, so hold off on it."
  - "Rank 2, since CI is red, should pause." This refused at 2e1731d7, when the whole clause was checked.
  - "Rank 2, please hold off on it."
- **Fix:** keep the nearest-first idea, but walk back through the text before the verb. Look at each comma or reason-word piece in turn, starting with the one nearest the verb, and use the first piece that names a scope. If that scope matches, the withdrawal counts; if it names a different epic, skip it.
  - "Because epic #108 is red, the parallel stories should pause" still refuses: the nearest piece names the wave.
  - "Epic #108 rank 2 is broken so stop it" still skips: the nearest named scope is #108.
- **Same fix for split clauses:** apply this walk-back across clause boundaries in `contradictsWave` too. Otherwise "Rank 2, hold off." is split by `:448` into a clause with no scope and stays verified even after fix 1. That case was already broken at a07f6715, but it's the same scope-before-verb problem.
- **Tests:** add the four sentences above plus "Rank 2, hold off." as test rows.

## Minor

- `:407`: there's no word boundary before `not`, so words like "knot" count as negation. This is negligible.
- `:407`: "Why not pause rank 2?" is read as a negated withdrawal verb, so the grant stays verified. It's a question and ambiguous, so it's not a blocker.
- `:358`: "Stop running the tests for rank 2." refuses. Articles are stripped before the `running` modifier, so "the" survives and the head isn't seen as `tests`. This errs toward refusing, which is safe.
- `:347`: a colon followed by a word still splits: "Pause the following: rank 2." stays verified. That was already true at a07f6715, and the wording is contrived.
- Guide `:224-225`: "subject context … cannot conceal a separate withdrawal" overstates the current behaviour until blockers 1 and 2 are fixed. Otherwise it's accurate.

## Correction interactions with no defect found

- **Object scope comes first:** "Cancel parallel children: [160,161]." stays verified. The mismatched object sets `specified:true`, so it doesn't fall back to the subject.
- **Spelled-out negation:**
  - All six new negation rows refuse.
  - In "Let's not", "Let" isn't matched as a verb because of the apostrophe, and "run" is still seen as negated.
  - The `let`/`want` verbs only add refusals: when they aren't negated they have no effect.
- **Running/all:**
  - Of the new test rows, "Stop running tests for rank 2." and "Pause running CI on rank 2." stay verified, and "Stop all rank 2 tests." also passes as expected.
  - Withdrawals still refuse: "Stop running rank 2.", "Stop running the parallel stories." and "Stop all rank 2 work."
- **Colon and "as many":**
  - "Pause rank: 2." refuses.
  - "Pause rank 2: 3 tests failing." refuses; the rank stays at 2 and the head isn't neutral.
  - "Stop as many rank 2 stories as possible." refuses.
- **Earlier rulings still hold:**
  - All reason rows at `:603-612` pass, including the foreign "#108" cut off after the main object.
  - "Pause the epic #107 timer." and "Epic #107 rank 2 PR is not approved." stay neutral.
  - Revoke-purpose rows pass.
  - The grant-side allowlist (`:312`) and `contradicts` (`:284`) are unchanged.

**Verdict: NOT READY for `dc94af81`.** "Rank 2 should stop." and "Rank 2 should not run." still leave a host-verified grant in place; that bug was already there. "Epic #107 rank 2 is broken so stop it." refused at a07f6715 and is now verified, which is a regression this correction introduced.
