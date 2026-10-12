### Correction — this defect does block #680

This issue's Story Origin was filed with the line **"Blocking: no"**, on the stated reasoning that
"#680 closed via the documented `--force` bypass with its rationale recorded, so nothing is stalled
behind this."

**That was wrong on both halves.** `close --force` does not reach this gate:
`refuseDeliveryGate` (`verbs/close.mjs:1753`) catches the delivery-receipt error and refuses
unconditionally, never consulting the force flag. The `decideGateEvalFailure({ error, force })`
path that does honor `--force` governs a different gate — the close-gate checklist evaluation, not
delivery authorization. The forced close was attempted, refused, and wrote no state. #680 did not
close, and is stalled behind this defect.

The remaining escapes were then checked directly rather than assumed, and none applies:

- The no-commit spike lane requires zero pull requests (`lib/close-delivery-receipt.mjs:61`); #680 delivered through PR #1556
- The Incorporated lane is hard-scoped to convergence issue #1381 (`verbs/incident-ledger.mjs:28`) and requires its bespoke 19-row observation ledger

**Corrected status:** blocking. #680 now carries the `BLOCKED` label, the board `Blocked By` field,
and an `aitm-blocked-by refs="#1562"` marker. It closes once this defect ships its reconciliation
lane.

The Story Origin section is left as originally filed; this comment is the correction of record
rather than a silent rewrite.

<!-- aitm-blocking-correction -->
