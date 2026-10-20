# #2073 plan SAR round 3

Reviewed input: plan.r2.md, SHA256 `cdf38290f5d68407e0dddf1a434e32af11919a314f9dd8a6ca98d7203e24e2c3`. Read the entire 650-line document in three nontruncated ranges. Rechecked source scratch-root resolution, existing fixture isolation, native hook and plan-exit consumers, kind enum, publication statuses and complete authority boundaries. Accepted spec and owner budget decision remain the requirement baseline.

P2073-08 through P2073-11 are substantively addressed: valid code and absent-marker populations; graph inventory and 51-child proof; complete runnable examples and provider-level target helper; unique task Story Intent headings. Canonical targeted markdownlint passed and Prettier formatted before r2 snapshot. The map's final report row is accidentally separated from its table by a blank line; repair this minor presentation defect with the next revision under P2073-10's file-map disposition.

## New actionable findings

### P2073-12 — High: fixture filesystem/session isolation must be explicit

The new complete examples allocate ordinary scratch directories, but production authority/ownership paths can walk to the repository main worktree. scratch-dir.mjs documents that plain temporary directories are not Git isolation; existing estimation-publication.mjs injects findMainWorktreePath, and native binding fixtures create their own state root. The plan's generic filesystem-port allowance is not sufficient to prevent an implementer accidentally using live session and lock state while running real collectors. Specify controlled runtime root and session environment, deps.decomposition.findMainWorktreePath returning the fixture directory for in-process publication, and existing isolated binding fixtures for native subprocess smoke. Assert all writes and locks remain under the fixture; do not substitute policy success.

### P2073-13 — Medium: paired success assertions must not cover intentional stricter refusal fixtures

Task 3 says run every fixed fixture and check successful outcomes before budgets. Some fixtures deliberately contain malformed kinds/blocks or structural inconsistency, for which optimized source must refuse even when baseline accepted. Limit equivalent-success and dispatch-savings assertions to the named valid success populations; run adverse fixtures against both for documented behavior comparison but assert specified optimized refusal and no unauthorized writes. A baseline failure cannot win a successful comparison, and baseline acceptance of malformed data cannot force the new safety checks to be removed.

## Estimate and verdict

The 6.5h budget remains an owner decision with material 6–9h risk. Isolation uses existing seams and fixtures, not a new production architecture. These clarifications neither prove the estimate nor expand authorization into implementation.

Verdict: revise two new findings and the P2073-10 presentation follow-up. Unique findings13. No product tests or baseline runs occurred; only documentation checks and local source reads.
