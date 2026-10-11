# #1954 Project Lookup and Tether Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Prevent foreign issue writes and foreign project state authority while completing membership pagination.

**Architecture:** Introduce a strict issue membership reader using the existing GraphQL transport. Resolve exactly one configured-project item only after a complete scan. Reuse it in lookup and lifecycle callers; independently repair tether's forward scan using issue node identity.

**Tech Stack:** Node ESM, GitHub GraphQL, node:test and existing assertion suites.

**Spec:** `docs/superpowers/specs/2026-10-10-1954-project-lookup-tether-design.md`

## Story Intent

- **Beneficiary:** AITM delivery operator
- **Capability:** project lookup and tethering identify the configured project and repository issue
- **Need:** shared boards and partial membership scans can select unrelated items
- **Value or failure prevented:** field writes and lifecycle gates cannot use another issue or project as authority

## Global Constraints

- Preserve the eight-state lifecycle, singleton ownership, current transport seams, and eventual-consistency retries.
- Do not import the obsolete Assigned-state saga.
- No new dependencies.
- Local iteration uses focused offline regressions and the repository's affected-test provider; full fast/slow verification runs in cloud CI.
- Hook settings disabled for the cleanup session remain outside the change.

## Review Focus

- A foreign issue with the same number precedes the exact issue: no foreign field write.
- The configured item appears after a foreign project: finish every page before choosing it.
- An apparent match precedes a corrupt later page: refuse rather than accept partial evidence.
- Issue/item identity changes or repeats during pagination: refuse rather than merge incompatible reads.
- Valid absence differs from transport failure: state gates never acquire authority from a fallback project.

### Task 1: Complete configured-project membership and state lookup

**Files:** Create `scripts/gh/lib/project-membership.mjs`; modify `scripts/gh/lib/github-projects.mjs`, `scripts/gh/lib/live-state.mjs`, `scripts/task-tracker/lib/verifier-state-gate.mjs`, and state lookup in `scripts/task-tracker/verbs/{promote,demote,plan,reconcile}.mjs`. Add `scripts/tests/unit/task-tracker/gh/lib/project-membership.test.mjs`; update existing transport fixtures when they omit required GraphQL fields.

**Interfaces:** Consumes existing `gql(query, variables)` and `splitRepo(repo)`. Produces `fetchIssueProjectMembership({repo, projectId, issueNumber, runGql}) -> {issue, item}` where `item` is null for complete absence; malformed/ambiguous data throws. Optional extra item selections support field-value reads without changing their return shape.

- [ ] Write behavioral tests for second-page membership, no foreign Status fallback, ambiguity after an early match, repeated/missing cursors, malformed page and changing issue identity. Use literal item and issue IDs; stub only GraphQL transport.

```js
assert.equal(
  (
    await fetchIssueProjectMembership({
      repo: 'owner/repo',
      projectId: 'P',
      issueNumber: 12,
      runGql,
    })
  ).item.id,
  'TARGET'
);
await assert.rejects(
  () =>
    fetchIssueProjectMembership({
      repo: 'owner/repo',
      projectId: 'P',
      issueNumber: 12,
      runGql: corruptPage,
    }),
  /membership/
);
```

- [ ] Run `node --test scripts/tests/unit/task-tracker/gh/lib/project-membership.test.mjs`. Expected: FAIL because the strict reader is absent.
- [ ] Implement sequential issue membership reads with `after`, stable issue ID, strict pageInfo/nodes, unique item IDs and at most one configured match. Route state readers through this resolver, preserving their existing normalization and refusal behavior. Use the same resolver for item/value helpers.

```js
const { item } = await fetchIssueProjectMembership({
  repo: cfg.repo,
  projectId: cfg.projectId,
  issueNumber,
});
return normalizeStateId(item?.fieldValueByName?.name);
```

- [ ] Run the new membership suite plus existing GitHub project and assignment snapshot suites. Expected: PASS, with assignment safeguards unchanged.
- [ ] Commit explicit owned paths with `fix: resolve complete configured project membership [#1954]`.

### Task 2: Exact-identity tethering

**Files:** Modify `scripts/gh/lib/project-tether.mjs`; extend `scripts/tests/unit/task-tracker/gh/lib/project-tether.test.mjs`.

**Interfaces:** Consumes Task 1's complete issue reader via injected `runGql`. Produces the unchanged `tetherIssueToProject` result and field-write contract, with forward content selected by exact issue node ID.

- [ ] Add regressions for a foreign same-number issue before the target, target on a later forward page, duplicate exact matches, unreadable pagination and changed reverse issue identity during retries. Assert the field mutation recipient and absence of writes/additions on invalid reads.

```js
assert.equal(result.itemId, 'TARGET');
assert.equal(
  calls.some(
    ({ query, variables }) =>
      query.includes('updateProjectV2ItemFieldValue') && variables.item === 'FOREIGN'
  ),
  false
);
```

- [ ] Run `node scripts/tests/unit/task-tracker/gh/lib/project-tether.test.mjs`. Expected: FAIL for foreign selection or partial scan acceptance.
- [ ] Query forward Issue `id`, select only `content.id === issue.id`, complete the scan, reject duplicate candidates and invalid/non-progressing pages. Preserve add-once/retry behavior and independently validate refreshed issue identity.

```js
const matches = nodes.filter((node) => !node.isArchived && node.content?.id === issueId);
```

- [ ] Run tether and membership suites. Expected: PASS.
- [ ] Run `node scripts/maintenance/verify-affected-or-cloud.mjs`, `npm run lint`, and `npm run format:check`. Expected: affected tests pass or provider explicitly routes coverage to cloud; lint and format pass.
- [ ] Commit with `fix: tether fields to exact repository issue [#1954]`; push the owned branch, create a PR linked to #1954, run required cloud lanes, and obtain one fresh whole-branch code review before reporting completion. Expected: reviewable PR with exact-head receipts; no automatic issue closure or merge.
