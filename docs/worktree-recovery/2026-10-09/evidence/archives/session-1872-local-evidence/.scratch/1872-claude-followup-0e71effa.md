[10:07:36]
**Verdict: NOT READY**

The new boundary fixes finding 1, but it causes one new failure in the unsafe direction: a few statements that `1fd28991` blocked now come out **verified**.

I traced everything by hand against `epic-rank-wave-source.mjs:394-479`. I ran nothing, edited nothing, and didn't write a plan file, even though plan mode asked for one, because you told me not to. The red-then-green test results are your evidence; I didn't re-run them.

## Finding 1: resolved

All six new rows in `epic-rank-wave-source.test.mjs:688-693` now trace to **blocked**:
- **"pause," / "hold off," / "run," / "stop,"**: the verb now matches. The object after it is cut at the comma, so it's empty. The scope then comes from the text before the verb (or from the earlier clause in "Rank 2, hold off"). `admissionTarget("")` is true, so the result is blocked. In the "run" case, "not" sits right before the verb, so it counts as negated.
- **"pause:"**: the object is cut at `:(?!\s*[#\[\d])`, then the same path applies.
- **"stop—"**: an em dash isn't in `[\w'’-]`, and the object is cut at `—`.
- Under the old `(?=\s|$)` boundary all six fail to match, which fits the red run you reported.

Continuations are still excluded:
- **Apostrophes:** "let's" and "let’s". "Let's not run rank 2…" still blocks through "not run".
- **Hyphens:** "go-ahead", "stop-gap".
- **Word endings:** "stopping", "running", "used", "going".

## New regression: a verb used as a noun now cuts off the withdrawal's scope

**Where:** `:407` combined with the object slice at `:412-415`.

**What happens:**
- Each matched verb's object ends where the next matched verb starts.
- Verbs followed by quotes, backticks, parentheses or slashes now match, and the object cut at `principalObject` doesn't stop at those characters.
- So a quoted or slashed noun use of a verb now takes the scope away from the withdrawal verb before it.

**Example:** `Withdraw the "go" for rank 2.`
- **At `1fd28991`:** "go" doesn't match. The withdrawal's object is `the "go" for rank 2`, which names rank 2 and passes `admissionTarget`, so it's **blocked**.
- **At `0e71effa`:** "go" matches. The withdrawal's object shrinks to ` the "`, which names no scope, and the text before it has none either. The "go" clause names rank 2, but "go" isn't negated and the object doesn't ask for sequential runs. The result is **verified**.
- **Same flip:** ``Cancel the `run` for rank 2.`` and `Pause the run/build for rank 2.`

**Not caused by this change:** the same scope loss already happens at both commits with plain wording. `Cancel the start of rank 2.` and `Withdraw the go ahead for rank 2.` come out **verified**, because "start" and "go" are followed by a space. The correction only widens this existing gap to punctuated forms.

**Fix:**
- In the slice at `:414`, don't let a verb end the previous verb's object when:
  - it isn't a withdrawal verb, and
  - it comes right after `the|a|an|this|that|its|our|your|their`, optionally followed by an opening `"“‘`(`.
- Keep checking that verb on its own as now.
- Just skipping these verbs wouldn't be safe. It would let `Rank 2 needs the pause.` through, and it would lose the sequential check on `The run should be sequential for rank 2.`
- The fix only makes the earlier verb's object longer, so it fails closed for these phrasings.

**Tests to add:**
- **Expect blocked:** `Withdraw the "go" for rank 2.`, ``Cancel the `run` for rank 2.``, `Cancel the start of rank 2.`
- **Expect verified:** `Cancel the start of epic #108 rank 2.`

## Non-blocking

- **Other dash characters:** an en dash or non-breaking hyphen now ends a verb (for example "stop–gap" with an en dash). That can only add false refusals.
- **Revoke purpose:** negated "revoke" or "withdraw" followed by punctuation is now recognized too. That follows the existing "do not revoke" rule and only adds refusals.

## Grant side

Nothing that grants permission changed. `contradictsWave` is only run on statements after the grant (`:164`, `:498`) and can't create one. But by dropping a refusal it can now leave a grant **verified** that `1fd28991` refused, which is the regression above.
