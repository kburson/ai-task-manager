[04:50:30]
# PR 1875 correction review: `2e1731d7` vs `49343fbd`

**Verdict: NOT READY** for `2e1731d7`.

All 15 examples in the B4 table and test now refuse, along with both polite-prefix joined-verb cases. The grant allowlist is still strict, and the B2 and B3 preservation cases still hold. I checked this by tracing the code by hand. B4 is still only partly fixed, though. The new "exempt named unrelated activity" check looks for an operation word anywhere in the verb's object, and the object runs on to the next verb. So a withdrawal that gives a reason, or that has a qualifier mentioning CI, tests, a review or a build, still leaves the grant **verified**.

I only used Read and Grep on `epic-rank-wave-source.mjs`, its test file and the guide. I ran no tests, git or CI, made no edits and wrote no plan file, as you asked.

## Blocking

**B4-residual: a withdrawal that mentions an operation word in its reason or qualifier fails open.**
`epic-rank-wave-source.mjs:344-355`, `:386-391`, `:418-421`.

- `admissionTarget` only cuts the object at `until|while|before|after` (`:349`).
- It then exempts the object if one of `CI|PR|tests|checks|build|review|close|push|merge…` appears **anywhere** in it (`:352`). The pattern isn't anchored to the start of the object.
- The clause splitter only breaks at `,` or ` and ` when a listed reversal verb follows (`:420`).

With the grant "Run parallel epic #107 rank 2 children [140,144,145]." in place, each later message below still leaves it **verified**:

| Message | Leftover object that gets exempted |
|---|---|
| "Pause epic #107 rank 2 because CI is red." | `because CI is red.` |
| "Hold off on epic #107 rank 2, the tests are flaky." | `, the tests are flaky.` (the comma doesn't split before "the") |
| "Stop rank 2 so I can review the diff." | `so I can review the diff.` |
| "Pause the parallel stories pending review." | `pending review.` |
| "Hold off on rank 2 till CI is fixed." | `till` is not a cut word |
| "Cancel the rank 2 wave since the build is broken." | `since the build is broken.` |
| "Hold off on epic #107 rank 2 and close the session." | `and close…` (`close` is not in the splitter's verb list) |

At `49343fbd` all of these also passed, because unknown trailing words fell outside the old allowlist. My earlier report found that `7a9736a0` refused this shape with its `pause … epic` and `hold off on … epic` checks. So this is still the B4 regression, now with operation-word trailers instead of `for now` or `yet`.

**Fix:** decide the exemption from the head of the object, not from anywhere in it.
- Treat the object as neutral only when the first word left after removing determiners, possessives and scope tokens is a listed gerund or operation noun. A short modifier list such as `unit` needs to be skipped first.
- Also cut the object at reason words and punctuation: `because|since|so|as|pending|till|unless|if|once|when` and `,`, `—`, `:`.

The current preservation tests still pass under this rule if the modifier skip is included:
- "Pause the epic #107 timer." gives head `timer`.
- "Epic #107 rank 2 tests are not approved." gives head `tests`.
- "Run unit tests for children […] one at a time." gives `unit tests`.
- "Run the stories' tests sequentially…" works once the possessive `stories'` is skipped.

**B4-negation: curly apostrophes defeat the new per-verb negation check.**
`:390` checks `(?:do not|don't|never|no longer)`, and the clause splitter at `:420` does the same. Both only accept the ASCII `'`. Other checks in this file already accept both forms with `['’]` (`:284`, `:293`, `:327`).

- "Don’t run rank 2 in parallel anymore." and "Never mind, don’t run rank 2." stay **verified**. `run` isn't seen as negated, it isn't a reversal verb and the message has no sequential wording, so nothing refuses.
- Smart punctuation is on by default when typing on iOS or macOS, so ordinary messages will hit this.
- I can't confirm whether `7a9736a0` handled this. Either way, it's a fail-open in the negation code this correction added.

**Fix:** use `don['’]t` (and ideally `n['’]t` before the verb) at `:390` and `:420`, and add curly-apostrophe rows to the new withdrawal test.

## Minor

- **Some false refusals (fail-closed).** "Pause ranks 3 and 4, keep rank 2." refuses because the rank check is per clause and `, keep` doesn't split. Some trailing words that used to be harmless now refuse.
- **Some withdrawal wording isn't caught (not shown to be a regression).** These are missed:
  - "I don't want rank 2 running in parallel anymore." because no listed verb appears.
  - "Do not actually run rank 2." because the negation must sit right before the verb.
  - "dont run rank 2." because there's no apostrophe.
- **The guide still overclaims.** `docs/guides/epic-rank-waves.md:189-190` and `:223-224` say a neutral clause or CI discussion can't hide a withdrawal. The blocking rows show that a CI or tests mention in the same clause still does.
- **Resolved:** "Don't revoke epic #107 rank 2 yet." now correctly cancels a revocation (`:392-393`).
- **Unchanged from my earlier report:** the two assistant-interleaving minors (`:129-138`).

## Correction interactions checked with no defect found

- **Grant allowlist (`:312`):** the new optional `for` must be followed by end of text once scope tokens are removed, so CI, test, merge and serial wording still refuse. Natural-grant test cases all three verify.
- **Plural `ranks` parsing (`:358-362`):** it is only used for reversal scope. `partialScope` still uses the singular pattern, so a grant written with `ranks 2 and 3` stays incomplete and fails closed.
- **Revoke purpose (`:392-395`):** only a negated `revoke` or `withdraw` contradicts a revocation, so "Run sequentially instead." after a revocation still verifies, as tested at `:551`.
- **B3 cases:** "Wait for …" stays neutral because `wait for` isn't a verb and `starting` doesn't match `start\s`. "PR is not approved" and "the timer" stay neutral through the exemption.

## Test gaps

- Reason clauses with an operation word in the same clause ("because CI…", "so I can review", "pending review", "till CI", "since the build", ", the tests…").
- Curly-apostrophe negation.

**Verdict: NOT READY** for `2e1731d7`. An ordinary withdrawal that gives a reason mentioning CI, tests or a review, or that uses a curly apostrophe, still leaves a host-verified parallel grant in place.
