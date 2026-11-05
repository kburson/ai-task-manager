### Full-Auto Plan-Approval Audit — #1562

This issue was refined, planned, and implemented by the agent under a standing full-auto
directive from @kburson ("drive #1562 ... you are in full-auto mode, I am AFK for 6 hours").
No human reviewed a Plan-stage artifact before Develop began. This comment records that, so the
recorded approval provenance is not read as a human gate action.

**What the human did decide**, before going AFK:

- That squash is this repository's house merge method, and configuration is therefore correct
- That the verifier must not be relaxed — the defect is the absent recovery, not the refusal
- That this defect should be filed, self-assigned, and driven

**What the agent decided unsupervised**, and which a reviewer should weigh:

1. **Restate the intent rather than relax the check.** `delivery-verification.mjs:517` is
   untouched. The lane lets an operator restate the delivery intent to the observed method, and
   the existing equality check then verifies that restatement. The declared method is checked
   against live merge topology, so an operator cannot reconcile to a lie.
2. **A separate record type rather than a schema bump.** `aitm.delivery-intent/v1` and
   `aitm.delivery-receipt/v1` are pinned behind strict exact-key validation; adding a divergence
   field would mean a v2 schema plus migration across every parser. The divergence is its own
   append-only `aitm.delivery-method-reconciliation/v1` record instead.
3. **Narrower observation than the full verifier.** `observeMergeMethod` attributes only an
   unambiguous two-parent merge commit. A single-parent rewrite is ambiguous between squash and
   rebase without the authorized-bytes and single/multi-source proofs, so it refuses rather than
   guessing. **Consequence worth knowing:** reconciling in the squash direction — configuration
   says `merge`, the pull request was squashed — is not supported by this change. The
   merge-direction case is the one observed in the wild (#680). This is a deliberate narrowing,
   not an oversight.

**Acceptance-criterion wording changed at Plan.** AC2 originally read "the receipt written by
that lane records the merge method actually observed and flags it as divergent from the
configured intent". Under the separate-record design the receipt carries the observed method and
the divergence flag sits in the reconciliation record beside it. The criterion's intent — the
divergence is recorded and auditable, never silently normalized — is fully met. The change was
recorded in the deep dive before implementation rather than edited in quietly.

**Evidence.** All six acceptance criteria were stamped by running their declared verifiers at
`06cdcad5`; every stamp is a real passing run, none were force-ticked. 25 tests across five new
test files, including a dedicated regression file asserting the original refusal survives.

<!-- aitm-full-auto-audit: plan-approve -->
