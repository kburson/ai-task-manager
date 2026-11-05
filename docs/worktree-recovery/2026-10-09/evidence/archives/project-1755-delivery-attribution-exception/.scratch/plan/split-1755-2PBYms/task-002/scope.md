Deliver Task 2: Exact mapping evaluator without relaxing ordinary attribution from `docs/superpowers/plans/2026-09-22-1755-delivery-attribution-exception-reviewed-spec.md`.

Bounded source section (Task 2: Exact mapping evaluator without relaxing ordinary attribution):

#### Implementation

Run: `node --test scripts/tests/unit/task-tracker/lib/delivery-attribution-exception.test.mjs scripts/tests/unit/task-tracker/lib/delivery-attribution.test.mjs`

**Files:** Modify `scripts/task-tracker/lib/delivery-attribution-exception.mjs` and `scripts/task-tracker/lib/delivery-attribution.mjs`; extend `scripts/tests/unit/task-tracker/lib/delivery-attribution-exception.test.mjs` and `scripts/tests/unit/task-tracker/lib/delivery-attribution.test.mjs`.

**Interfaces:** `evaluateDeliveryAttributionException({ issueNumber, prNumber, expectedHeadSha, commits, attributableCommits, verifiedMergeShas, mappings })` returns `{ attributionDisposition: 'waived', attributionTokens, commitTitle, commitMessage, commitTitleSha256, commitMessageSha256 }`. A mapping is exactly `{ oid, messageHeadline, issueNumber }` with positive integer issue. The evaluator uses the canonical parser for accepted subjects and maps exactly the parser-rejected attributable SHAs. Export `buildCommitTextFromTokens({ issueNumber, prNumber, expectedHeadSha }, attributionTokens)` from `delivery-attribution.mjs`; retain its `MAX_COMMIT_TITLE_BYTES` and `MAX_DELIVERY_COMMIT_MESSAGE_BYTES` checks, and leave `buildDeliveryCommitText`'s strict input contract unchanged.

- [ ] **Red:** Assert ordinary `buildDeliveryCommitText` still refuses a mixed list. For the exceptional evaluator, assert one mapping per rejected SHA, no mapping for accepted subjects or verified merges, distinct treatment of duplicate subjects on different SHAs, sorted tokens including `#1755`, and deterministic title/message/hash bytes.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-attribution-exception.test.mjs scripts/tests/unit/task-tracker/lib/delivery-attribution.test.mjs`; expect mapping cases to fail.
- [ ] **Green:** Use SHA-indexed set equality and the canonical subject parser. Reject duplicate SHA or mappings; missing/extra mappings; `#0`, wildcard, or issue that is not an integer; a malformed token; a `#`-bearing merge that lacks its required mapping; and a missing top-level token. Keep a syntactically valid but semantically unexpected `[#N]` token as parsed.
- [ ] Re-run both tests and check byte-identical results for repeated evaluation of the same candidate.
- [ ] Run `node scripts/task-tracker/verify-develop.mjs`, then commit the tested evaluator with a `[#1755]` subject.
