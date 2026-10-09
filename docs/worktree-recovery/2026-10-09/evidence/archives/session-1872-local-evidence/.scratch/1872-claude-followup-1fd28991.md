[09:59:44]
# PR 1875 correction review: `1fd28991` vs `dc94af81`

**Verdict: NOT READY.**

Finding 2 is resolved. Finding 1 is only partly resolved: the verb pattern now requires whitespace or the end of the text after the verb, so a verb followed by a comma or other punctuation is still never seen. That leaves a host-verified grant in place for ordinary wording.

I traced every case by hand against `epic-rank-wave-source.mjs:344-479`. I ran no tests, made no edits, used no agents and wrote no plan file. The owner's test results are as they reported them; I didn't re-run them.

## Blocking

**1. Partly resolved: a withdrawal or negated verb followed by punctuation is still invisible.** `:407`

- **Cause:** the new lookahead `(?=\s|$)` only fixes a verb at the very end of a sentence. Commas don't end a sentence (`:453`), and the clause split at `:456` only splits on a comma when the next word is a verb.
- **Result:** in each case below, the verb pattern matches nothing. Nothing at `:442` or in the immediate-reply patterns at `:467-477` catches them either, so `contradictsWave` returns false and these all stay **verified**:
  - "Rank 2 should pause, CI is red." The next word, "CI", isn't a verb, so the sentence stays one clause, and "pause," doesn't match.
  - "Rank 2, hold off, CI is red." The sentence splits into "Rank 2" and "hold off, CI is red", and "off," doesn't match.
  - "Rank 2 should not run, CI is red."
  - "Epic #107 rank 2 needs to stop, tests are failing."
- **Why it blocks:** this is the same flaw as finding 1 (a verb is only seen if whitespace follows it), on the line this correction changed. It still fails in the unsafe direction.
- **Fix:** change the lookahead to `(?![\w'’-])`. With that change, each sentence above traces to **blocked**:
  - The object becomes ", CI is red". `principalObject` cuts it at the comma, leaving an empty target.
  - The scope then comes from the text before the verb ("Rank 2 should "), and `admissionTarget` returns true.
  - The new lookahead still excludes "let's", "go-ahead", "stop-gap" and "stopping".
- **Tests:** add the four sentences above as rows in the "sentence-final" test.

## Finding 2 (shortened text before the verb, "it" losing its referent): resolved

- **Nearest scoped piece:** `contextualReversalScope` walks back through the pieces before the verb and uses the nearest one that names a scope. All six blocked rows and all seven verified rows in the new test trace as the test expects.
  - "Epic #107 rank 2 is broken so stop it": the nearest named scope is #107, so it's **blocked**.
  - "Epic #108 rank 2 is broken so stop it": the nearest named scope is #108, so the withdrawal is skipped and it stays **verified**.
  - "Because epic #108 is red, the parallel stories should pause": the nearest piece names the wave, so it's **blocked**.
  - "Rank 2 is fine, rank 3, hold off": the nearest piece is rank 3, so it stays **verified**.
- **Scope across split clauses:** the earlier clauses in the same sentence are now passed in at `:461`, so "Rank 2, hold off." is **blocked**.
- **Disjoint objects and numeric lists:**
  - The rule `,(?!\s*#?\d+\b)` keeps "[160,161]" together in both `principalObject` and `contextualReversalScope`.
  - A disjoint member set in the object sets `specified:true`, so the subject is never consulted.
  - "Children [160,161], hold off." resolves to the members piece and stays **verified**.
- **Sentence boundary resets context:** scope from an earlier sentence never carries over (`:453`), so "Rank 2 tests passed. Please hold off on deployment." stays **verified**.
- **Negation stays local:** the negation check (`:416-419`) only looks immediately before each verb.
  - "Rank 2 should not pause." and "Rank 2 should never stop." stay **verified**.
  - In "Don't stop rank 2, pause it.", "pause it" is **blocked** through the scope of the earlier clause.

## Grant side: unchanged

`contradicts`, `directPermission`, `wholeAffirmation`, `parallelAdmissionObject` and `unqualifiedPermission` are untouched. `contradictsWave` is only called on statements after the grant (`:164`, `:498`), and the changes can only add refusals. None of them can create a grant.

## Non-blocking

All three of these err toward refusing or were already present before this correction:

- **Activity named in the subject:** with nothing after the verb, the activity check never sees the subject. So "Rank 2 tests should not run." and "The epic #107 timer should pause." are now **blocked**, while their object forms ("Pause the epic #107 timer.") stay neutral. That's a false refusal, which is the safe direction. A possible fix: when the object is empty, run `admissionTarget` on the scoped piece before the verb.
- **Scope only after the verb:** "Stop, rank 2 is broken." stays **verified** even with the fix above, because the scope sits in the text after the comma. This was already true before the correction and isn't part of either finding.
- **Bare follow-up sentence:** "Rank 2 is failing. Hold off." stays **verified** because context resets at the sentence boundary. This is the trade-off of that design choice, not a regression.

**Verdict: NOT READY for `1fd28991`.** Finding 2 is resolved and I found no regression from it. Finding 1 still fails on "Rank 2 should pause, CI is red." and "Rank 2 should not run, CI is red.": both leave the grant **verified**.
