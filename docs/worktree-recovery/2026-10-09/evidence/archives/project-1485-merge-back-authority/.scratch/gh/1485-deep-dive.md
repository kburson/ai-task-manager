### Files to edit

- `scripts/task-tracker/merge-back.mjs` — enrich the production graph loader, keep issue identity separate from opaque branch authority, and preserve the operational merge protocol.
- `scripts/task-tracker/lib/resolve-epic-lineage.mjs` — return the already-resolved numeric parent issue so merge-back never tries to recover identity from an opaque custom branch ref.
- `scripts/tests/unit/task-tracker/merge-back.test.mjs` — cover adapter mapping, custom-branch routing, canonical fallback, malformed/ambiguous authority, and pre-mutation refusal.
- `scripts/tests/unit/task-tracker/lib/resolve-epic-lineage.test.mjs` — pin the additive numeric parent-issue result for child, nested-epic, root-epic, and story roles.
- `scripts/tests/slow/task-tracker/lib/epic-tree.test.mjs` — prove a real child worktree merges into a custom-named epic branch without an alias.

The authority parser in `scripts/task-tracker/lib/issue-worktree-location.mjs` already provides the required fail-closed semantics and should not change. The lineage resolver needs only an additive identity field; its branch-role and authority behavior remains unchanged.

### Step-by-step implementation plan

1. Add failing lineage tests showing that the resolver returns the numeric parent issue independently of the resolved branch ref.
2. Add failing adapter-level tests showing that the production merge-back graph loader carries a valid parent `aitm-worktree-location` branch into `parentAuthoritativeBranch` and prefetches both the child node and its immediate epic node.
3. Add failing cases for no authority, malformed authority, and same-timestamp ambiguous authority; assert invalid authority is represented as `parentAuthorityError` and reaches the existing fail-closed lineage path before any injected Git function is called.
4. Extend the merge-back production adapter to fetch each node's parent body and resolve it with `resolveCurrentIssueWorktreeBranch`; omit the authority field when no marker exists and preserve the existing parent/children graph shape.
5. Replace merge-back's `parseBranchName(epicBranch).issue` assumption with the resolver's numeric parent issue, and use the prefetched immediate-epic node for grandparent resolution. Branch authority stays opaque and is never parsed for identity.
6. Add a real-Git regression that creates a custom-named epic branch, cuts a child from that exact branch, commits child work, and merges back into the custom branch with tests and fast-forward cleanup still enforced.
7. Run the focused verifier, Develop verification, complete Unit/Integration/Slow lanes, lint, and formatting in the governed stages.
8. Deliver #1485 to trunk, rebase the retained #1220 and #1226 branches onto the repaired trunk, then recapture #1226's exact-head baseline because the changed test blobs invalidate its calibration-input digest before retrying merge-back and close.

### Test additions

- `scripts/tests/unit/task-tracker/merge-back.test.mjs` — adapter authority extraction and zero-Git-mutation refusal coverage, plus canonical fallback compatibility.
- `scripts/tests/unit/task-tracker/lib/resolve-epic-lineage.test.mjs` — numeric parent identity stays available when branch authority is custom and non-parseable.
- `scripts/tests/slow/task-tracker/lib/epic-tree.test.mjs` — real Git merge-back into a recorded custom parent branch with no synthesized alias.

The four existing root acceptance criteria already cover these behaviors and cite the focused verifier, so no additional root criterion is required.

### Identified risks

- Fetching only the child graph without the parent body would reproduce the current bug; the adapter query boundary must explicitly include parent authority evidence.
- Reusing the child node for the immediate epic lookup corrupts grandparent resolution; the production loader must prefetch and key both nodes by issue number.
- Parsing the authoritative branch to recover an issue number fails for every noncanonical branch by design; numeric graph identity and opaque branch authority must remain separate.
- Silently converting malformed authority to no authority would revive the nonexistent canonical fallback; parse failures must be preserved as `parentAuthorityError` or thrown before Git is invoked.
- Resolving authority after rebase or checkout would violate the no-mutation refusal guarantee; graph construction and lineage resolution must remain ahead of all Git operations.
- The repair's test changes alter #1226's calibration-input digest. Its checked-in timing fixture cannot be reused after trunk synchronization and must be recaptured at the new exact implementation head.
- Broadly centralizing every graph adapter would enlarge the defect and risk unrelated lifecycle behavior; this issue remains limited to merge-back.

### Sibling sub-issues to spawn

None. This is one atomic production-adapter repair and its focused regression coverage.

## Dependency Map

Depends on: none

Blocks: #1226 (approved child cannot obtain an exact-head delivery receipt or close); transitively #1227 and later #1220 work
