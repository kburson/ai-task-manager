Refs #1490

Completes #1490's acceptance scope. The multi-source squash topology proof landed in PR #1491, but delivery still refused both target pull requests at `delivery-verification:attribution`, because a merge performed in the GitHub UI carries the default squash body and no `Attribution:` trailer.

## Why the first pass missed it

The original positive fixture used a fabricated body, `'Attribution: [#1488]'`, which no real pull request produces. That fiction satisfied the attribution gate, so the gate was never exercised. Every fixture here now uses the verbatim merge bodies of `f83eb22f` (PR #1487, 5 source commits) and `3a044ea8` (PR #1489, 3 source commits, head itself a merge commit).

Replacing the fixture immediately exposed a real regression in the topology proof from PR #1491: it did not require the inventory to actually be multi-source, so it was rescuing single-source pull requests whose source parent mismatched the merge parent — cases `deliver-single-source-squash.test.mjs` deliberately refuses. Fixed here.

## Changes

**Semantic default-body attribution.** `provesDefaultSquashBodyAttribution` is consulted only when the canonical trailer rule and the legacy single-source exception have both declined, the body makes no canonical attribution claim at all, the intent is external, and the multi-source squash proof has passed. It requires the merge title to lead with the exact top-level `[#N]` and the token set across the complete title and body to equal `intent.attributionTokens` exactly. Missing or extra tokens refuse. Tokens are read with the shared `commit-attribution-format.mjs` primitives, so this stays bound to the documented message-based attribution contract; a parenthesised `(#1489)` reference is correctly not a token.

The unrestricted "top-level title token is enough" rule was deliberately not implemented — it is safe only for a singleton token set and would weaken multi-issue delivery.

Claim detection is whitespace-tolerant (`trimStart`). Canonical acceptance stays byte-exact, so an indented trailer cannot satisfy it, but it still counts as a claim and disables the fallback rather than slipping past an anchored check into the more permissive path.

**Multi-source inventory proof made internally complete.** Strictly multi-source, and now proves length equality between inventory and evidence, valid SHAs on both sides, positional OID correspondence, uniqueness, required message/parents/tree structure, and that the accepted head terminates the inventory. Proven here rather than assumed from the production adapter: the verifier is the trust boundary.

## Verification at `db2fbaab`

- Focused suites 34/34; all twelve delivery suites 176/176
- `verify-develop`, `npm run lint`, `npm run format:check` clean
- New negatives cover indented and duplicated trailers, missing and extra tokens, length mismatch, reordered pairing, duplicate OIDs, non-terminal accepted head, and malformed evidence
- Verb-level regressions prove a refusal writes zero records and a success writes exactly one external intent plus one receipt
- No fixture sets `pullRequest.mergeMethod`; production never provides it and setting it bypasses the topology proof

## Impact

Unblocks external historical-delivery recovery for #1485 and #1488 at their unchanged accepted SHAs, and behind them #1226 and the remaining #1220 chain.
