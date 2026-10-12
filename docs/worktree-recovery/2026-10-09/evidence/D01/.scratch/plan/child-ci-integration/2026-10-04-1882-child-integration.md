# #1882 Child integration verification repair

**Goal:** Honor configured project verification during child merge-back and preserve the completion checkout when requested.
**Authority:** Issue1882 Scope, AC and its published/mirrored Deep-Dive Analysis. Sole owner; no delegation. Full suites are CI-only; host runs affected tests.

## Story Intent

- **Beneficiary:** A maintainer delivering an approved child change into its parent integration branch
- **Capability:** Verify child integration through the project's configured verification policy and retain its completion checkout
- **Need:** The runner launches full host suites and removes the workspace before exact-head completion
- **Value or failure prevented:** Integrate verified changes without host-policy violations or lost completion state

## Task 1: Repair registered child integration

**Files:** scripts/task-tracker/merge-back.mjs; its focused regression file and a small verification helper if needed; registered CLI help and relevant workflow documentation.

1. Read the delivered baseline and existing graph/provider/cleanup contracts in the dedicated worktree.
2. Write regressions for checkout preservation and configured provider execution, including failed evidence refusing merge/cleanup. Use a real temporary project command where possible; retain graph and default Node coverage.
3. Run the affected regression files. Expected: real assertion failures for missing provider/preservation behavior. Preserve logs and exact source snapshot.
4. Implement the minimum provider-aware runner and explicit preservation option. Validate rejected argv/configuration before mutation; retain fail-closed verification. Route parent Git through its authoritative checkout when it already exists rather than trying to check it out in the child.
5. Run affected tests, lint and format. Expected: successful exits with no skipped or cancelled relevant tests.
6. Commit with issue1882 attribution; create PR with Refs1882 and obtain full CI receipts for that exact SHA.
7. Run genuine canonical Test, Review, approval and provider delivery using CI receipts and host affected tests only. Repack actual delivered source for consumer140.

## Review Focus

Graph-derived branch/path authority; parent checkout placement; rebase invalidates previous CI proof; failure cannot integrate or clean up; setup and verifier cannot leave mutated HEAD/source; preservation retains upstream; default suites/cleanup remain compatible. Final review is the owner's separate inspection under the user's no-agent instruction.
