[04:17:55]
I read the corrected source parser, its tests, the guide and the store paths that call it. The new tests pass by reading, and the specific cases from the last report are handled. **NOT READY:** R2 and R3 still turn some non-approving wording into authority, and the R1 fix brings back the false-refusal problem R4 described.

**Scope:** I reviewed `f3a68d79` against base `171c7d93` by reading the code only (Read/Grep/Glob). I ran no tests, no git and no CI, and spawned no agents. Plan mode was on, but I wrote no plan file because you asked for no edits. Test receipts, CI results and timing fields are outside this static review.

## Status of R1–R4 and the immediate-reply minor

| Item | Status |
|---|---|
| R1 | **Resolved for refusals.** `epic-rank-wave-source.mjs:334` applies the full refusal word list to any message that names this epic, rank or members. All five phrasings refuse. But this introduces N-B below. |
| R2 | **Partly resolved.** Negated and deferred requests now refuse (`:292`, `:409`). The command still grants on its opening verb, whatever the rest of the sentence says (N-A). |
| R3 | **Partly resolved.** The four tested negative proposals refuse. Polarity is still judged from a list of blocked words, so other negative or either-or proposals pass (N-A). |
| R4 | **Resolved as described.** "Sequential" and "one at a time" no longer count as wave words (`:333`), and both tested sentences keep the grant. A message that also says stories, children or members still refuses. See the guide nit below. |
| Immediate-reply minor | **Resolved as I recommended.** The rule now only checks the first message after the last referenced one (`:130-138`, `:164`), so a human reply after an assistant turn doesn't count. The trade-off is listed under Minor. |

## Important (blocking)

**N-A — Grants still depend on the opening verb, not on what the sentence asks for (what's left of R2 and R3).**
`epic-rank-wave-source.mjs:291-300` (`directPermission`) and `:224-243` (`permissiveProposal`), used at `:427` and `:255`/`:263`. The check only asks two things: does the text start with run/enable/proceed, and does `parallel` appear anywhere in it. These grant parallel admission today:
- Human message: "Run epic #107 rank 2 children [140,144,145] one by one rather than in parallel." Nothing on the refusal list appears (`:283-287`), the opening-verb check matches `Run`, and the intent check matches `parallel`. Result: **verified**.
- Human message: "Run the unit tests for epic #107 rank 2 children [140,144,145] in parallel." The thing being run is the tests, not the admission. Result: **verified**.
- Assistant: "Should I run epic #107 rank 2 children [140,144,145] individually instead of in parallel?" Human: "Yes." Once `Should I` is stripped, the text starts with `run`, and nothing on the refusal list appears. Result: **verified**.
- Assistant: "Should I run parallel epic #107 rank 2 children [140,144,145] or stagger them?" Human: "Yes." The question offers two choices, but there is only one `?`, so it isn't flagged as ambiguous (`:256`). Result: **verified**.

The labeled path at `:239-241` accepts any line that starts with `Parallel`, whatever follows.
- **Fix:** require `parallel`, `concurrent` or `rank-wave` to be the direct object of the verb (`^(…prefix)?(enable|authorize|approve|allow|run|proceed with)\s+(the\s+)?(parallel|concurrent|rank[- ]wave)\b`), or allow only a trailing `in parallel[.!?]?$`. In both forms and in the labeled path, refuse `rather than`, `instead of`, `than`, `versus`/`vs`, `without`, `except` and a bare `\bor\b`. The existing accepted cases still pass under this rule (`:79`, `:97`, `:103`, `:418-419`).
- **Tests to add:** the four examples above.

**N-B — The R1 fix makes ordinary status chatter refuse the wave. This is new in this correction.**
`epic-rank-wave-source.mjs:334` together with the list growth at `:283` (`\bnot\b`, `n['’]t\b`, `\bpause\b`). "Scoped" here means the message names any one of the epic, the rank or a member. So any later message that names the epic alone or the rank alone and contains `no`, `not`, `n't`, `wait` or `pause` refuses:
- "Don't close epic #107 yet." refuses every rank of epic #107.
- "Epic #107 has no open PRs." refuses as well.
- "rank 2 tests aren't passing" refuses even though no epic is named.
- "Don't revoke epic #107 rank 2." refuses. This happens because `:334` runs before the negated-revocation handling at `:336`.

These are fail-closed (they refuse, they never grant), and a fresh record recovers. But they will come up all the time while #107 is being orchestrated, which is the same rehearsal risk that made R4 blocking.
- **Two side effects:**
  - The same check now runs for revocations, so a follow-up that agrees with a revocation ("Revoke epic #107 rank 2." then "Don't restart epic #107 rank 2.") refuses the revocation at publication (`epic-rank-wave-store.mjs:241-256`).
  - It also reaches other ranks: the ungranted path verifies other ranks' head sources with no `through` cutoff (`epic-rank-wave-store.mjs:211-216`). Chatter about rank 2 then blocks inspection of rank 3.
- **This partly comes from my own R1 recommendation, which was too broad.**
- **Fix:** for scoped messages, use a wider list of explicit reversal phrases rather than bare negation words: hold off, pause, wait on, not approved, do not/don't proceed/run/enable/start, stop, cancel, revoke, withdraw, and go/run/keep/switch sequential or one at a time. Either require a rank or member match, or require the negation to attach to an admission verb. Run the negated-revocation exclusion before the scoped check, and skip the scoped check when `purpose === 'revoke'`.
- **Tests to add:** the four examples above should keep the grant. "Revoke …" followed by an agreeing "Don't restart …" should leave the revocation verified.

## Minor

- **Short-reversal window** (`epic-rank-wave-source.mjs:130-138`, `:164`). In a real session, the message right after the human's "Yes" is almost always the assistant's acknowledgement. So "Wait." or "Hold off." typed after "Recording epic #107 rank 2 authorization…" no longer refuses. This was the trade-off I recommended. A better version would keep a human reply as immediate when every assistant message in between either names this wave or asks no question. A related edge case: if a Codex injected user-role message (environment/instructions) comes first, it becomes `nextMessage` and hides the real reply.
- **Proposal binding with several assistant messages in one turn** (`:106-114`, `:396-401`, `:440`). Codex often sends several assistant messages in one turn. If the proposal is in an earlier one, "Yes." binds to the last one and refuses with `source-context-mismatch`. Referencing both messages doesn't help, because `proposal` is overwritten by the last referenced assistant message. This only refuses, so it isn't a security issue.
- **Guide overclaims** (`docs/guides/epic-rank-waves.md:216-217`). It says sequential test-run instructions don't withdraw permission. "Run the stories' tests sequentially" does withdraw it (because of the wave noun at `:333`), and so does any test instruction that names the epic and uses sequential wording (`:334`). The guide should say they keep permission only when they don't name the epic, rank or members and don't mention stories, children, members or parallel.

## Test gaps

- No test covers comparative or either-or wording, as a direct human message or as an assistant proposal (N-A).
- No test checks that scoped chatter which agrees or is neutral keeps the grant or the revocation (N-B).
- No test has an assistant acknowledgement between "Yes" and a short "Wait." (immediate-reply minor).

**Verdict: NOT READY** for `f3a68d79`.
- **Blockers:** N-A still lets non-approving human wording, and "Yes." to a negative or either-or proposal, verify as host-verified parallel authority. N-B will refuse genuine #107 waves during ordinary orchestration.
- **Not blocking:** the three Minor items.
