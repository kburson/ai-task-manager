# #2145 bounded native recovery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Finish existing #2145 with preservation-safe native integration and a qualified operator runtime that can consume #2169's existing approval without changing its source.

**Architecture:** Reuse native admission. Use additive, verified integration with create-only original-head retention. Add a read-only canonical host-message adapter and qualify it as a separate installed runtime; keep subject Git identity independent.

**Tech Stack:** Existing Node.js ESM, node:test, Git, GitHub CLI and Codex app-server JSON-RPC. No new dependency.

**Spec:** docs/superpowers/specs/2026-11-08-2145-bounded-completion-design.md

## Story Intent

- **Beneficiary:** native-session operator
- **Capability:** trial and integrate separately retained source through supported entrypoints
- **Need:** the existing bridge route can lose branch authority and original evidence
- **Value or failure prevented:** complete the cache rollout with original commits, approvals and pending work still attributable and recoverable

## Global Constraints

- One existing Medium story, six remaining engaged hours from 2026-11-08T02:59:00Z; no new issues. Check at one, three and five hours; independently review any replan before exceeding six hours.
- Preserve historical Unknown timing, original f7be HEAD, #2071's dirty checkout, refs, receipts and reviews. Use native identity, binding and lifecycle only.
- Bring delivered trunk 3b71ed83e9cb9348cf58032c500231e53f0d9720 into the existing named branch at Develop, using normal fast-forward if possible; otherwise additive merge. Renew source bindings after the final baseline is observed.
- No live rebase, forced push, destructive reset, copied actor state or handwritten evidence. Physical disposable repositories own integration tests.
- #2169 subject stays 7091f5db2f3b37468b179a7087c95d24da8ae62b. Existing exact waiver and all independent delivery gates remain in force.
- Long evidence belongs in committed Markdown with immutable issue links. A bridge refusal does not mean #2071 activation succeeded.

## Pre-Develop prerequisite

Before Task 1 or baseline integration, retain the original HEAD and the dirty/untracked/ignored-file inventory. Record the current operator's post-relocation baseline separately from the old owner's retained state. The 2026-11-08 inventory captured original HEAD 2fd89e1103a0ee1976e0e1a1210c2d4e1bb57de0, 7062 ignored paths and hashes for the 12 non-node_modules evidence files. Only the two new plan/design documents were untracked. Preserve this inventory and recheck protected original-owner files before integration.

## Review Focus

- Genuine multiline user approvals, injection/tool items and mismatched thread/session/item identity must remain distinct.
- A transport timeout or package-selection mismatch cannot create authorization or a false activation result.
- Target movement during verifier execution must prevent publication/integration.
- Ignored files, unfinished Git operations, conflicts and failed verification must retain their evidence and worktrees.
- Custom/nested branch authority must survive direct CLI dispatch without canonical-name guessing.

## Task 1: Canonical human approval and separate operator runtime (1.5h)

**Files:** new scripts/task-tracker/lib/workflow-policy/codex-host-source.mjs; existing authority-resolver.mjs, exception-record.mjs, delivery-request.mjs and verbs/workflow-exception.mjs; focused workflow-exception integration/unit tests; new scripts/tests/integration/package/canonical-authority-runtime.test.mjs. Only amend a legacy tail-helper dispatch if qualification proves it consumes an affected authority reader incorrectly.

**Interfaces:** createCodexHostSourceLoader({expectedSessionId, transport}) returns async source => {role, statement, principal, statementHash}. Production transport runs fixed codex app-server --stdio; transport injection is a test seam, never a request field. A strict versioned source includes threadId, turnId, sessionId, messageId and statementHash. The shared resolver returns the actual origin and reference. Delivery-v2 parser refuses the new adapter.

