# Scoped Delivery Attribution Exception — Reviewed Spec Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permit one explicitly authorized open-PR delivery with mixed source attribution while preserving immutable evidence and every other delivery gate.

**Architecture:** The complete ordered GitHub PR commit connection is the raw inventory; local Git objects prove each inventory entry exists, is reachable, and has the same first physical subject line. A separate append-only exception ledger binds exact SHA mappings, operation, scope, expiry, and a verified Codex user statement. The open-PR delivery path consumes only the active matching record, rechecks it immediately before provider merge, and records a versioned waived intent and receipt.

**Tech Stack:** Node.js ESM (package engine `>=24`), `node:test`, Git/GitHub CLI and GraphQL, AITM canonical JSON comment records.

**Spec:** `docs/superpowers/specs/2026-09-22-1755-delivery-attribution-exception-design.md` at `0fc890a98ba79497df5b6beb9436fd8389d6f13c`.

## Global Constraints

- Apply the exception only to an open PR's source-attribution failure; leave merged external and historical recovery warning behavior intact.
- Keep `workflow-policy/catalog.mjs`, its rule against waiving `delivery.commit-provenance`, and `workflow-preflight` unchanged.
- Require a verified `codex-session/v1` user message with `codex-session-transcript` origin; request files, comments, agent text, and host-name overrides grant no authority.
- Bind repository, issue, PR, base/head refs, head SHA, full ordered raw inventory digest, exact post-classification SHA mappings, expiry, and unique exception and operation IDs.
- Refuse malformed, ambiguous, stale, edited, revoked, expired, or competing records; append revisions and revocations without erasing history.
- Keep all existing binding, lifecycle, ownership, dependency, clean-tree, exact-head Test/Review, CI, mergeability, protection, provider-action, reachability, and receipt gates.
- No ai-peer-review mutation or exception activation, npm publication, paid provider call, or new issue is part of this plan.

## File Map and Interface Contract

| Responsibility                                                                   | Files                                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Raw inventory, SHA-preserving classification, exact mapping and token evaluation | Create `scripts/task-tracker/lib/delivery-attribution-exception.mjs`; modify `scripts/task-tracker/lib/delivery-attribution.mjs`, `scripts/task-tracker/verbs/deliver.mjs`                 |
| Append-only record schema, chain resolution, proposal digest, bounded rendering  | Create `scripts/task-tracker/lib/delivery-attribution-exception-record.mjs`                                                                                                                |
| `prepare`, `record`, `show`, `revise`, `revoke` command and host authority       | Create `scripts/task-tracker/verbs/delivery-attribution-exception.mjs`; modify `task-tracker.mjs`, `command-surface/routing.mjs`, `command-surface/catalog.mjs`, and `verbs/help-data.mjs` |
| Open-PR preflight, late revalidation, retry, and delivery verification           | Modify `scripts/task-tracker/lib/delivery-preflight.mjs`, `scripts/task-tracker/verbs/deliver.mjs`, `scripts/task-tracker/lib/delivery-verification.mjs`                                   |
| v2 intent, v3 receipt, exact-key legacy compatibility                            | Modify `scripts/task-tracker/lib/delivery-records.mjs`; use one exported authorized-intent projection in `deliver.mjs`                                                                     |
| Operator workflow, package contents, tests                                       | Modify `skill/shared/rules/deliver.md`, `docs/guides/workflow.md`, `package.json` only if the packed file list needs it; create focused tests under existing unit/integration test roots   |

The steps below name the intended module boundaries. Check their exact exports and call sites against the current files when implementing; keep a single definition for each canonical digest, schema projection, and mapping evaluator.

---

### Task 1: Canonical raw inventory and SHA-preserving classification

**Files:** Create `scripts/task-tracker/lib/delivery-attribution-exception.mjs`; modify `scripts/task-tracker/verbs/deliver.mjs`; create `scripts/tests/unit/task-tracker/lib/delivery-attribution-exception.test.mjs`; extend `scripts/tests/unit/task-tracker/verbs/deliver-source-inventory.test.mjs`.

