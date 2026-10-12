### Audit boundary and observed population

The audit authority is the exact `aitm-entered-done` marker in each issue body,
not GitHub closed state, current board state, or `updatedAt`. The inclusive window
starts at 2026-09-01 00:00 America/Chicago (2026-09-01T05:00:00.000Z) and ends at
a frozen audit snapshot on 2026-09-15. A REST issues scan keyed by `since` is
complete for this purpose because writing a Done marker necessarily updates the
issue; pull requests are excluded and the marker timestamp is filtered locally.
The live pre-implementation scan found 74 in-window issues, so the earlier
handful of examples was only a spot-check and cannot stand in for the inventory.

The survey must distinguish commit identity from delivered content. A merge or
rebase can make the accepted source SHA an ancestor of trunk. A squash normally
cannot. For squash, authoritative proof is a merged pull request targeting
`trunk`, correlated source-head evidence, a landed commit reachable from the
frozen remote trunk head, and issue attribution in the landed commit or a valid
AITM delivery receipt. Missing evidence fails closed.

Two live examples establish the boundary. Epic #1178 has an older no-commit
receipt but also has trunk commit `a22c4d21f5f42ff180bf41155bb9bdd948431fd8`;
GitHub associates that commit with merged PR #1478 from `feature/epic/1178` at
accepted head `fbafb718d76a6fc42efa3baeca414f00522298bc` to `trunk`. It is verified
despite predating the current receipt format. Epic #1624 has accepted head
`2158a289a63b27b9b4d08b8701a16f0b9d3e805d`, a local source branch, no delivery
receipt, no associated PR, no attributed landed trunk commit, and no accepted-SHA
ancestry. Its epic no-commit record is not trunk authority under #1632 and must
classify false-Done.

### Existing implementation and gap

`scripts/maintenance/audit-trunk-integration.mjs` is useful historical context
but cannot satisfy this story. It scans a fixed maximum of closed issues, trusts
the informational commit ledger, assumes commit ancestry is the only delivery
shape, hard-codes a machine path, does not inspect PRs or receipts, and produces
no reproducible durable report. Reusing it would misclassify legitimate squash
delivery and miss Done/open split-brain cases.

The new command will instead expose a pure classification core with injectable
GitHub and git ports, plus a CLI adapter. It will fetch all issues updated after
the lookback lower bound, select exact Done markers within a frozen interval,
fetch comments only for selected issues, parse current delivery/no-commit
records, inspect current remote-trunk reachability, and reconstruct older squash
authority through GitHub's commit-to-pull-request association. Results are sorted
by Done timestamp and issue number and rendered to deterministic Markdown.

### Classification contract

The six allowed outcomes are:

- `verified`: a valid receipt and merged trunk PR are mutually consistent, the
  accepted SHA is directly reachable from trunk, or an attributed landed trunk
  commit is correlated to a merged trunk PR whose source head is the accepted SHA.
- `false-Done`: the accepted object and source history are available, but no
  accepted ancestry, attributed landed commit, or authoritative merged trunk PR
  exists. An epic no-commit record never changes this result.
- `indeterminate`: a required marker/object/PR/receipt is absent, malformed,
  contradictory, or unavailable, and the stronger false-Done statement cannot be
  proven.
- `main-thread-exception`: the recorded source branch is configured trunk and
  the issue-attributed accepted work is reachable from the frozen trunk head.
- `explicitly-local-only`: a valid issue-resident delivery record exists for an
  allowed non-epic no-commit kind and there is no code delivery claim to trunk.
- `terminal-disposition-exception`: an explicit superseded/not-planned workflow
  entered Done without claiming delivery; the replacement issue is recorded.

Child stories can be verified through the root epic's attributed landed commit;
they do not need an invented child PR. A valid root PR squash carries all child
attribution tokens, which supplies current trunk evidence while preserving the
two-axis merge-back model.

### Report and recovery authority

The report records the repository, local lookback instant, frozen snapshot,
remote trunk SHA, deterministic inventory count, and one row per issue with the
full accepted SHA, branch, PR, target, merge method, merge SHA, trunk evidence,
classification, evidence links, and recovery issue. The verifier reads the
window and snapshot from the committed report, regenerates live evidence for that
same closed interval, and byte-compares canonical Markdown. It exits nonzero on
inventory drift, evidence drift, duplicate/missing rows, or missing recovery
links.

Every `false-Done` or `indeterminate` row must have a separate governed recovery
issue before verification succeeds. Recovery issues carry a stable
`aitm-delivery-audit-recovery` marker naming audit #1633 and the affected issue;
the audit command discovers that mapping read-only. The audit itself never edits
affected issues, board state, branches, or Git history.

### Files and verification

- `scripts/maintenance/audit-done-delivery.mjs`: pure selectors,
  classification, deterministic renderer, and read-only GitHub/git CLI adapter.
- `scripts/tests/integration/maintenance/done-delivery-audit.test.mjs`: fixture
  coverage for inventory bounds, direct ancestry, squash reconstruction,
  issue-resident exceptions, epic false-Done, fail-closed contradictions,
  recovery completeness, and report verification drift.
- `docs/audits/2026-09-15-done-delivery-14-day-survey.md`: frozen live survey.
- `docs/superpowers/specs/2026-09-15-1633-done-delivery-audit-design.md` and
  `docs/superpowers/plans/2026-09-15-1633-done-delivery-audit.md`: governed
  design and executable plan.

Implementation follows test-driven development: fixture failures first, then the
smallest classifier/adapter implementation, live snapshot generation, governed
recovery issue creation, report regeneration, focused/full verification, review,
and PR delivery to trunk.

### Risks and mitigations

The chief risk is false certainty from a plausible but uncorrelated squash. The
classifier requires a merged trunk PR and source-head/issue-attribution
correlation; title similarity or patch similarity alone never passes. Another
risk is a moving audit population, so the snapshot is frozen and verification
reuses it. GitHub or git lookup failures become `indeterminate`, never Delivered.
The command is read-only and uses argv-based child processes, validating issue
numbers, refs, and SHAs before invoking git.

No additional implementation sibling is needed. Governed recovery stories are
created only after the live classifier identifies their exact affected issues.

### Dependency map

Depends on: #1632 merged to trunk (complete at `cc3a8307644be8af3b84194c236168e26c506a47`).

Blocks: truthful recovery of #1624 and resumption of #1631.
