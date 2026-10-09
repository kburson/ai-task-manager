[04:30:43]
**NOT READY** for `7a9736a0`. The specific N-A and N-B cases from the last report are now handled, but the corrections add two new ways for real permission or a real reversal to be misread, plus one remaining false-refusal pattern.

I only read code: `epic-rank-wave-source.mjs`, its test file, the guide, and the `epic-rank-wave-store.mjs` callers. I ran no tests, git or CI. Plan mode was on, and I wrote no plan file because you asked for no edits. I traced every test in `epic-rank-wave-source.test.mjs` by hand, and each one comes out as asserted.

## Prior blockers

| Item | Status |
|---|---|
| N-A | **Fixed for the four cases reported.** Comparative wording, "instead of", "or" and the test-command cases all refuse now. The permission check (`:292-296`) and the admission-object check (`:297-308`) do this, in both the direct path (`:310-325`) and the labeled path (`:239-242`). But the object check uses a list of blocked words with an open wildcard (B2). |
| N-B | **Fixed for the four cases reported.** The broad negation check on scoped messages is gone, and the revoke purpose only looks at negated revocations (`:375`). But the new reversal patterns have problems of their own (B1, B3). |

## Blocking

**B1 — Exceptions are checked across the whole message, so a real reversal elsewhere in it gets ignored. New in this diff; this lets a revoked grant stay valid.**
`epic-rank-wave-source.mjs:361-364`, `:381-386`, `:389-400`.
- `negatedStop` is set once for the whole message, and now hides the hold-off and pause reversals too (`:392`, `:396`).
- The "tests/lint" exceptions use `.*`, or the whole text before "not approved", so they reach across sentences.

Each message below follows "Run parallel epic #107 rank 2 children [140,144,145]." and leaves the grant **verified**. At `f3a68d79` each one refused.
- "Don't stop CI, but hold off on epic #107 rank 2." The "Don't stop" sets `negatedStop`, which hides the hold-off.
- "Don't wait for CI. Pause epic #107 rank 2." The "Don't wait" hides the pause.
- "Tests pass. Run epic #107 rank 2 children one at a time." The `tests?…one at a time` exception at `:384` matches across the period.
- "Rank 2 tests are green, but epic #107 rank 2 is not approved." The text before "not approved" contains "tests" (`:398-399`).

The same global flag already existed for revocations (`:360`, `:376`): for a rank 3 grant, "Don't revoke rank 2; withdraw epic #107 rank 3." is ignored.

- **Fix:** tie each negation to its own verb, for example with a lookbehind like `(?<!\b(?:do not|don't|never|no longer)\s+)(?:hold off|wait|pause|cancel|stop|revoke|withdraw)`. Check the operation-noun exceptions one clause at a time: split on `[.;!?]` and `,\s*but\b`, and only exempt a noun that sits between the verb and "sequential" or "not approved" in the same clause.
- **Tests to add:** the five examples above should refuse.

**B2 — Approving a parallel operation that isn't on the blocked-word list still grants admission (what's left of N-A).**
`epic-rank-wave-source.mjs:300-307`. Only six operation nouns are blocked (`tests|lint|checks|builds|reviews|scans`). The trailing form allows anything between the scope and "in parallel" (`object\b.+\bin\s+parallel`), and the leading form allows anything after `parallel <object>`. These verify:
- Human message: "Run epic #107 rank 2 children [140,144,145] CI in parallel."
- Assistant: "Should I run epic #107 rank 2 children [140,144,145] verify-develop in parallel?" Human: "Yes." The proposal matches the trailing form, has one `?`, and its scope is complete.
- "Run parallel epic #107 rank 2 children [140,144,145] verification." and "…merges in parallel."
- An odd case: "Run parallel epic #107 rank 2 children [140,144,145] serially." Nothing in either list refuses "serially".

The guide's claim at `:218-219` doesn't hold for these.
- **Fix:** list what is allowed instead of what is blocked. In the trailing form, everything between the verb and "in parallel" must be scope tokens: `(?:epic|parent) #?\d+`, `rank \d+`, and `(?:children|members|stories) [..]`. In the leading form, after `parallel <object>` allow only scope tokens and, optionally, `in isolated worktrees` (needed by `test.mjs:79`, `:97`).
- **Tests to add:** the four examples above should refuse.

**B3 — New reversal patterns refuse ordinary orchestration chatter (N-B's problem, coming back through new patterns).**
`epic-rank-wave-source.mjs:389` (the new `for` and `epic|rank|children|members` objects), `:393` (pause), `:397-400` ("not approved"). Each of these refuses a genuine rank 2 grant:
- "Wait for epic #107 rank 2 CI."
- "Wait for rank 2 to finish before starting rank 3." This also refuses the rank 3 grant.
- "Epic #107 is not approved yet." In this repo, "approve" is the close-approval verb, so this refuses every rank of #107.
- "Epic #107 rank 2 PR is not approved." "PR" isn't one of the exempt nouns.
- "Pause the epic #107 timer."

It's fail-closed, but it spreads:
- Admission checks the head grant with no time cutoff (`epic-rank-wave-store.mjs:223`).
- The ungranted path checks other ranks' heads the same way (`epic-rank-wave-store.mjs:211-216`), so one of these messages blocks rank 3 publication too.

The new guide sentence at `docs/guides/epic-rank-waves.md:217-218` ("neutral scoped status messages do not withdraw") promises the opposite.
- **Fix:**
  - Remove `for` from the wait pattern.
  - Count hold off, wait on and pause as reversals only when the object is scope tokens followed by the end of the clause, or by a wave or admission noun.
  - Count "not approved" only when the subject is scope tokens alone and includes a rank, members or a wave noun.
- **Tests to add:** the five examples above should keep the grant.

## Minor

- **Multi-line permission now refuses** (`:316-323`). `(.+)$` has no `s` flag, so "Run parallel epic #107 rank 2 children [140,144,145].\nUse isolated worktrees." no longer verifies. It did at `f3a68d79`. Fail-closed.
- **The qualifier list now applies to revocations** (`:311`). "Revoke epic #107 rank 2 children [140,144,145]; run them one by one instead." can't be published. Admission still fails closed through the authorize-side scan, but only if the revocation is in the same session as the grant.
- **The immediate-reply check ignores the purpose** (`:404-408`, existing behaviour). A reply that agrees with a revocation, like "Run sequentially instead." or "Go one at a time." right after "Revoke …", refuses that revocation.
- **Two earlier minors are unchanged:** an assistant acknowledgement between "Yes" and a short "Wait." stops the reversal from counting (`:130-138`), and a proposal plus "Yes." over several assistant messages in one turn refuses.
- **Guide overclaims** at `docs/guides/epic-rank-waves.md:217-219` until B2 and B3 are fixed.

## Test gaps

- No test sends a message that mixes a real reversal with a negated or test-noun clause (B1).
- No test uses operation nouns outside the six blocked ones, either as a direct message or as an assistant proposal answered with "Yes." (B2).
- No test checks that "wait for", "not approved" or "pause" wording about PRs, CI, close or timers keeps the grant (B3).
- No test covers multi-line direct permission.

**Verdict: NOT READY** for `7a9736a0`. B1 and B2 still let host-verified parallel authority come from wording that withdraws it or doesn't grant it. B3 brings back N-B's false refusals through the newly added patterns. The minors don't block.