**Interfaces:** `canonicalSourceInventory(sourceCommits, expectedHeadSha)` returns `{ commits, sourceDigest }`, where each commit has exactly `{ oid, messageHeadline }`; digest covers ordered canonical `(oid, full subject)` pairs, including verified merges. `classifySourceCommitSubjects` additionally returns `attributableCommits` and `verifiedMergeShas` while preserving its ordinary subject outputs. `verifyLocalSourceInventory({ commits, headSha, inspectLocalCommit })` proves the exact GitHub inventory against local objects. Add a dedicated local commit-object reader for this exceptional path; do not reuse or alter `inspectCommitObject`, whose `commitTitle` also feeds merge classification and verification. Read each object by oid, extract `message.split(/\r?\n/, 1)[0]` without trim/fold/filter, and prove reachability with `git merge-base --is-ancestor <oid> HEAD`; do not derive a range inventory.

- [ ] **Red:** Create the new test file with `// @story #1755` on its first line. Add fixtures with two identical subjects at different SHAs, oldest-to-head reorder, an empty first line, a CRLF first-line boundary, an unreachable object, a missing object, and a raw subject mismatch. Assert the digest changes on reorder, the CRLF subject matches GitHub's `/\r?\n/` split, and the local verifier refuses each invalid object. Add a verified unattributed merge and a `#`-bearing merge; only the former may enter `verifiedMergeShas`.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-attribution-exception.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-source-inventory.test.mjs`; expect failures for the missing SHA-bearing APIs.
- [ ] **Green:** Implement the canonical inventory and local verifier; retain `isStructurallyInspectableSourceCommits`'s exact `{ oid, messageHeadline }` shape. Extend classification before reducing entries to subjects. Keep the existing `openSourceCommitSubjects` and merged paths' observable behavior for ordinary deliveries.
- [ ] Re-run the two tests; inspect that a stale `origin/trunk` does not affect the exceptional verifier and that inspection failure leaves a commit attributable.
- [ ] Run `node scripts/task-tracker/verify-develop.mjs`, then commit the tested boundary with a `[#1755]` subject.

### Task 2: Exact mapping evaluator without relaxing ordinary attribution

**Files:** Modify `scripts/task-tracker/lib/delivery-attribution-exception.mjs` and `scripts/task-tracker/lib/delivery-attribution.mjs`; extend `scripts/tests/unit/task-tracker/lib/delivery-attribution-exception.test.mjs` and `scripts/tests/unit/task-tracker/lib/delivery-attribution.test.mjs`.

**Interfaces:** `evaluateDeliveryAttributionException({ issueNumber, prNumber, expectedHeadSha, commits, attributableCommits, verifiedMergeShas, mappings })` returns `{ attributionDisposition: 'waived', attributionTokens, commitTitle, commitMessage, commitTitleSha256, commitMessageSha256 }`. A mapping is exactly `{ oid, messageHeadline, issueNumber }` with positive integer issue. The evaluator uses the canonical parser for accepted subjects and maps exactly the parser-rejected attributable SHAs. Export `buildCommitTextFromTokens({ issueNumber, prNumber, expectedHeadSha }, attributionTokens)` from `delivery-attribution.mjs`; retain its `MAX_COMMIT_TITLE_BYTES` and `MAX_DELIVERY_COMMIT_MESSAGE_BYTES` checks, and leave `buildDeliveryCommitText`'s strict input contract unchanged.

- [ ] **Red:** Assert ordinary `buildDeliveryCommitText` still refuses a mixed list. For the exceptional evaluator, assert one mapping per rejected SHA, no mapping for accepted subjects or verified merges, distinct treatment of duplicate subjects on different SHAs, sorted tokens including `#1755`, and deterministic title/message/hash bytes.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-attribution-exception.test.mjs scripts/tests/unit/task-tracker/lib/delivery-attribution.test.mjs`; expect mapping cases to fail.
- [ ] **Green:** Use SHA-indexed set equality and the canonical subject parser. Reject duplicate SHA or mappings; missing/extra mappings; `#0`, wildcard, or issue that is not an integer; a malformed token; a `#`-bearing merge that lacks its required mapping; and a missing top-level token. Keep a syntactically valid but semantically unexpected `[#N]` token as parsed.
- [ ] Re-run both tests and check byte-identical results for repeated evaluation of the same candidate.
- [ ] Run `node scripts/task-tracker/verify-develop.mjs`, then commit the tested evaluator with a `[#1755]` subject.

