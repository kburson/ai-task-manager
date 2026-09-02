# #1485 — Merge-Back Custom Epic Branch Authority Design

## Status

Drafted from the approved repair direction; awaiting written-spec review before implementation planning.

## Problem

`merge-back` resolves a child's parent epic through the GitHub sub-issue graph, but its production graph adapter returns only the parent number and child list. When the parent epic has a durable `aitm-worktree-location` record for a noncanonical branch, the adapter omits that authority and `resolveEpicLineage` falls back to `feature/epic/<N>`.

Two related assumptions also prevent custom refs from working after authority is supplied. The pure merge path calls `parseBranchName(epicBranch).issue` to recover issue identity from the resolved branch, although custom branch refs are intentionally opaque and do not match the managed `feature/<role>/<N>` grammar. Production also prefetches only the child graph node and supplies it for every synchronous graph lookup, while merge-back needs both the child node and the immediate epic node to resolve the epic's grandparent.

This blocks #1226. Its parent #1220 is authoritatively recorded on `cloud-test-automation`, while the synthesized `feature/epic/1220` ref does not exist. The failure occurs before delivery, so #1226 cannot obtain an exact-head receipt or close despite completed implementation, verification, review, and approval.

## Goals

- Make the production `merge-back` adapter pass the parent epic's current durable branch into the existing lineage resolver.
- Keep numeric issue identity separate from opaque branch authority.
- Prefetch the child and immediate-epic graph nodes needed by the synchronous merge protocol.
- Preserve canonical `feature/epic/<N>` fallback when the parent has no worktree-location history.
- Refuse malformed or ambiguous current authority before any Git mutation.
- Preserve the existing rebase, bounded-test, fast-forward-only merge, and cleanup protocol.
- Prove the repaired path with adapter-level tests and a real-Git custom-branch merge.

## Non-Goals

- Creating `feature/epic/1220` as an alias.
- Renaming or replacing #1220's branch or worktree.
- Migrating historical branch names.
- Changing `resolveCurrentIssueWorktreeBranch` or unrelated graph consumers.
- Changing existing `resolveEpicLineage` role or branch semantics; its result gains only the numeric parent issue already present in the graph node.
- Weakening exact-head, ancestry, test, fast-forward, delivery, or close gates.

## Approaches Considered

### 1. Enrich the merge-back graph boundary and preserve numeric identity — selected

Fetch each node's parent issue body at graph-adapter construction time, parse it with `resolveCurrentIssueWorktreeBranch`, and return either `parentAuthoritativeBranch` or `parentAuthorityError` alongside the existing parent and children fields. Prefetch the child and immediate-epic nodes into a map keyed by issue number. Add the graph node's numeric parent to the lineage result so merge-back never parses a branch ref for identity.

This uses the existing resolver contract, keeps mutation sequencing unchanged, and limits risk to the defective boundary.

### 2. Create a canonical alias branch

Creating `feature/epic/1220` would make the current fallback happen to resolve, but it would establish a second apparent authority, leave future custom branch names vulnerable, and conceal the adapter defect. This approach is rejected.

### 3. Centralize every epic graph adapter

A new shared GitHub graph builder could remove duplication across merge-back, child creation, sync, close, and edit guards. That broader consolidation has value but expands the change surface across independently governed workflows. It is rejected for #1485 and may be considered separately.

## Design

### Adapter boundary

`scripts/task-tracker/merge-back.mjs` will expose small pure mapping and graph-loading boundaries for tests and retain asynchronous GitHub I/O around them.

For each requested graph node, the production adapter will obtain:

- the node's parent issue number;
- the node's current sub-issue list; and
- the parent issue body when a parent exists.

The pure mapping boundary will build the synchronous graph node consumed by `resolveEpicLineage`:

```text
{
  parent,
  children,
  parentAuthoritativeBranch? ,
  parentAuthorityError?
}
```

For a valid current worktree-location marker, `parentAuthoritativeBranch` carries the recorded branch. When no authority marker exists, neither optional authority field is emitted, preserving canonical fallback. When parsing fails, `parentAuthorityError` carries the parser message and `parentAuthoritativeBranch` is absent.

Only one authority outcome may be present. The mapper never invents a branch name.

The production graph loader will first load the child node, read its numeric parent, and then load that immediate epic node. It will expose a synchronous lookup over a map keyed by those two issue numbers. A lookup outside the prefetched set fails closed instead of returning the child node or fabricating an empty graph node.

### Identity and authority separation

`resolveEpicLineage` will add `parentIssue` to its return value. The value is the normalized numeric `parent` from the graph node or `null`; it is independent of `branch`, `epicBranch`, and `parentBranch`.

