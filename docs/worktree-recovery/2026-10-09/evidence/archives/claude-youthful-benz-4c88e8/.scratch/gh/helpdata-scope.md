#1562 added the merge-method reconciliation lane to the `deliver` verb:

```
/task deliver <N> --reconcile-merge-method <merge|squash|rebase> --reason "<why>"
```

Both flags work, are covered by tests, and are named in the `close` delivery-gate refusal. Neither is registered in `scripts/task-tracker/verbs/help-data.mjs`, so `/task deliver --help` does not mention the lane at all.

That is an incomplete feature rather than a cosmetic gap. The whole point of the #1562 work was discoverability — the defect it fixed was an operator being stranded with no visible route forward. Leaving the flags out of the help output reproduces a smaller version of the same problem: someone who reaches for `--help` before hitting a refusal still cannot find the lane.

**In scope**

- Register `--reconcile-merge-method <merge|squash|rebase>` and `--reason <text>` in the `deliver` entry of `help-data.mjs`, with descriptions matching the argument contract.
- Record the lane's preconditions in the verb's documented effects: it applies only on the already-merged external recovery path, the declared method must agree with the observed merge topology, and a substantive reason is mandatory.
- State the known limitation, so `--help` does not imply support that does not exist: reconciling in the squash direction is unsupported, because a single-parent rewrite is ambiguous between squash and rebase without the proofs the full verifier applies.

**Out of scope**

- Any change to the lane's behaviour, its verification, or the delivery verifier. This is documentation of what already ships.

**Why deferred from #1562**

`help-data.mjs` is also modified by #1546 (`Migrate AITM Through the Published Package Boundary`) under epic #1531. Adding the entry inside #1562 would have created a second merge collision with that work — on top of the unavoidable `ENTRY_CEILING` one — for no urgency benefit, since the lane is already discoverable from the refusal message an operator actually encounters. Sequencing this separately keeps #1562's diff clear of #1546's file set.
