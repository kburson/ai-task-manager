# Immutable artifact acceptance

Use `--artifact-commit <full-commit-sha>` when the controller checkout has advanced beyond the source being accepted. The selector resolves a Git commit and its tree. It leaves the actual operator session, bound issue, worktree, branch and HEAD unchanged.

Repeat the same selector on each acceptance command: `commit-trace`, `ac-stamp`, `dod-stamp`, `promote` or `test`, `review`, `approve`, `deliver` and `close`. Read-only `explain` accepts it as well. Ordinary session, issue-editing and planning commands continue to operate on the actual controller.

Verification executes artifact files in detached worktrees under the existing verification-sandbox namespace. Fingerprints use that source's lockfile and configuration bytes. Receipts retain the real execution checkout separately from the operator context and artifact commit/tree. A receipt produced with explicit selection requires that selection for reuse. Omitting the selector preserves current-HEAD acceptance for ordinary receipts.

The native issue binding must match the actual session, root and branch. Changed source, tree, operator HEAD or binding refuses acceptance; re-establish genuine current evidence through the native workflow. A copied receipt, substituted SHA or controller fingerprint cannot establish artifact acceptance.

Delivery finds the unique exact-head PR independently of the controller branch and validates its source tree. Required review, approval, CI, attribution and merge-content checks still apply. An already merged PR uses the existing external-delivery reconciliation route; it is not merged again.

Explicit-source Review probes and directory/evidence-v2 authority are unsupported in this R0 adapter. They must not silently execute against the controller or activate R1. No identity override, controller checkout move or new authority store is part of this route.
