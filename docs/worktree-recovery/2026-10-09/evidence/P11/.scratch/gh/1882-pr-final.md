Child integration ignored project verification and launched all host suites, then removed the checkout needed for completion. This change runs the validated project Test plan and issue declarations, preserves Node defaults, and adds `--preserve-worktree` for completing approval and closure from the child checkout.

Integration runs in the authoritative parent checkout, pins the tested commit, and refuses failed evidence, source changes, malformed configuration, or changed parent checkout before merging. Stale CI evidence requires pushing the rebased child and obtaining fresh CI receipts. Real-Git fixtures run in the integration lane; the package allowance accounts for exactly two required runtime helpers.

Validation: genuine red-to-green regressions; all 60 affected merge-back and boundary cases pass. Complete CI, all seven collection workers, both npm/Node packaging checks, CodeQL, lint and format are green at `482a7ace68070d628050952bce8c61eba5c9435f`: [CI run](https://github.com/kburson/ai-task-manager/actions/runs/37248866828). All nine expected worker/aggregate artifacts are available. Canonical Test is consuming these receipts; local TIA executes only selected files.

Refs #1882