### Task 3: Immutable record schema, proposal digest, and append-only chain

**Files:** Create `scripts/task-tracker/lib/delivery-attribution-exception-record.mjs` and `scripts/tests/unit/task-tracker/lib/delivery-attribution-exception-record.test.mjs`.

**Interfaces:** `buildDeliveryAttributionProposal({ exceptionId, operationId, repository, issueNumber, prNumber, baseRef, headRef, headSha, sourceDigest, mappings, attributionTokens, expiresAt })` returns canonical proposal bytes and digest. `renderDeliveryAttributionExceptionComment(record)` and `parseDeliveryAttributionExceptionComment(comment, context)` use a new exact-key versioned envelope. `resolveActiveDeliveryAttributionException(comments, scope, now)` accepts one unedited live head and refuses malformed or competing chains. A revision names its predecessor and requires a fresh exception/revision ID and authority; revocation appends a terminal link. The full inventory is represented only by its digest, while mappings retain `(oid, subject, issue)`.

- [ ] **Red:** Create the new test file with `// @story #1755` on its first line. Add a sample 111-entry inventory digest and a record containing only the 21 post-classification mappings. Verify exact repository/issue/PR/refs/head/operation/expiry/source/proposal checks; reject duplicate IDs, competing heads, edited canonical bytes, bad predecessor links, stale/expired/revoked chains, and unsupported schema.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-attribution-exception-record.test.mjs`; expect the missing-module failure.
- [ ] **Green:** Implement canonical JSON and digest using the existing `github-records` helpers; preserve all old comments. Bound the candidate before an authorization statement: calculate the UTF-8 byte upper bound of the _escaped rendered comment_ with maximum permitted source reference, statement, actor, and envelope overhead, then refuse over 60 KiB or a smaller package bound. Recheck exact rendered bytes before append.
- [ ] Re-run the test, including UTF-8 subjects near the limit and an ambiguous append/readback case that cannot be treated as success.
- [ ] Run `node scripts/task-tracker/verify-develop.mjs`, then commit the tested record boundary with a `[#1755]` subject.

### Task 4: Two-pass CLI and Codex-only user authority

**Files:** Create `scripts/task-tracker/verbs/delivery-attribution-exception.mjs` and `scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception.test.mjs`; modify `scripts/task-tracker/task-tracker.mjs`, `scripts/task-tracker/lib/command-surface/routing.mjs`, `scripts/task-tracker/lib/command-surface/catalog.mjs` (command record, `VERB_CONTRACTS`, `VERB_RELATED_COMMANDS`, `VERB_POSITIONAL_ARGUMENTS`), and `scripts/task-tracker/verbs/help-data.mjs` (`VERB_REFERENCE`) following `workflow-exception`.

**Interfaces:** `prepare #N` is read-only and emits raw digest, post-classification mapping candidates, and a template with generated exception and operation IDs. `prepare #N --input-file <path>` validates a filled candidate and prints its canonical proposal digest and exact user statement. `record #N --input-file <path>` verifies `aitm.authorization-source/v1` through `createCodexSessionSourceLoader` and `resolveWorkflowExceptionAuthority`, recomputes live scope/proposal, and appends with exact readback. `show`, `revise`, and `revoke` expose/read or append chain state; `show` can run on other hosts.

- [ ] **Red:** Create the new test file with `// @story #1755` on its first line. Test both prepare passes and assert no comment write. The first template has no authorizing digest; the filled pass rejects absent/changed IDs, an issue number that is not positive, invalid expiry, bad mappings, oversized rendered body, and changed PR inventory.
- [ ] Add authority tests: unsupported host is refused by `prepare` and `record` using the resolved provider adapter/transcript locator; a host-name override is insufficient. A valid Codex user message succeeds only if its loader-derived filtered statement hash equals `source.statementHash`, its embedded proposal digest equals the fresh digest, and its remaining text exactly equals the printed statement. An injection-flagged block alone, agent role, ordinary issue comment, and mismatched statement all refuse.
- [ ] Run `node --test scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception.test.mjs scripts/tests/unit/task-tracker/core/command-manifest.test.mjs scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs`; expect the new command/authority cases to fail and both command-surface gates to identify missing registration.
- [ ] **Green:** Wire the commands, explicit help, full paginated GitHub PR source inventory, Codex-only guard, append/readback reconciliation, and separate `revise`/`revoke` records. Re-fetch issue and PR before the write; never trust the request file as authority.
- [ ] Re-run all three Task 4 test files; include exact idempotent record retry and transport ambiguity. Run `node scripts/task-tracker/verify-develop.mjs`, then commit the tested CLI with a `[#1755]` subject.

### Task 5: Open-PR preflight, late revalidation, and operation-bound intent

**Files:** Modify `scripts/task-tracker/lib/delivery-preflight.mjs`, `scripts/task-tracker/verbs/deliver.mjs`, `scripts/task-tracker/lib/delivery-records.mjs`; extend `scripts/tests/unit/task-tracker/verbs/deliver-source-inventory.test.mjs` and `scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs`; create `scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception-preflight.test.mjs` with `// @story #1755` on its first line.

**Interfaces:** Open-PR `validateDeliveryPreflight` accepts an optional SHA-bearing classified inventory and active record. Its ordinary `string[]` path remains strict. Only an attribution failure can invoke the scoped evaluator. Keep `attributionDisposition` and exception references alongside `commitText`, never inside it: the existing `{ metadataWarnings = [], ...commitText }` spread would otherwise pass extra keys to `buildDeliveryIntent`'s exact-key validator. A waived `aitm.delivery-intent/v2` adds `attributionDisposition`, exception record ID, operation ID, raw digest, proposal digest, exact mappings, and resulting tokens. Export one `authorizedIntentBytes(intent)` projection from `delivery-records.mjs` and import it in `deliver.mjs`, replacing the two local key lists; compare schema and all waived fields along with existing commit text fields.

- [ ] **Red:** Test default mixed-history refusal; a valid open-PR waiver; malformed/conflicting record refusal; wrong repository/issue/PR/ref/head/digest/mapping/expiry; and preserved clean-tree, binding, ownership, lifecycle, Test/Review, CI, mergeability, and provider checks. Assert merged/historical recovery never use the exception.
- [ ] Test pending intent retries: unchanged v2 intent and same operation can resume; changed exception, inventory, operation, or a new intent cannot reuse it; v1 and v2 projections never compare equal.
- [ ] Run `node --test scripts/tests/unit/task-tracker/verbs/deliver-source-inventory.test.mjs scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception-preflight.test.mjs`; expect the v2/preflight cases to fail.
- [ ] **Green:** Thread the full GitHub inventory and SHA-preserving classification to open-PR preflight; use per-oid local verification only for the exceptional path. Immediately before provider merge, re-read PR metadata and full source connection, reverify local objects and classification, and recompute scope, inventory, and proposal digests. Any drift aborts before provider action.
- [ ] Re-run those three tests with a changed head, reordered SHA, changed subject, stale local object, and revoked record inserted between intent and provider action. Run `node scripts/task-tracker/verify-develop.mjs`, then commit the tested integration with a `[#1755]` subject.

### Task 6: Waived receipt and merge verification

**Files:** Modify `scripts/task-tracker/lib/delivery-records.mjs`, `scripts/task-tracker/lib/delivery-verification.mjs`, `scripts/task-tracker/verbs/deliver.mjs`; extend `scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs` and `scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs`; create `scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception-receipt.test.mjs` with `// @story #1755` on its first line.

**Interfaces:** `aitm.delivery-receipt/v3` explicitly carries `attributionDisposition: 'waived'` and immutable exception/intent references. `delivery-verification.mjs` includes those fields in its fixed `receiptInput` object and verifies live source inventory, recorded exception, authorized intent, and actual merge attribution. Ordinary v1 intent and v1/v2 receipt schemas remain exact-key readable; ordinary selection still emits v1 intent and v1 or warning-bearing v2 receipt.

- [ ] **Red:** Assert v1/v2/v3 parsing and exact-key refusal for extra/missing fields. Prove receipt schema selection is explicit, independent of whether `metadataWarnings` exists. A waived v3 may include only `missing-merge-attribution-trailer`, never `missing-source-attribution`; unknown warning codes refuse.
- [ ] Add a flow test where the merge commit lacks its attribution trailer: the v3 receipt still labels the waiver and permitted warning, cites the verified source-message reference, actor, mappings, and intent via the immutable record, and refuses if the actual merge attribution contradicts the authorized tokens.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception-receipt.test.mjs`; expect v3 verification failures.
- [ ] **Green:** Add v2/v3 exact-key schemas and validators, update fixed `receiptInput`, render visible waived provenance, and keep the existing receipt readback and trunk-reachability checks. Use the same authorized-intent projection as Task 5.
- [ ] Re-run those three tests and `node --test scripts/tests/integration/task-tracker/verbs/deliver-close.integration.test.mjs`. Run `node scripts/task-tracker/verify-develop.mjs`, then commit the tested receipt boundary with a `[#1755]` subject.

### Task 7: Operator guide, package smoke, and release gates

**Files:** Modify `skill/shared/rules/deliver.md`, `docs/guides/workflow.md`, `scripts/task-tracker/verbs/help-data.mjs`, and `package.json` only if packed paths need expansion; extend `scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception.test.mjs`; create `scripts/tests/integration/task-tracker/lib/package-delivery-attribution-exception-smoke.test.mjs` with `// @story #1755` on its first line.

**Interfaces:** Documentation states the two-pass `prepare` flow, explicit exact Codex user statement, `record`/`show`/`revise`/`revoke`, delivery retry, receipt meaning, and that `workflow-preflight` does not report this separate exception. Preparation grants nothing. Packaged CLI/runtime and guide match the source checkout.

- [ ] **Red:** Add a package smoke assertion that the packed file list contains the new verb, both libraries, and operator guide; add help assertions for every command and the unsupported-host diagnostic. Run the focused test and expect the missing-guide/help failure.
- [ ] **Green:** Update the operator text and help examples; keep the Task 4 command catalog, ordinary workflow, and generic policy descriptions accurate. Run the package smoke and doc parity tests to green.
- [ ] Run `npm run format:check`, `npm run lint`, `npm test`, `npm run test:integration`, and `npm run test:slow`; fix only evidenced failures and rerun each affected gate. `npm test` and `npm run quality` omit the integration lane. Run package content validation and an install smoke from the local tarball. Record exact commands and results.
- [ ] Audit existing branch commit subjects before delivery. The earlier spec revisions lack `[#1755]`; preserve their SHAs and obtain a separate explicit authorization if this branch itself needs the scoped exception. No authorization for ai-peer-review #39 is implied.
- [ ] Run `node scripts/task-tracker/verify-develop.mjs`, then commit the tested docs and package boundary with a `[#1755]` subject.
- [ ] Before any eventual merge, push the implementation branch and verify hosted CI against that exact pushed head. Use the governed delivery and human approval flow; do not activate an exception for ai-peer-review #39 during this issue's implementation.

## Review Trace

This plan is derived from the reviewed spec revision pinned above. Keep `docs/superpowers/plans/2026-09-22-1755-delivery-attribution-exception.md` unchanged as the unreviewed-spec comparison baseline. No task in this plan authorizes execution or changes the issue's existing Plan approval.
