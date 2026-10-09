Generalize the disclosure pattern that #1755 shipped for attribution, rather than adding a reconciliation branch per failure mode.

**Make every delivery refusal addressable.** Give each `verificationError(...)` in `delivery-verification.mjs` a catalog id so it can be named by an exception record. Bare throws that no record can reference are the reason the existing generic mechanism is useless here.

**Open the `delivery.*` family to waiver, but only waivable-with-disclosure.** Keep `workflow-exception` as the single authority path: a durable, GitHub-native record carrying a substantive human reason, the exact scope (issue, PR, head SHA, named invariant), and an expiry. Refuse a wildcard, a stale scope, or an empty reason. Full-Auto must not satisfy this; it is a human decision by construction.

**Make the receipt tell the truth.** Following the #1755 precedent (`attributionDisposition: "waived"`, receipt v3, and its rule that a waived receipt "never presents the waiver as an ordinary attribution pass"), a delivery that passed only because an invariant was waived must render a receipt that names the waived invariant, the authorizing record, the human actor, and the reason. `delivered` becomes two-valued — passed or waived — which is already true for attribution.

**Then fix the narrow reachability bug as a by-product, not as the mechanism.** The `#1562` reconcile block should also admit a pending AITM-authored intent whose pull request merged by a different method, restating the intent to the observed topology after refusing unless the operator's declaration agrees with the real parents. Either that, or the `close` refusal must stop advertising a flag that cannot run from this state.

**Design constraints worth pinning in the spec**

- A waiver must never make an unverified claim look verified; that is the whole point of the disclosure half.
- The waiver is scoped to one issue, one PR, one head SHA and one named invariant. It cannot be ambient, and it cannot carry to the next delivery.
- Prefer widening the one mechanism over adding branches. If the spec finds itself enumerating failure modes, it has taken the wrong turn.
