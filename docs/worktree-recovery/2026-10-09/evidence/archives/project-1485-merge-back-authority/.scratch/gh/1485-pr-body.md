Refs #1485

Governed merge-back could not deliver a child into a parent epic recorded on a
custom branch. It synthesized `feature/epic/<N>`, which does not exist for #1220
(authoritatively recorded on `cloud-test-automation`), blocking #1226 from
obtaining an exact-head delivery receipt despite completed implementation,
verification, review, and approval.

## Three defects, all fixed

1. `merge-back.mjs` called `parseBranchName(epicBranch).issue` to recover the
   epic's issue number. A custom branch is an intentionally opaque ref that the
   managed `feature/<role>/<N>` grammar cannot parse, so this threw
   `TypeError: Cannot read properties of null (reading 'issue')`.
2. The production graph adapter never fetched the parent issue body, so
   `parentAuthoritativeBranch` was never populated — merge-back would have
   targeted a nonexistent ref even without the crash.
3. `main` wired `graph: () => node`, a constant single-node graph, so
   `resolveEpicLineage(epicIssue, ...)` read the CHILD's node when asked about
   the epic.

## Approach

Numeric issue identity and opaque branch authority are kept separate.
`resolveEpicLineage` gains an additive `parentIssue` field carrying the graph
node's numeric parent; merge-back reads that instead of parsing a ref. Two new
pure boundaries in `merge-back.mjs` — `buildMergeBackGraphNode` (maps parent,
children, and parent-body authority, emitting at most one authority outcome) and
`loadMergeBackGraph` (prefetches the child and immediate-epic nodes into a map
keyed by issue number, failing closed on any other lookup).

Canonical `feature/epic/<N>` fallback is preserved for a parent with no recorded
branch. Malformed or ambiguous authority becomes `parentAuthorityError` and
refuses through the existing fail-closed lineage path before any Git or
test-runner call. The rebase, exact-head testing, `--ff-only` merge, and
success-only cleanup ordering are unchanged.

## Verification at `94575a4a`

- Focused verifier: 47/47 pass
- Full Unit, Integration, and Slow lanes: green in the governed Test sandbox
- `npm run lint` exit 0, `npm run format:check` exit 0
- 45/45 on the four other branch-authority consumers, unchanged
- New real-Git regression merges a child into a custom-named epic branch and
  asserts no `feature/epic/<N>` alias is ever created

## Follow-up

#1486 tracks consolidating the five duplicated graph-node authority adapters,
deliberately deferred by this issue's design spec (Approach 3).
