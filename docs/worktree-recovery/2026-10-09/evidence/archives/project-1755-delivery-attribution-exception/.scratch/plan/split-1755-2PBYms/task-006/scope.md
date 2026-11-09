Deliver Task 6: Waived receipt and merge verification from `docs/superpowers/plans/2026-09-22-1755-delivery-attribution-exception-reviewed-spec.md`.

Bounded source section (Task 6: Waived receipt and merge verification):

#### Implementation

Run: `node --test scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception-receipt.test.mjs`

**Files:** Modify `scripts/task-tracker/lib/delivery-records.mjs`, `scripts/task-tracker/lib/delivery-verification.mjs`, `scripts/task-tracker/verbs/deliver.mjs`; extend `scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs` and `scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs`; create `scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception-receipt.test.mjs` with `// @story #1755` on its first line.

**Interfaces:** `aitm.delivery-receipt/v3` explicitly carries `attributionDisposition: 'waived'` and immutable exception/intent references. `delivery-verification.mjs` includes those fields in its fixed `receiptInput` object and verifies live source inventory, recorded exception, authorized intent, and actual merge attribution. Ordinary v1 intent and v1/v2 receipt schemas remain exact-key readable; ordinary selection still emits v1 intent and v1 or warning-bearing v2 receipt.

- [ ] **Red:** Assert v1/v2/v3 parsing and exact-key refusal for extra/missing fields. Prove receipt schema selection is explicit, independent of whether `metadataWarnings` exists. A waived v3 may include only `missing-merge-attribution-trailer`, never `missing-source-attribution`; unknown warning codes refuse.
- [ ] Add a flow test where the merge commit lacks its attribution trailer: the v3 receipt still labels the waiver and permitted warning, cites the verified source-message reference, actor, mappings, and intent via the immutable record, and refuses if the actual merge attribution contradicts the authorized tokens.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception-receipt.test.mjs`; expect v3 verification failures.
- [ ] **Green:** Add v2/v3 exact-key schemas and validators, update fixed `receiptInput`, render visible waived provenance, and keep the existing receipt readback and trunk-reachability checks. Use the same authorized-intent projection as Task 5.
- [ ] Re-run those three tests and `node --test scripts/tests/integration/task-tracker/verbs/deliver-close.integration.test.mjs`. Run `node scripts/task-tracker/verify-develop.mjs`, then commit the tested receipt boundary with a `[#1755]` subject.
