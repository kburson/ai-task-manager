## Deep-Dive Analysis

### Story Intent
- **Beneficiary:** release operator
- **Capability:** integrate an already synchronized child at its reviewed commit
- **Need:** unnecessary rebase destroys its accepted merge ancestry
- **Value or failure prevented:** accepted history and exact verification remain intact during fast-forward delivery

### Observed Root Cause and Bounded Design
The current mergeBack protocol guards opportunistic parent/grandparent synchronization with isAncestor, but unconditionally calls worktreeGit(['rebase', epicBranch, childBranch]) for the child. Rebase can flatten a reviewed merge-containing child even when the parent already belongs to its ancestry. This is the reported #144 failure and is supported by current source at trunk dab9548a5836f958b7abcf623f8c7447e2eaabca.

Use the existing ancestry predicate against the authoritative parent and child refs from inside the child worktree. If the parent is already an ancestor, retain the existing child commit and topology; otherwise use the existing rebase/conflict path unchanged. Keep the exact HEAD pin, configured verification, post-verification HEAD check, parent checkout authority checks, fast-forward-only merge and preserve/cleanup semantics. No runtime package patch, alternate strategy, graph rewrite, timeout change or receipt waiver is included.

### Real-Git Verification Plan
Extend the existing registered CLI integration fixture with a genuine side branch and --no-ff merge. Record the reviewed merge SHA and its second parent before calling runMergeBackCommand with its real Git and project-provider runner. Require verification to observe the original SHA, parent integration to reach that same SHA, and the second parent/worktree/upstream to remain intact. Watch this fail before source changes.
Also prove a divergent nonconflicting child still rebases and a conflicting child still refuses before verification/integration. Retain existing real provider failure, parent checkout/verification race, source-change and pinned-head unit coverage. Adapt command-only unit fixtures to distinguish grandparent ancestry from child ancestry so their existing divergent cases remain meaningful.

### Implementation and Verification Boundary
The implementation plan is docs/superpowers/plans/2026-10-06-1902-preserve-merge-history.md. Changes are bounded to merge-back.mjs and the existing unit/CLI integration test files, plus the plan itself. Run only the three issue-declared affected files on host, full lint/format/diff checks, and exact-head full suites on hosted CI. Native AC evidence is actual command execution, distinct from test-fixture verification. Root owns serialized Test, Review, approval, integration and Close.

### Seven-Question Semantic Review
Stakeholder: release operator is a concrete operational beneficiary. Capability: preserving a reviewed child while integrating it is a safeguard, not an administrative task. Need: unnecessary rebase destroys accepted merge ancestry. Counterfactual value: exact accepted history and verification survive delivery. Source grounding: issue Scope, recorded #144 reproduction and the inspected merge-back implementation support every claim. Sibling distinctness: this is merge-back synchronization, distinct from historical AC-heading and verification-provider defects. Standalone readability: the three-line story names the condition, behavior and avoided failure without a plan dependency.

### Author Plan Review
The single ancestry guard changes only an unnecessary synchronization operation. Real Git positive evidence exercises merge topology; existing and new negative paths keep verification/authority/head-race refusals. Full-Auto Plan approval is an AI author decision under existing user authorization, not human approval or acceptance of operational runtime activation.
