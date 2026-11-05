**Kind:** code

**Provenance:** Found on 2026-09-10 attempting to close #680 with the lane #1562 had just shipped. The lane works for merges made after it exists, but cannot reach the cases that motivated it, because those pull requests were merged before the code existed.

**Relationships:**

- Follows: #1562, which shipped the lane this issue extends
- Blocks: #680, which now has no other honest route to close
- Related: #1573 (help text for the #1562 flags)

**Blocking:** yes. #680 is complete on substance — spec on trunk, sandbox green, human-approved — and every existing close route is refused. This is its only remaining path that does not involve forcing a bypass or synthesizing evidence.

**Verified refusals on #680**, not inferred: `deliver` current-head cannot see the lane at the required HEAD; `deliver` historical fails `delivery-preflight:historical-intent`; `close --force` never reaches `refuseDeliveryGate` and refuses with `close-delivery-receipt:missing`; the no-commit lane requires zero pull requests; the Incorporated lane is hard-scoped to #1381.

**Design constraint carried from #1562:** the verifier is not relaxed. This widens where a reconstructed intent may come from — observed provider and git facts — never what counts as proof.

**Size guess:** M
