# GitHub-Native Authority Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace database-backed and issue-body-heavy AITM authority with
GitHub-native structured comments, scoped coordinators, append-first records,
and a rebuildable Insights read model.

**Architecture:** The issue body contains a stable singleton directory. Four
coordinator-owned comments hold current projections, while immutable capsules
record authoritative assignments, evidence, transitions, and integrations. A
versioned compatibility boundary supports legacy body issues until each issue
is explicitly adopted.

**Tech Stack:** Node.js ESM, `node:test`, GitHub GraphQL and REST APIs, GitHub
Issues/comments, Markdown plus hidden canonical JSON, browser IndexedDB contract.

## Global Constraints

- GitHub is the only durable authority.
- SQLite, PostgreSQL, hosted APIs, filesystem caches, and IndexedDB cannot grant
  authority or satisfy a lifecycle gate.
- The issue body contains stable story content and a singleton directory; normal
  Develop/Test/Review mutations do not rewrite the body.
- GitHub global node IDs are opaque strings and are never decoded.
- Each governed scope has exactly one active coordinator grant and authority
  epoch.
- Immutable capsules are appended before singleton projections are updated.
- Every write is read back and validated.
- Unknown schema versions, forks, duplicate singletons, stale epochs, and hash
  mismatches fail closed.
- New issues retain estimates below four hours and end with an independently
  testable deliverable.
- Every child receives one independent exact-SHA review. Authority-critical
  children receive a second review; any Critical or Important first finding
  also requires a second review.
- The archived #1053 and #1054 branches are evidence inputs only. No archived
  commit is merged wholesale.

---

## Delivery Sequence

The nested epic executes the following children in order. Every child integrates
into the nested epic before its successor begins unless the coordinator records
an explicit non-overlap grant.

| Order | Deliverable                                               |  Cap | Review      |
| ----: | --------------------------------------------------------- | ---: | ----------- |
|     1 | Characterize current authority and add locator boundary   |   3h | One         |
|     2 | Canonical record envelope and hashing                     |   3h | Two         |
|     3 | GitHub comment store and batched node reads               | 3.5h | Two         |
|     4 | Singleton directory initialization and repair             | 3.5h | Two         |
|     5 | Delivery Contract draft, seal, render, and amend          | 3.5h | Two         |
|     6 | Immutable capsules, predecessor chains, and forks         | 3.5h | Two         |
|     7 | Epic coordinator grants and authority epochs              | 3.5h | Two         |
|     8 | Worker assignments, submissions, and dispositions         |   3h | One         |
|     9 | Append-first lifecycle transitions and projection replay  | 3.5h | Two         |
|    10 | AC/VC/DoD read-side compatibility adapter                 | 3.5h | One         |
|    11 | Test, Review, approval, and close gate migration          | 3.5h | Two         |
|    12 | Checklist, evidence, and contract projection writes       | 3.5h | Two         |
|    13 | Coordination, evidence, and timing singleton projections  | 3.5h | One         |
|    14 | Per-issue adoption, rollback, and repair command          | 3.5h | Two         |
|    15 | Insights export and IndexedDB ingestion contract          |   3h | One         |
|    16 | Operator docs, clean-install proof, and final integration | 3.5h | Cross-issue |

## Shared Interfaces

Children must use these names so each bounded implementation can be integrated
without redesigning its neighbors:

```js
locateAuthoritySource({ issueBody });
parseAitmRecord({ commentNodeId, body });
renderAitmRecord({ envelope, visibleMarkdown });
loadIssueRecordSet({ repo, issueNumber, directory });
initializeIssueDirectory({ repo, issueNumber, expectedSingletons });
loadDeliveryContract({ repo, issueNumber, authoritySource });
appendCapsule({ repo, issueNumber, envelope, payload });
resolveCoordinatorAuthority({ issueNumber, records, actor });
evaluateAssignment({ assignment, submission, authority });
appendLifecycleTransition({ expectedHead, transition, authority });
repairIssueProjections({ repo, issueNumber, records });
adoptIssueRecords({ repo, issueNumber, dryRun });
exportInsightsRecordSet({ issue, directory, singletons, capsules });
```

