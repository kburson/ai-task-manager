### Incident and policy boundary

Epic #1624 reached Review on local branch `feature/epic/1624` at accepted SHA
`2158a289a63b27b9b4d08b8701a16f0b9d3e805d`. AITM then wrote a completed
`aitm.delivered-close/v1` transaction, moved the board item to Done, and closed
the GitHub issue. Fresh evidence shows that SHA is not an ancestor of
`origin/trunk`, its tree differs from trunk by 91 files, all eight branch commits
remain patch-unique, no remote branch exists, no pull request exists for the
branch, and GitHub does not know the accepted SHA. The lifecycle record therefore
describes a delivery that never occurred.

The defect is narrower than a generic failure to inspect git. AITM already has a
strict merged-PR delivery receipt and fresh trunk verification for ordinary
top-level code work. Two independent role-specific exceptions let this root epic
avoid that authority:

1. `scripts/task-tracker/lib/issue-kind.mjs` includes `epic` in the no-commit
   kinds because an epic coordinates child commits rather than authoring a new
   epic-only commit. `requireDeliveryReceipt()` in
   `scripts/task-tracker/lib/close-delivery-receipt.mjs` applies that classification
   without considering lineage. A top-level epic with no PR can therefore satisfy
   close using only an `aitm-deliverable-posted` marker and a no-commit receipt.
2. `lineageDoneGate()` in
   `scripts/task-tracker/lib/close-gates-lineage.mjs` checks a surviving epic's
   derived child trail on the epic branch itself. That is correct for a nested
   epic whose parent branch is another epic, but it is insufficient for a root
   epic: its parent delivery target is trunk. The check never proves that the
   root epic branch was merged upward.

Full-Auto did not invent the defect; it exercised these two accepted paths. The
review bypass controls human approval only. The delivery gate runs separately
and is intentionally not bypassable by Full-Auto or `--force`, so repairing the
role classification and target branch closes the failure at the authority
boundary rather than adding another behavioral warning.

### Scope validation and semantics

The existing two-axis model deliberately permits a child story to become Done
after verified integration into its immediate epic parent branch. This repair
does not collapse that workflow. It restores the model's own root invariant:
the parent branch of a root epic is trunk, and delivery into trunk is PR-gated.
A nested child or nested epic continues to use governed merge-back to its parent
branch; a root epic and a standalone feature branch must use `/task deliver` and
must present an authoritative merged-PR receipt targeting configured trunk before
`/task close` can write any terminal state.

The no-commit lane remains valid for an audit, research item, or spike whose
declared deliverable is an issue-resident artifact. An epic is different: although
it has no epic-only commit, its deliverable is the aggregate child history on its
branch. At a root boundary that aggregate is commit-bearing delivery and cannot
be represented by a posted-comment receipt. The special case belongs in the
delivery receipt gate, not in the global issue-kind taxonomy, because develop and
test still correctly treat epics as coordination/no-commit items.

An explicitly configured local-trunk lane remains valid only when the current
branch is the delivery target itself and operator authorization is present. A
feature or epic branch is not transformed into a main-thread lane merely because
no PR can be found. Missing, ambiguous, open, wrong-base, wrong-head, or stale PR
evidence must refuse before a delivered-close transaction is created.

### Files to edit

- `scripts/task-tracker/lib/close-delivery-receipt.mjs` — make the no-commit
  receipt exception lineage-aware. A top-level epic must fall through to the
  ordinary merged-PR receipt contract; other no-commit kinds retain their current
  artifact delivery behavior, and nested epic delivery retains parent integration.
- `scripts/task-tracker/lib/close-gates-lineage.mjs` — resolve the delivery target
  for an epic just as for a leaf. Assert the derived child trail on the nearest
  surviving parent branch; for a root epic this resolves to configured trunk,
  while a nested epic resolves to its surviving parent epic branch.
- `scripts/task-tracker/lib/close-gates.mjs` — update the close-gate contract and
  result comments so they no longer claim that a surviving epic branch is itself
  sufficient for root Done.
