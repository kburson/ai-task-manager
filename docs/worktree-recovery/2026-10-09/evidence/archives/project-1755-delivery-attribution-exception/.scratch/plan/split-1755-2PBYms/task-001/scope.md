Deliver Task 1: Canonical raw inventory and SHA-preserving classification from `docs/superpowers/plans/2026-09-22-1755-delivery-attribution-exception-reviewed-spec.md`.

Bounded source section (Task 1: Canonical raw inventory and SHA-preserving classification):

#### Implementation

Run: `node --test scripts/tests/unit/task-tracker/lib/delivery-attribution-exception.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-source-inventory.test.mjs`

**Files:** Create `scripts/task-tracker/lib/delivery-attribution-exception.mjs`; modify `scripts/task-tracker/verbs/deliver.mjs`; create `scripts/tests/unit/task-tracker/lib/delivery-attribution-exception.test.mjs`; extend `scripts/tests/unit/task-tracker/verbs/deliver-source-inventory.test.mjs`.

**Interfaces:** `canonicalSourceInventory(sourceCommits, expectedHeadSha)` returns `{ commits, sourceDigest }`, where each commit has exactly `{ oid, messageHeadline }`; digest covers ordered canonical `(oid, full subject)` pairs, including verified merges. `classifySourceCommitSubjects` additionally returns `attributableCommits` and `verifiedMergeShas` while preserving its ordinary subject outputs. `verifyLocalSourceInventory({ commits, headSha, inspectLocalCommit })` proves the exact GitHub inventory against local objects. Add a dedicated local commit-object reader for this exceptional path; do not reuse or alter `inspectCommitObject`, whose `commitTitle` also feeds merge classification and verification. Read each object by oid, extract `message.split(/\r?\n/, 1)[0]` without trim/fold/filter, and prove reachability with `git merge-base --is-ancestor <oid> HEAD`; do not derive a range inventory.

- [ ] **Red:** Create the new test file with `// @story #1755` on its first line. Add fixtures with two identical subjects at different SHAs, oldest-to-head reorder, an empty first line, a CRLF first-line boundary, an unreachable object, a missing object, and a raw subject mismatch. Assert the digest changes on reorder, the CRLF subject matches GitHub's `/\r?\n/` split, and the local verifier refuses each invalid object. Add a verified unattributed merge and a `#`-bearing merge; only the former may enter `verifiedMergeShas`.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-attribution-exception.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-source-inventory.test.mjs`; expect failures for the missing SHA-bearing APIs.
- [ ] **Green:** Implement the canonical inventory and local verifier; retain `isStructurallyInspectableSourceCommits`'s exact `{ oid, messageHeadline }` shape. Extend classification before reducing entries to subjects. Keep the existing `openSourceCommitSubjects` and merged paths' observable behavior for ordinary deliveries.
- [ ] Re-run the two tests; inspect that a stale `origin/trunk` does not affect the exceptional verifier and that inspection failure leaves a commit attributable.
- [ ] Run `node scripts/task-tracker/verify-develop.mjs`, then commit the tested boundary with a `[#1755]` subject.