Each function returns durable JSON. Transport-specific responses stay behind the
GitHub comment store.

### Task 1: Characterize Current Authority and Add the Locator Boundary

**Files:**

- Create: `scripts/task-tracker/lib/github-records/authority-locator.mjs`
- Create: `scripts/task-tracker/tests/fixtures/github-records/legacy-body-contract.md`
- Create: `scripts/task-tracker/tests/unit/lib/github-records/authority-locator.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/meta/test-tree-layout.baseline.json`

**Interfaces:**

- Produces: `locateAuthoritySource({ issueBody }) -> { kind, directory? }`
- Preserves: exact current body parsing and gate behavior for legacy issues.

- [ ] Add fixture-driven tests for a legacy body, a valid directory body,
      duplicate directories, malformed JSON, and unknown directory schemas.
- [ ] Run the focused test and confirm RED because the locator does not exist.
- [ ] Implement the locator without changing any lifecycle consumer.
- [ ] Run the focused test and existing body-gate characterization suites.
- [ ] Commit the independently reviewable locator boundary.

### Task 2: Canonical Record Envelope and Hashing

**Files:**

- Create: `scripts/task-tracker/lib/github-records/canonical-json.mjs`
- Create: `scripts/task-tracker/lib/github-records/record-envelope.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/github-records/record-envelope.test.mjs`

**Interfaces:**

- Produces: `parseAitmRecord`, `renderAitmRecord`, `canonicalRecordJson`,
  `hashRecordPayload`.
- Consumes: opaque comment node IDs from GitHub.

- [ ] Add RED tests for exact keys, canonical serialization, payload hashes,
      secret rejection, malformed envelopes, issue mismatch, and unknown schema.
- [ ] Implement durable JSON validation and SHA-256 hashing.
- [ ] Prove visible Markdown changes do not change the structured payload hash.
- [ ] Run focused tests, lint, format, and line-cap checks.
- [ ] Obtain two exact-SHA reviews before integration.

### Task 3: GitHub Comment Store and Batched Node Reads

**Files:**

- Create: `scripts/task-tracker/lib/github-records/github-comment-store.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/github-records/github-comment-store.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/github-records-comment-store.test.mjs`

**Interfaces:**

- Produces: `getCommentsByNodeIds(ids)`, `createIssueComment`,
  `updateIssueComment`, `listIssueCommentsSince`, and `readBackComment`.
- Guarantees: returned IDs remain opaque; every write is read back.

- [ ] Add unit tests around GraphQL query generation and transport failures.
- [ ] Add an integration test that creates comments and retrieves them through
      one `nodes(ids:)` query.
- [ ] Implement injected GraphQL/REST transports and normalized error results.
- [ ] Prove pagination, missing nodes, deleted comments, and partial responses
      fail closed.
- [ ] Obtain two exact-SHA reviews before integration.

### Task 4: Singleton Directory Initialization and Repair

**Files:**

- Create: `scripts/task-tracker/lib/github-records/issue-directory.mjs`
- Create: `scripts/task-tracker/lib/github-records/singleton-initializer.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/github-records/issue-directory.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/github-records-initialization.test.mjs`

**Interfaces:**

- Produces: `initializeIssueDirectory`, `discoverIssueSingletons`,
  `repairIssueDirectory`.
- Consumes: Task 2 record envelopes and Task 3 comment store.

- [ ] Add crash-injection tests before and after every comment and body write.
- [ ] Define deterministic singleton logical identities independent of comment
      position and visible title.
- [ ] Create all version-1 singleton comments before the one body-directory write.
- [ ] On retry, scan and validate before creating; block ambiguous duplicates.
- [ ] Prove ordinary re-entry produces no body or comment write.
- [ ] Obtain two exact-SHA reviews before integration.

### Task 5: Delivery Contract Draft, Seal, Render, and Amend

**Files:**

- Create: `scripts/task-tracker/lib/github-records/delivery-contract.mjs`
- Create: `scripts/task-tracker/lib/github-records/delivery-contract-renderer.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/github-records/delivery-contract.test.mjs`

