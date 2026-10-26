Deliver Task 3: Immutable record schema, proposal digest, and append-only chain from `docs/superpowers/plans/2026-09-22-1755-delivery-attribution-exception-reviewed-spec.md`.

Bounded source section (Task 3: Immutable record schema, proposal digest, and append-only chain):

#### Implementation

Run: `node --test scripts/tests/unit/task-tracker/lib/delivery-attribution-exception-record.test.mjs`

**Files:** Create `scripts/task-tracker/lib/delivery-attribution-exception-record.mjs` and `scripts/tests/unit/task-tracker/lib/delivery-attribution-exception-record.test.mjs`.

**Interfaces:** `buildDeliveryAttributionProposal({ exceptionId, operationId, repository, issueNumber, prNumber, baseRef, headRef, headSha, sourceDigest, mappings, attributionTokens, expiresAt })` returns canonical proposal bytes and digest. `renderDeliveryAttributionExceptionComment(record)` and `parseDeliveryAttributionExceptionComment(comment, context)` use a new exact-key versioned envelope. `resolveActiveDeliveryAttributionException(comments, scope, now)` accepts one unedited live head and refuses malformed or competing chains. A revision names its predecessor and requires a fresh exception/revision ID and authority; revocation appends a terminal link. The full inventory is represented only by its digest, while mappings retain `(oid, subject, issue)`.

- [ ] **Red:** Create the new test file with `// @story #1755` on its first line. Add a sample 111-entry inventory digest and a record containing only the 21 post-classification mappings. Verify exact repository/issue/PR/refs/head/operation/expiry/source/proposal checks; reject duplicate IDs, competing heads, edited canonical bytes, bad predecessor links, stale/expired/revoked chains, and unsupported schema.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-attribution-exception-record.test.mjs`; expect the missing-module failure.
- [ ] **Green:** Implement canonical JSON and digest using the existing `github-records` helpers; preserve all old comments. Bound the candidate before an authorization statement: calculate the UTF-8 byte upper bound of the _escaped rendered comment_ with maximum permitted source reference, statement, actor, and envelope overhead, then refuse over 60 KiB or a smaller package bound. Recheck exact rendered bytes before append.
- [ ] Re-run the test, including UTF-8 subjects near the limit and an ambiguous append/readback case that cannot be treated as success.
- [ ] Run `node scripts/task-tracker/verify-develop.mjs`, then commit the tested record boundary with a `[#1755]` subject.
