### ⛔ Parked in Review — blocked by #1787

**The deliverable is on trunk and correct.** `c862f2ba6e6d1a278fa0525f2a79599a5cc9a818` merges `edaa8e402f340af3ca15b5b36ec845b038040d58` (`[#1784] docs(peer-review): record terminal acceptance for #1755 spec`). The reviewer-response-3 document is live in the #1755 review directory. #1755 remains closed and untouched. Nothing about this issue's work is incomplete.

**What is incomplete is the delivery receipt**, and there is no supported command that can produce it from here.

Sequence:

1. `deliver` authorized an exact-head intent with `mergeMethod: "squash"` (repo default), state `pending`, provider `claude`, intent `01M3ACNTK2CVXXBEB777ZR3BG7`.
2. This session had no sanctioned `github.merge-pull-request` integration, so the provider action could not be executed. `rules/deliver.md` forbids a `gh pr merge` fallback, so the intent was correctly left pending and the merge was handed to the human operator.
3. The operator merged PR #1785 from the GitHub UI. GitHub used a **merge commit**, not a squash.
4. `deliver` refuses: `delivery-verification:merge-method` — observed `merge` ≠ intent `squash`.
5. `close` refuses `close-delivery-receipt:missing` and instructs reconciliation via `deliver --reconcile-merge-method <method> --reason "<why>"`.
6. That command refuses with the identical error. Its code path in `deliver.mjs` sits inside `if (liveIntent === null)`, so it is reachable only for external recovery where AITM never authored an intent. Here AITM did. The close refusal advertises a remedy that cannot run from this state.
7. `explain` returns `close` / `indeterminate`, `review-exit-close-gates: unclassified-refusal`, `noAutomaticRemediation: legacy-guard-requires-human-investigation`.

**Why this is not being worked around.** The pending intent comment could be hand-edited or deleted to force a receipt. That fabricates delivery authority and is forbidden. The repo's `mergeMethod` could be flipped to `merge`, but that is a project-wide change to paper over one instance and would trip `intent-divergence` against the pending squash intent anyway. Neither is acceptable.

**Blocker: #1787.** Rather than a merge-method-specific reconciliation branch, #1787 proposes the generic mechanism the operator asked for: make every delivery refusal addressable by catalog id, open the `delivery.*` family to *waivable-with-disclosure* gated on a scoped `workflow-exception` record carrying recorded human authority, and make the receipt name the waived invariant, the authorizing record, the actor and the reason — generalizing the `attributionDisposition: "waived"` receipt v3 pattern this very specification (#1755) introduced. #1787 also notes its overlap with #1783 and proposes that #1783 consume the same mechanism rather than ship a second parallel backdoor.

This issue unparks when #1787 lands and its waiver can be recorded against this exact issue, PR, head SHA and named invariant.