**Interfaces:**

- Produces: `createDraftContract`, `sealContract`, `amendContract`,
  `renderDeliveryContract`, `validateContractProjection`.
- Stable IDs: each AC, VC, and DoD item has a logical record ID.

- [ ] Add RED tests for structured AC/VC/DoD, generated checkboxes, definition
      hash, projection hash, and stable item IDs.
- [ ] Implement draft revision without event spam.
- [ ] Implement Plan sealing and full immutable snapshot payload.
- [ ] Implement post-Plan amendment with contract-epoch increment and evidence
      invalidation output.
- [ ] Prove manual visible Markdown edits fail projection validation.
- [ ] Obtain two exact-SHA reviews before integration.

### Task 6: Immutable Capsules, Predecessor Chains, and Forks

**Files:**

- Create: `scripts/task-tracker/lib/github-records/capsule-chain.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/github-records/capsule-chain.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/github-records-capsules.test.mjs`

**Interfaces:**

- Produces: `appendCapsule`, `validateCapsuleChain`, `resolveSupersession`,
  `detectRecordFork`.
- Capsule edits are never exposed by the API.

- [ ] Test every version-1 capsule type and common-envelope correlation.
- [ ] Test missing predecessors, duplicate successors, supersession cycles, and
      two successors from one head.
- [ ] Append and read back one capsule as a single authoritative operation.
- [ ] Return an explicit blocked fork rather than choosing by timestamp.
- [ ] Obtain two exact-SHA reviews before integration.

### Task 7: Epic Coordinator Grants and Authority Epochs

**Files:**

- Create: `scripts/task-tracker/lib/github-records/coordination-authority.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/github-records/coordination-authority.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/github-records-coordinator-replacement.test.mjs`

**Interfaces:**

- Produces: `resolveCoordinatorAuthority`, `grantNestedEpic`,
  `replaceCoordinator`, `authorizeCoordinatorOperation`.
- Consumes: issue hierarchy, grant capsules, and coordination projection.

- [ ] Add scope tests for parent, nested epic, descendants, siblings, exclusions,
      and standalone issues.
- [ ] Add stale-epoch and overlapping-grant refusal tests.
- [ ] Implement bounded capabilities and branch/integration boundaries.
- [ ] Prove coordinator replacement pauses advancement until explicit adoption.
- [ ] Obtain two exact-SHA reviews before integration.

### Task 8: Worker Assignments, Submissions, and Dispositions

**Files:**

- Create: `scripts/task-tracker/lib/github-records/work-assignment.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/github-records/work-assignment.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/github-records-cross-platform-handoff.test.mjs`

**Interfaces:**

- Produces: `createWorkAssignment`, `evaluateAssignment`,
  `acceptSubmission`, `rejectSubmission`, `adoptOutstandingSubmissions`.

- [ ] Test issue, branch, file/subsystem, dependency, verifier, and epoch bounds.
- [ ] Test submitted records cannot satisfy gates before coordinator disposition.
- [ ] Test a Codex submission accepted by a Claude-labeled coordinator and the
      reverse using actor fixtures.
- [ ] Test replacement coordinator adoption and old-epoch refusal.
- [ ] Obtain one exact-SHA review before integration.

### Task 9: Append-First Lifecycle Transitions and Projection Replay

**Files:**

- Create: `scripts/task-tracker/lib/github-records/lifecycle-transition.mjs`
- Create: `scripts/task-tracker/lib/github-records/projection-repair.mjs`
- Create: `scripts/task-tracker/tests/helpers/github-record-lifecycle-fixtures.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/github-records/lifecycle-transition.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/github-records-transition-repair.test.mjs`

**Interfaces:**

- Produces: `appendLifecycleTransition`, `validateTransitionAuthority`,
  `repairIssueProjections`.
- Salvages: stable operation ID, secret rejection, immutable attachments,
  ordered checkpoints, exact replay, and fenced cleanup concepts from #1054.

- [ ] Port the storage-neutral #1054 crash-boundary assertions as RED tests
      against GitHub capsules and singleton revisions.
