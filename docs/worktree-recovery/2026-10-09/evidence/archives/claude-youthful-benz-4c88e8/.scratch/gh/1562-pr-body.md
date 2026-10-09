Refs #1562

Adds a merge-method reconciliation lane so a pull request merged with a method the project's configuration does not declare can reach a terminal close on truthful evidence.

## The problem

A delivery intent's merge method could only ever come from configuration (`fullAutoMerge.mergeMethod`). When a human merges from the GitHub UI with a different button, `delivery-verification.mjs:517` refuses the mismatch, `close` demands a receipt that can never exist, and no flag reaches the condition — `--force` does not reach `refuseDeliveryGate`, the no-commit lane requires zero PRs, and the Incorporated lane is hard-scoped to #1381.

Observed live on #680, whose PR #1556 was merged as a merge commit against a squash-only config. That issue is still open, blocked on this.

## The approach

**The verifier is unchanged.** What was wrong is that only configuration could state the intent. The lane lets an operator restate it to the *observed* method, and the existing equality check then verifies that restatement.

```
/task deliver <N> --reconcile-merge-method <merge|squash|rebase> --reason "<why>"
```

It cannot launder a false receipt:

- the declared method is checked against live merge topology — declaring `squash` for a two-parent merge still refuses
- a no-op reconciliation matching configuration refuses
- an unattributable single-parent rewrite refuses rather than being guessed as squash
- a placeholder-rejected reason is mandatory and recorded on the ledger

The divergence is an append-only `aitm.delivery-method-reconciliation/v1` record rather than a field on the intent or receipt, whose v1 schemas are pinned behind strict exact-key validation.

`close`'s refusal now names the lane, so `--force` stops being the only discoverable escape — and the test asserts the message never advertises `--force`, since that flag does not reach this gate.

## Known limitation

Reconciling in the squash direction (config says `merge`, the PR was squashed) is **not** supported. A single-parent rewrite is ambiguous between squash and rebase without the authorized-bytes and single/multi-source proofs the full verifier applies, and the lane refuses rather than guess a method it is about to have recorded as fact. The merge-direction case is the one seen in the wild.

## Verification

25 tests across five files, including `delivery-method-reconciliation-regression.test.mjs`, which exists specifically to prove the original refusal survives. All six acceptance criteria stamped by running their declared verifiers — no force-ticks.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
