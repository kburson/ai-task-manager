Add a narrow, audited reconciliation lane for an observed merge method that diverges from the configured one. Sketch, to be settled at Refine:

- A `deliver --accept-observed-merge-method` (or a `close --reconcile-merge-method`) that records a receipt naming the method **actually observed**, marks it divergent from the configured intent, and requires an explicit reason.
- The receipt must state the divergence rather than hide it, so downstream attribution and any delivery audit can see that the configured method was not used.
- Refuse the lane when the pull request is not merged, or when the head does not match the accepted SHA — this reconciles the method only, never the identity of what shipped.

Two adjacent hardening options worth weighing at Refine rather than assuming:

- Have `deliver` detect the divergence **before** the merge where it can, and warn at Review time that the repository permits merge methods the configuration forbids.
- Recommend, in the governance guide, that repositories disable the merge buttons their configuration does not use. That prevents the mistake at the source rather than recovering from it, and pairs naturally with the branch-protection guidance in #1561.

Explicit non-goal: do **not** relax `delivery-verification.mjs:517`. Writing a receipt that misdescribes the merge is worse than the current strand. The fix adds a truthful lane; it does not weaken the existing one.
