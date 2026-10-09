1. Use the main AITM checkout and inspect `.tmp/aitm/fleet/co-review-index.json`.
2. Observe that many rows remain marked active, including test-sandbox and historical-worktree paths that no longer exist.
3. Run the package migration removal guard.
4. Observe that it refuses on an active legacy review before it can evaluate the remaining production consumers.
