**Kind:** docs-only

**Provenance:** Gap found during the Review of #1562 while assessing collision risk against epic #1531. The reconciliation lane shipped working, tested, and named in the `close` refusal, but its flags were never registered in `help-data.mjs`.

**Relationships:**

- Follows: #1562 (added the lane; must merge first)
- Collides with: #1546, which also modifies `scripts/task-tracker/verbs/help-data.mjs` — sequence this after whichever of the two lands first
- Ultimately serves: #680, which #1562 unblocks

**Blocking:** no. The lane is already discoverable from the delivery-gate refusal, which is where an operator actually encounters the problem. This closes the second, quieter discovery path.

**Why it was deferred rather than folded into #1562:** adding it there would have put that branch into `help-data.mjs`, a file #1546 also edits, creating a second merge collision on top of the unavoidable `ENTRY_CEILING` one — for no urgency gain.

**Size guess:** XS
