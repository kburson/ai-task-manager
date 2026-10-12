Deliver Task 5: Open-PR preflight, late revalidation, and operation-bound intent from `docs/superpowers/plans/2026-09-22-1755-delivery-attribution-exception-reviewed-spec.md`.

Bounded source section (Task 5: Open-PR preflight, late revalidation, and operation-bound intent):

#### Implementation

Run: `node --test scripts/tests/unit/task-tracker/verbs/deliver-source-inventory.test.mjs scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception-preflight.test.mjs`

**Files:** Modify `scripts/task-tracker/lib/delivery-preflight.mjs`, `scripts/task-tracker/verbs/deliver.mjs`, `scripts/task-tracker/lib/delivery-records.mjs`; extend `scripts/tests/unit/task-tracker/verbs/deliver-source-inventory.test.mjs` and `scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs`; create `scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception-preflight.test.mjs` with `// @story #1755` on its first line.

**Interfaces:** Open-PR `validateDeliveryPreflight` accepts an optional SHA-bearing classified inventory and active record. Its ordinary `string[]` path remains strict. Only an attribution failure can invoke the scoped evaluator. Keep `attributionDisposition` and exception references alongside `commitText`, never inside it: the existing `{ metadataWarnings = [], ...commitText }` spread would otherwise pass extra keys to `buildDeliveryIntent`'s exact-key validator. A waived `aitm.delivery-intent/v2` adds `attributionDisposition`, exception record ID, operation ID, raw digest, proposal digest, exact mappings, and resulting tokens. Export one `authorizedIntentBytes(intent)` projection from `delivery-records.mjs` and import it in `deliver.mjs`, replacing the two local key lists; compare schema and all waived fields along with existing commit text fields.

- [ ] **Red:** Test default mixed-history refusal; a valid open-PR waiver; malformed/conflicting record refusal; wrong repository/issue/PR/ref/head/digest/mapping/expiry; and preserved clean-tree, binding, ownership, lifecycle, Test/Review, CI, mergeability, and provider checks. Assert merged/historical recovery never use the exception.
- [ ] Test pending intent retries: unchanged v2 intent and same operation can resume; changed exception, inventory, operation, or a new intent cannot reuse it; v1 and v2 projections never compare equal.
- [ ] Run `node --test scripts/tests/unit/task-tracker/verbs/deliver-source-inventory.test.mjs scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception-preflight.test.mjs`; expect the v2/preflight cases to fail.
- [ ] **Green:** Thread the full GitHub inventory and SHA-preserving classification to open-PR preflight; use per-oid local verification only for the exceptional path. Immediately before provider merge, re-read PR metadata and full source connection, reverify local objects and classification, and recompute scope, inventory, and proposal digests. Any drift aborts before provider action.
- [ ] Re-run those three tests with a changed head, reordered SHA, changed subject, stale local object, and revoked record inserted between intent and provider action. Run `node scripts/task-tracker/verify-develop.mjs`, then commit the tested integration with a `[#1755]` subject.