- [ ] Append the transition before updating projections and read it back.
- [ ] Interrupt after every boundary and prove deterministic replay.
- [ ] Reject serialized/fabricated proof, changed contract epoch, stale grant,
      and record-chain fork.
- [ ] Obtain two exact-SHA reviews before integration.

### Task 10: AC/VC/DoD Read-Side Compatibility Adapter

**Files:**

- Create: `scripts/task-tracker/lib/github-records/contract-source.mjs`
- Modify: `scripts/task-tracker/lib/body-gates.mjs`
- Modify: `scripts/task-tracker/lib/code-complete-gate.mjs`
- Modify: `scripts/task-tracker/lib/functional-dod-evidence.mjs`
- Modify: `scripts/task-tracker/lib/evidence-markers.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs`

**Interfaces:**

- Produces: one normalized contract model for legacy-body and GitHub-record issues.
- Consumers do not know the storage location.

- [ ] Characterize identical outputs for equivalent legacy and comment contracts.
- [ ] Route AC, VC, DoD, and evidence reads through `contract-source.mjs`.
- [ ] Preserve every current legacy fixture unchanged.
- [ ] Fail closed when a directory issue's contract comment is unavailable.
- [ ] Obtain one exact-SHA review before integration.

### Task 11: Test, Review, Approval, and Close Gate Migration

**Files:**

- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/task-tracker/verbs/review.mjs`
- Modify: `scripts/task-tracker/verbs/approve.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/task-tracker/lib/review-preflight.mjs`
- Modify: `scripts/task-tracker/lib/close-gates.mjs`
- Create: `scripts/task-tracker/tests/integration/verbs/github-record-lifecycle-gates.test.mjs`

**Interfaces:**

- Consumes: normalized contract, accepted evidence, active authority, and
  lifecycle-transition records.

- [ ] Add paired legacy/comment tests for Test, Review, approval, demotion, and
      close gates.
- [ ] Require exact contract epoch and verified SHA in accepted evidence.
- [ ] Preserve human versus Full-Auto approval provenance.
- [ ] Prove stale visible checkboxes and old-epoch approval cannot satisfy gates.
- [ ] Obtain two exact-SHA reviews before integration.

### Task 12: Checklist, Evidence, and Contract Projection Writes

**Files:**

- Modify: `scripts/task-tracker/verbs/check.mjs`
- Modify: `scripts/task-tracker/verbs/ac-stamp.mjs`
- Modify: `scripts/task-tracker/verbs/dod-stamp.mjs`
- Modify: `scripts/task-tracker/verbs/evidence-markers.mjs`
- Modify: `scripts/task-tracker/verbs/demote.mjs`
- Modify: `scripts/task-tracker/verbs/plan-approve.mjs`
- Create: `scripts/task-tracker/tests/integration/verbs/github-record-contract-writes.test.mjs`

**Interfaces:**

- Writes: immutable evidence/amendment/transition capsules followed by Delivery
  Contract projection updates.

- [ ] Add RED tests proving directory issues do not rewrite the body.
- [ ] Route checkbox and evidence updates to the Delivery Contract singleton.
- [ ] Seal on Plan approval and invalidate current proof on contract amendment
      or sanctioned demotion.
- [ ] Interrupt each write path and prove replay repair.
- [ ] Obtain two exact-SHA reviews before integration.

### Task 13: Coordination, Evidence, and Timing Singleton Projections

**Files:**

- Create: `scripts/task-tracker/lib/github-records/singleton-projections.mjs`
- Modify: `scripts/task-tracker/gh-timing-comment.mjs`
- Modify: `scripts/task-tracker/timing-rollup.mjs`
- Modify: `scripts/task-tracker/fleet-registry.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/github-record-singleton-projections.test.mjs`

**Interfaces:**

- Produces: deterministic projections from accepted records.
- Fleet remains observational and cannot grant authority.

- [ ] Preserve current timing-table rendering from structured timing payloads.
- [ ] Render active grants, assignments, accepted evidence, and stage timing into
      their owned singleton comments.
- [ ] Prove deleting local fleet/cache data does not affect authority.
- [ ] Prove projection repair is idempotent and produces no body write.
- [ ] Obtain one exact-SHA review before integration.

### Task 14: Per-Issue Adoption, Rollback, and Repair Command

**Files:**

- Create: `scripts/task-tracker/verbs/adopt-github-records.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Create: `scripts/task-tracker/tests/integration/verbs/adopt-github-records.test.mjs`

