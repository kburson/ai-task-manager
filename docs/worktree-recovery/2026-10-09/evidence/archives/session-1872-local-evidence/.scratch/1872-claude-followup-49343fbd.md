[04:40:44]
# PR 1875 correction review: `49343fbd` vs `7a9736a0`

**Verdict: NOT READY** for `49343fbd`. B2 is fixed and B3 is fixed for the cases I reported. B1 is only fixed for the exact shapes I reported. The new clause-anchored, allowlist-object reversal parser also introduces a regression: later messages that genuinely withdraw a grant are missed, so the grant stays **verified**. Every example under B4 was refused at `7a9736a0`.

I read `epic-rank-wave-source.mjs`, its test file, the guide, and the `epic-rank-wave-store.mjs` callers (`:154-161`, `:211-217`, `:223`). I ran no tests, git or CI, and made no edits. Plan mode was on; I wrote no plan file because you asked for no edits. I traced all five new tests and the existing reversal and preservation tests (`:285-488`) by hand, and each one comes out as asserted.

## Prior blockers

| Item | Status |
|---|---|
| B1 | **Partly fixed.** Splitting into clauses (`:412-415`) handles the reported `.`, `;` and `, but` shapes. The same concealment still happens when clauses are joined by a comma or `and`; this is covered in B4. |
| B2 | **Fixed.** `parallelAdmissionObject` (`:309-315`) is now an allowlist checked after scope tokens are removed (`:297-308`). CI, verification, merges, serially and the verify-develop proposal all refuse. I found no way to get an operation word through. |
| B3 | **Fixed for the reported cases.** "wait for", "PR is not approved", close approval and timer pauses all keep the grant. |

## Blocking

**B4 — Reversal detection now fails open. This is a regression from `7a9736a0`.**
`epic-rank-wave-source.mjs:344-352`, `:374-406`, `:412-415`.

Three things combine to cause it:
- Each reversal pattern only matches at the very start of a clause, after an optional `actually`, `please` or `let's` (`:374`).
- The words after the reversal verb must all come from a closed allowlist (`admissionTarget`, `:349`).
- The "not approved" pattern must reach the end of the clause, with only an optional `yet` (`:401`).

Using an allowlist is the safe choice for granting permission, because anything unknown refuses. For reversals it is the unsafe choice, because anything unknown keeps the grant. Clauses are only split on `.;!?\n` and `, but`.

With the grant "Run parallel epic #107 rank 2 children [140,144,145].", each later message below now leaves it **verified**:

| Message | Why it is missed | Removed check at `7a9736a0` that refused it |
|---|---|---|
| "Hold off on epic #107 rank 2 for now." | leftover `now` | `hold off on … epic` |
| "Stop rank 2 for now." | leftover `now` | `cancel\|stop … rank` |
| "Hold off on the parallel stories for now." | leftover `now` | `hold off on … parallel` |
| "Hold off on rank 2 and rank 3." | leftover `and` | `hold off on … rank` |
| "Pause epic #107 ranks 2 and 3." | `ranks` plural, leftover `and` | `pause … epic` |
| "Don't run rank 2 in parallel anymore." | leftover `anymore` | executionReversal |
| "Do not proceed with epic #107 rank 2 yet." | leftover `yet` | executionReversal |
| "Don't approve rank 2 yet." | leftover `yet` | permissionReversal |
| "Withdraw my approval for rank 2." | leftover `my approval` | revoke/withdraw anywhere |
| "I revoke the rank 2 permission." | leading `I` | revoke/withdraw anywhere |
| "OK, hold off on epic #107 rank 2." | leading `OK,` | `hold off on … epic` |
| "Never mind, don't run rank 2." | leading `Never mind,` | executionReversal |
| "Rank 2 is not approved anymore." | `anymore` after "approved" | `is not approved` |
| "Don't wait for CI, pause epic #107 rank 2." | joined by a comma, so one clause | (not refused at `7a9736a0` either; this is the B1 shape) |

**Impact:** the loader's later-message scan (`:158-168`) is the only thing that withdraws a grant for hold-off, stop, pause and don't-run wording. A revocation record can only be created from `revoke` or `withdraw` wording (`:221`, `:321`). So with these phrasings the store's admission checks (`epic-rank-wave-store.mjs:223`, `:241-256`) keep accepting authority that was withdrawn.

**Fix:** keep the permission allowlist. For reversals, make unknown wording count as a reversal:
- Find the reversal verb anywhere in the clause, not only at the start. Tie negation to that verb only, for example a lookbehind for `do not|don't|never|no longer`.
- Also split clauses on `,` and on ` and ` when it comes before a verb.
- Count the clause as a reversal when the verb's object starts with a scope or admission token, whatever words follow.
- Treat it as neutral only when the object is a non-admission activity:
  - a gerund, such as "stop reviewing…"
  - or a named operation noun that the scope words describe: CI, PR, timer, tests, lint, checks, build, close, push or merge.
- Keep `wait for` out of the reversal verbs so B3 stays fixed.
- Remove the end anchor from the "not approved" pattern. Exempt it only when the subject's head noun is a named operation (PR, tests, close).

**Tests to add:** every row in the table should refuse. The existing preservation tests (`:285-301`, `:445-456`, `:480-488`) and the new B3 test should keep passing.

## Minor

- **Natural grant wording now refuses** (`:312`). It fails closed, but these used to verify:
  - "Run the epic #107 rank 2 children [140,144,145] in parallel." becomes `the in parallel.` after scope removal, which doesn't match.
  - "Run epic #107 rank 2 children [140,144,145] in parallel in isolated worktrees."
  - "Approve parallel admission for epic #107 rank 2 children [140,144,145]." leaves a trailing `for`.
- **The multi-line fix covers one exact sentence only** (`:317`). Only `\nUse isolated worktrees.` is accepted on the second line. Any other second line still refuses, which fails closed.
- **A negated revocation with extra words doesn't cancel the revocation** (`:381-385`). For example, "Don't revoke epic #107 rank 2 yet." after "Revoke …" still lets the revocation verify. This fails closed, since authority is withdrawn.
- **The guide overclaims until B4 is fixed.** `docs/guides/epic-rank-waves.md:189-190` says explicit reversals refuse, and `:223-224` says neutral or negated clauses can't hide a withdrawal.
- **Two earlier minors are unchanged** because that code (`:129-138`) wasn't touched: an assistant acknowledgement between "Yes" and "Wait." stops the reversal from counting, and a multi-message assistant turn followed by "Yes." refuses.

## Test gaps

No current test sends a later reversal that has:
- trailing words such as "for now", "yet" or "anymore";
- a leading phrase such as "OK," or "Never mind,", or "I" as the subject;
- more than one rank joined by "and";
- a comma or "and" joining a neutral clause to a real reversal;
- possessive or noun objects, such as "withdraw my approval".

No test covers natural grant wording with a leading "the" or with "in parallel in isolated worktrees".

**Verdict: NOT READY** for `49343fbd`. B4 means ordinary withdrawal wording leaves a host-verified parallel grant in place, and `7a9736a0` refused every example except the comma-joined one.
