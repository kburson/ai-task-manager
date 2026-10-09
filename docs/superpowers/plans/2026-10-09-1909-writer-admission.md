# #1909 Writer Admission and Ordered Locks Implementation Plan

> **For agentic workers:** Use executing-plans inline, TDD for each actual gap, and one fresh source review after qualification. Work under the active #1918 orchestration while its documented sequencing loop prevents child admission.

**Goal:** Complete independent public-writer discovery and require fresh revision admission before ordinary, canonical, repair and initialization effects, preserving the strict-interlock-before-issue-lock contract.

**Spec:** docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md, writer-domain/interlock sections; original Task5 and current #1909 Scope.

**Architecture:** Reuse existing withRevisionConsumer, authenticated interlock and public issue-lock boundaries. Add missing public-adapter boundaries without replacing their algorithms, accepting caller readiness, activating a production collector or changing lock ownership. Nested delegates reuse the actual held capability and read authority again.

**Tech Stack:** Node.js scripts, node:test, existing real adapters and isolated filesystem fixtures. No new native binary/addon.

## Authority and provenance

Native hierarchy: #1847 → #1855 → #1918 → #1909. #1919's scoped input is included locally; its full-suite result remains failed and its issue open. The human's explicit no-defect/no-daisy-chain/disable-AITM direction permits continuation under active1918 as recorded in docs/superpowers/plans/2026-10-09-1918-qualified-repair-continuation.md. No blocked child board state, approval or completion marker is forged. This plan is the bounded source plan accepted by the inline parent orchestrator; ordinary child lifecycle reconciliation remains due.

Source base:8bae871cc on feature/epic/1918/parent. Reuse actual retained implementations and credit prior work. The missing declared criteria-revision-writer-admission.test.mjs is not existing proof.

## Baseline observations and discovered roots

The complete existing policy, interlock and consumers-admission suites passed54/54 in11.22s. They exercise versioned/invariant body writers, canonical capsule/contract writers, actual issue-lock acquisition, bare inherited flags, authenticated delegates, stale/pending/malformed/unavailable states and linked-worktree hook projection.

Source discovery also finds public effects below these existing wrappers:

- initializeIssueDirectory and repairIssueDirectory in singleton-initializer.mjs.
- repairIssueProjections in projection-repair.mjs.
- createIssueComment and updateIssueComment in github-comment-store.mjs.
- appendLifecycleTransition is protected by its existing transition capability; inspect its route into appendCapsule and keep that independent custody proof.

The initializer and projection-repair exports currently enter their algorithms without the fresh revision-consumer boundary; comment-store exports can independently select supplied transports. Prove each applicable bypass with a real adapter and effect spy before changing source. A transition capability or an internal issue-lock holder cannot stand in for current revision approval.

## Global constraints

- Preserve original algorithms, input validation/refusals, invariants, current-source checks and lock ordering.
- No source/authority caching across awaits or observations; successful DATA validation stays synchronous.
- No test deletion, fixture reduction, budget increase or guard weakening.
- Existing600000ms file/semantic-section,20-minute verifier and45-minute sandbox budgets remain.
- Disabled-domain ordinary behavior remains compatible; enabled production domains without a trusted collector fail closed.
- No criteria/event-body authorization or production activation is granted by this plan.
- Current9.5h prospective incremental forecast includes discovery, missing public boundaries, full cases and review; excludes historical work and passive CI. Any revised forecast >=24h requires decomposition.

## Interfaces

Consume the existing public writer inputs, authentic memory backend/context and withRevisionConsumer. Produce fresh admission before original transforms/transports and issue/resource locks. Successful calls return original results; refused calls produce no owned effects. Authenticated nested operations retain current capability, authority reread and cleanup.

## Review focus

- Independently callable initialization/repair/comment roots cannot bypass policy through supplied callbacks or old transition/lock capabilities.
- Pending, stale, malformed and unavailable authority produce zero original transforms, writes, callback or lock effects; current approved authority preserves the original successful algorithm.
- Public guards do not replace input validation or weaken record/body invariants.
- Dependency selection and fresh reads precede effects; nested calls do not acquire a new revision interlock beneath existing locks.
- The focused entrypoint has source-backed graph discovery and complete real cases, not an allowlist-only coverage claim or an empty Node selection.

## Task 1: Close missing public writer boundaries

**Files:** Inspect/reuse criteria-revision/policy.mjs, issue-mutator-lock.mjs, versioned-issue-write.mjs, issue-body-mutate.mjs, github-records/contract-write.mjs, capsule-chain.mjs and lifecycle-transition.mjs. Owned discoveries may require changes in github-records/singleton-initializer.mjs, projection-repair.mjs and github-comment-store.mjs.

- Add focused real five-state tests for the independently callable roots and run RED before source changes. Count original transforms, transport writes, callback selection and lock effects.
- Add the smallest fresh admission wrapper around each proved missing boundary. Keep the original admitted algorithm and validation intact. Test genuine approved/baseline positive controls and disabled-domain ordinary cases.
- Run existing initialization, projection, comment-store, lifecycle, policy and lock regressions with their actual fixtures. Diagnose owned failures; retain unrelated native phase/status/recovery/saga failures under their existing1918 owners.

## Task 2: Qualify independent writer discovery and ordered delegation

**Create:** scripts/tests/integration/task-tracker/lib/criteria-revision-writer-admission.test.mjs.

- Independently discover effectful public roots/delegates from repository source exports and call sites; compare the executable inventory with actual owned cases, including initialization and repair routes. Do not equate a hardcoded list with discovery.
- Reuse complete policy/interlock/admission cases in isolated processes as needed; verify every input path, actual case counts, exit status, cancellations and skips. Preserve original budgets and fixtures.
- Qualify exact nested lock ordering, no new revision lock below an existing issue lock, bare-flag refusal, callback/effect order and return/throw cleanup through the real APIs.
- Run the declared focused command and package/ordinary regressions. Record real current-head failures and owners; no globally green claim from scoped success.

## Task 3: Review and reconcile delivery evidence

Commit with explicit1918/1909 attribution and request one fresh review of the bounded source changes. Record local/Linux qualification at the actual source HEAD. Preserve every declared full-suite/slow/lint/format/commit obligation and reconcile normal child lifecycle evidence once aggregate failures are resolved; no false Test, Review or Done markers.

## Verification commands

Run: node --test scripts/tests/unit/task-tracker/lib/criteria-revision/policy.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-writer-admission.test.mjs

Expected: all original policy cases plus independently discovered public writer/admission and ordered-lock cases actually execute and pass; no absent or empty selection.

Run complete existing initialization, projection, comment-store, lifecycle, policy and interlock regressions selected from actual source discovery. Run npm run lint, npm run format:check and git log --oneline -1. Full npm test/npm run test:slow and genuine exact-head Linux receipts remain due; report inherited failures explicitly rather than declaring success or deleting their commands.