`mergeBack` will use `childLineage.parentIssue` as the immediate epic issue when resolving the epic's own parent. It will remove the `parseBranchName(epicBranch)` dependency. The authoritative branch remains an opaque Git ref and may therefore be `cloud-test-automation`, `codex/1268-implementation-plan`, or any other valid recorded branch without carrying an encoded issue number.

### Data flow

```text
GitHub child graph + parent body
        |
        v
merge-back production graph adapter
        |
        +-- valid marker ------> parentAuthoritativeBranch
        +-- no marker ---------> no authority field
        +-- invalid marker ----> parentAuthorityError
        |
        v
prefetched graph map keyed by child and epic issue numbers
        |
        v
resolveEpicLineage -> parentIssue + branch refs
        |
        +-- recorded branch
        +-- canonical fallback
        +-- fail-closed error
        |
        v
existing mergeBack protocol
```

Graph construction and both lineage resolutions remain ahead of `merge-base`, rebase, test execution, checkout, merge, worktree removal, and branch deletion. An authority error or missing prefetched node therefore cannot partially mutate Git state.

### Merge protocol compatibility

The operational `mergeBack` protocol remains unchanged except for how it obtains the immediate epic's numeric issue identity:

1. Resolve the child and immediate epic branches.
2. Resolve the epic's own parent for opportunistic synchronization.
3. Rebase the child onto the immediate epic.
4. Run Unit, Integration, and Slow sections.
5. Fast-forward the epic to the child.
6. Remove the child worktree and local child branch only after success.

The repair changes the graph evidence supplied to the protocol and removes branch-name identity parsing; it does not change Git operation ordering.

## Error Handling

- A malformed marker-like authority record is not treated as missing history.
- Conflicting current records with the same timestamp are not resolved by order or guesswork.
- Authority errors surface through the existing `resolve-epic-lineage` failure path before injected Git functions are called.
- A missing requested graph node is a loader failure, not an empty node with canonical fallback.
- GitHub query failures remain transport failures; a successfully read parent body containing no authority marker is the only adapter path that selects canonical fallback.
- Existing rebase conflicts, failed test sections, non-fast-forward merges, and cleanup behavior retain their current errors and guarantees.

## Testing

### Adapter-level coverage

Extend `scripts/tests/unit/task-tracker/merge-back.test.mjs` to prove:

- a valid parent marker maps to `parentAuthoritativeBranch`;
- a parent with no marker preserves canonical fallback;
- malformed and ambiguous authority map to `parentAuthorityError`;
- production graph loading fetches and keys both the child and immediate-epic nodes;
- a lookup outside the prefetched set fails closed;
- authority failure reaches `mergeBack` before any Git or test-runner call;
- valid custom authority sends rebase, checkout, and fast-forward operations to the recorded branch while retaining test and cleanup behavior.

Extend `scripts/tests/unit/task-tracker/lib/resolve-epic-lineage.test.mjs` to prove `parentIssue` for child, nested-epic, root-epic, and standalone-story roles, including a custom branch that cannot be parsed by `parseBranchName`. Existing `issue-worktree-location` tests remain in the focused verifier as compatibility coverage.

### Real-Git coverage

Extend `scripts/tests/slow/task-tracker/lib/epic-tree.test.mjs` with a custom-named epic branch. The test will cut the child from that exact branch, add a child commit, run `mergeBack`, and assert:

- the custom epic contains the child commit;
- no `feature/epic/<N>` alias is created;
- the child worktree and branch are removed only after success; and
- the resulting epic history remains a clean descendant of trunk.

### Governed verification

The issue's root Verification Commands remain authoritative. The focused four-file command proves the acceptance criteria; Develop and Test retain full lint, format, Unit, Integration, and Slow gates.

## Delivery and #1226 Recovery

This issue will be delivered to trunk before #1226 is retried. The retained #1220 branch and #1226 child branch will then be synchronized through their governed workflows without creating substitute branches.

Because #1485 changes test-file blobs, #1226's checked-in calibration-input digest becomes stale after synchronization even if the production timing code is unchanged. #1226 must recapture Unit, Integration, and Slow timing artifacts at the new exact implementation head, regenerate its normalized fixture and digest, rerun its governed verification, and obtain a new exact-head receipt before merge-back and close are retried.

## Acceptance Mapping

- Custom parent authority: adapter mapping tests plus real-Git custom merge.
- Canonical fallback: adapter and pure merge tests with no authority marker.
- Invalid authority refusal: malformed/ambiguous adapter cases with zero mutation assertions.
- #1226 reproduction: governed post-delivery retry against `cloud-test-automation`, with no alias creation or branch replacement.