**Interfaces:**

- Produces: `adoptIssueRecords({ repo, issueNumber, dryRun })` and a CLI verb.

- [ ] Implement a no-write dry run with exact legacy-to-contract parity report.
- [ ] Initialize singletons, seal the contract, write the body directory once,
      and read back the complete record set.
- [ ] Permit rollback only before the first divergent GitHub-native transition.
- [ ] Repair deleted directories/singletons only from validated records.
- [ ] Prove fresh consumer installation has no required database or hosted API.
- [ ] Obtain two exact-SHA reviews before integration.

### Task 15: Insights Export and IndexedDB Ingestion Contract

**Files:**

- Create: `scripts/task-tracker/lib/github-records/insights-export.mjs`
- Create: `scripts/task-tracker/tests/fixtures/github-records/insights-record-set.json`
- Create: `scripts/task-tracker/tests/unit/lib/github-records/insights-export.test.mjs`
- Create: `docs/guides/github-records-insights-ingestion.md`

**Interfaces:**

- Produces: `exportInsightsRecordSet` with repositories, issues, directories,
  contracts, records, projections, and sync cursor hints.

- [ ] Add deterministic export and rebuild fixtures.
- [ ] Document IndexedDB object stores and primary keys.
- [ ] Prove overlapping incremental pages deduplicate by node ID, record ID,
      update time, and hash.
- [ ] Prove a full rebuild matches incremental materialization.
- [ ] State explicitly that IndexedDB cannot satisfy AITM gates.
- [ ] Obtain one exact-SHA review before integration.

### Task 16: Operator Docs, Clean-Install Proof, and Final Integration

**Files:**

- Create: `docs/guides/github-native-coordination.md`
- Modify: `docs/guides/parallel-agents.md`
- Modify: `docs/internals/checkbox-gates.md`
- Modify: `docs/architecture/body-writes.md`
- Create: `docs/evidence/github-native-authority-records-integration.md`
- Modify: package/install tests only if the final audit finds a stale database
  requirement.

**Interfaces:**

- Produces: frozen child-to-commit map, cross-issue review, package evidence,
  clean-install proof, and operator handoff.

- [ ] Verify every predecessor commit is reachable in order on the nested epic.
- [ ] Run focused, fast, slow, lint, format, whitespace, and package checks on one
      frozen SHA.
- [ ] Install into a clean consumer and prove GitHub is the only required remote
      authority.
- [ ] Perform one independent cross-issue exact-SHA review; fix and re-review all
      in-scope Critical or Important findings.
- [ ] Record archive-branch provenance and every superseded legacy issue.
- [ ] Present the exact nested-epic delta for parent integration.

## Backlog Disposition

- #1048 remains the parent workspace/distributed-authority program and receives
  an additive pivot record pointing to this spec, ADR, plan, and new nested epic.
- #1053 is superseded by the new nested epic because its approved Develop scope
  assumes the rejected database-backed work-lease lifecycle.
- #1054 is superseded by Task 9. Its two commits remain archived and are treated
  as recovery-pattern evidence, not merge candidates.
- #1055 through #1064 and #1066 are superseded by the matching new bounded
  children. Their unimplemented lease-specific scopes are preserved in history.
- #1049, #1050, and #1065 remain closed historical deliveries on the archived
  branch. They are not prerequisites for the GitHub-native implementation.
- #1051 remains an independent local-worktree environment issue under #1048.

## Final Verification

```bash
npm test
npm run test:slow
npm run lint
npm run format:check
git diff --check
git log --oneline --decorate --graph origin/trunk..HEAD
```

The final evidence must also prove the issue body does not change during a full
directory-governed Develop → Test → Review path and that rebuilding the complete
read model from GitHub produces the expected projection.