- `scripts/tests/integration/task-tracker/verbs/close-trunk-delivery-gate.test.mjs`
  — add the #1624-shaped regression: root epic, accepted feature SHA, posted
  deliverable, no PR, Full-Auto approval, and local child trail must refuse. Also
  prove a correlated merged PR to trunk passes and explicit non-epic no-commit
  artifacts remain supported.
- `scripts/task-tracker/lib/close-gates-lineage.test.mjs` — update epic cases to
  assert parent-target resolution, including root-to-trunk and nested-to-parent.
- `docs/guides/workflow.md` and any directly affected command help text — state
  that a root epic's Done target is trunk and posted epic deliverable evidence
  cannot replace trunk PR delivery.
- `docs/superpowers/specs/2026-09-15-1632-require-trunk-delivery-before-done-design.md`
  and `docs/superpowers/plans/2026-09-15-1632-require-trunk-delivery-before-done.md`
  — preserve the corrected contract and executable implementation sequence.

### Step-by-step implementation plan

1. Write failing characterization tests against `requireDeliveryReceipt()` for
   the exact root-epic/no-PR shape and against `lineageDoneGate()` for a surviving
   root epic branch whose child trail is absent from trunk. Confirm both tests
   fail for the current permissive behavior.
2. Add a small explicit predicate for when no-commit artifact delivery is allowed.
   It must accept genuine no-commit kinds, but reject `epic` when the epic has no
   parent. Keep the current nested-child early return and local-trunk authorization
   rules intact.
3. Change the epic lineage path to compute `resolveDoneTargetBranch()` before
   calling `epicDerivedTrailGate()`. Use that returned parent target regardless of
   whether the epic branch still exists. This makes root epic evidence read trunk
   and nested epic evidence read the parent epic branch.
4. Run the focused tests and inspect refusal categories. The no-PR case should
   fail as `close-delivery-receipt:ambiguous-pr` before terminal mutation, and the
   lineage gate should fail with the existing child-trail-incomplete evidence
   naming the missing children on trunk.
5. Add the successful merged-PR case, wrong-base/head cases as needed, and
   regressions for audit/research/spike artifact delivery plus the operator-
   authorized main-thread lane. Avoid a second parallel delivery model.
6. Update documentation and code comments, then run format, lint, unit,
   integration, slow, and package checks through the issue's declared verification
   commands.
7. Deliver #1632 through a PR to trunk. Only after the guard itself is on trunk,
   recover #1624 using its preserved accepted branch: publish the exact branch,
   open and merge a governed PR, verify the resulting trunk content, and use the
   supported reopened-close recovery path rather than fabricating historical
   markers.
8. Execute #1633's full 14-day audit and create governed recovery issues for any
   additional false-Done or indeterminate records before #1633 closes.

### Test additions and evidence mapping

The new integration test named in root verification command vc:1 is the primary
behavior proof. It covers refusal before terminal mutation, Full-Auto
non-bypassability, valid merged/squash receipt acceptance through the existing
fresh verifier, and preservation of explicit artifact/main-thread exceptions.
The existing lineage unit suite provides branch-target arithmetic coverage. The
full unit, integration, slow, lint, format, and package commands protect the
broader delivery/recovery machinery. Recovery of #1624 is independently proven
by root verification command vc:3 after the #1632 PR is merged.

### Risks and mitigations

The largest risk is accidentally removing `epic` from the global no-commit kind
set, which would break epic Develop/Test because a coordination epic has no
epic-only commit. The fix therefore branches only at close-delivery authority.
Another risk is checking the epic branch after merge and reporting a false pass;
the lineage gate must always inspect the resolved parent target. Squash delivery
rewrites SHAs, so success must continue to use the existing correlated PR receipt,
source-commit evidence, merge-commit inspection, and trunk verification instead
of naïve accepted-SHA ancestry. Finally, #1624's local branch is irreplaceable
accepted history; no cleanup, rebase, or amendment is allowed before its recovery
PR is created and verified.

No new sibling issue is required for the bounded guard repair. The historical
survey is already separated as #1633 because it has its own durable report,
inventory completeness proof, and potentially many recovery outcomes.

### Dependency map

Depends on: none for implementation; #1624 recovery depends on #1632 reaching trunk.

Blocks: #1624 truthful recovery, #1631 package-boundary work, and #1633's final
classification/recovery closure.