- [ ] Add red tests for exact genuine user item, multiline text, wrong session/role/hash, duplicate/missing item, pagination, malformed reply, timeout and delivery-v2 refusal. Run focused tests and retain failure evidence.
- [ ] Implement bounded JSON-RPC initialization and read-only thread/read plus thread/items/list. Never resume/start a thread or send user input. Keep legacy adapter behavior and genuine statement bytes.
- [ ] Run focused tests, then package qualification using a distinct unchanged subject checkout. Verify package selection, shared reader/writer compatibility and legacy helper paths; inspect tracked-file status before and after.
- [ ] Commit the reviewed source and its test evidence under [#2145]. Qualify the exact packed artifact before activating it in #2169. At the one-hour checkpoint, replan if host/package feasibility is still uncertain.

## Task 2: Retained additive integration and recorded direct sync (2h)

**Files:** new scripts/task-tracker/lib/integration-retention.mjs and lib/sync-epic-cli.mjs; existing sync-epic.mjs, merge-back.mjs and lib/merge-back-cli.mjs; their focused unit/CLI tests; new scripts/tests/integration/task-tracker/lib/retained-integration.test.mjs and scripts/tests/integration/task-tracker/sync-epic-cli.test.mjs.

**Interfaces:** retainIntegrationHeads({git, heads}) creates/validates immutable refs for exact supplied original commits and returns their mappings. syncEpic retains its public callable API but performs additive synchronization with exact-head verification and an ordinary push; production CLI supplies required physical/ownership/verification dependencies. mergeBack preserves its existing result contract and verifies the additive child head before advancing the parent.

- [ ] Add red physical-repository tests for original reachability, custom/nested/canonical authority, create-only ref conflict, target drift, dirty checkout, active Git operation, ignored collision, merge conflict, failed verification and evidence-preserving cleanup.
- [ ] Implement exact-head retention and additive merges under exclusion. Reuse graph authority and configured verification. Require successful exact-head verification and post-verification revalidation before push/parent advance. Preserve failure and evidence-bearing worktrees.
- [ ] Run focused unit and actual CLI integration tests. Verify retained original commits and integrated file bytes rather than only command spies. Review changes, then commit [#2145].

## Task 3: Native proof, final qualification and delivery (2.5h)

**Files:** scripts/tests/integration/task-tracker/lib/native-bridge-trial.test.mjs; scripts/maintenance/verify-bridge-proof.mjs; docs/reviews/2145/native-bridge-proof.md and its narrowly scoped evidence manifest; plan/review records.

**Interfaces:** proof verifier reads versioned factual evidence: exact Git object IDs and retained-ref mappings, artifact paths/hashes, and retained native bootstrap/Start/relocation outputs with separate admission, source-closure and rehearsal statuses. It inspects the named objects, refs and artifacts and validates native output identity; manifest success booleans alone confer no proof. It returns nonzero for missing/stale identities or falsely claimed success. Native observed admission and physical algorithm rehearsal are separately labeled. A source-closure refusal is a truthful result, not a support-test failure concealed as successful #2071 activation.

- [ ] Recheck the pre-Develop preservation inventory and record actual native admission/relocation and original checkout preservation. Test missing/foreign/dirty/wrong-source/ambiguous proof negatives.
- [ ] Repeat the bounded bridge inspection using existing manifests and reviewed source inputs. Rehearse outward/return integration in disposable repositories. Record the actual source-closure result without altering old reviews or original WIP.
- [ ] Complete focused tests, lint and format; obtain fresh independent exact-source review. Push the issue branch and obtain complete exact-head CI/native Test qualification through the configured provider, avoiding duplicate full local suites.
- [ ] Publish immutable Git links to proof/reviews and stamp each verified AC/VC through native helpers. Complete native Review, delivery and Close only when their fresh gates pass. Retain closure/read-back evidence. Any unresolved result remains explicit.

## Estimate and review

Medium / six remaining hours: 1.5h authority/runtime, 2h integration, 2.5h proof/review/delivery, including preparation. Historical work is not reset or claimed known. Independent design review by /root/review_2145_bounded_design found this reduced approach credible, required exact-head sync verification and evidence-safe cleanup, and accepted the existing-branch relocation with preservation and renewed source binding. The detailed plan receives an independent check before implementation. No formal APR acceptance is asserted.

Independent detailed-plan review by /root/review_2145_bounded_design found the plan implementation-ready after moving preservation before Develop and making proof inputs concrete. Both corrections are incorporated above; no formal APR acceptance is claimed.
