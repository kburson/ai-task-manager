# Writing Studio AITM Cleanup

Plan: `docs/superpowers/plans/2026-08-25-writing-studio-aitm-cleanup.md`

Execution baseline: `dd1705d6922465b92017dc88a24c46cb6d0d9efc`

- [x] Task 1: Prove the cross-repository cleanup gate — complete at
      `dd1705d6922465b92017dc88a24c46cb6d0d9efc` (verification only; review clean)
- [x] Task 2: Validate active frozen-retirement receipts — complete
      (`dd1705d6..da60e417`, review clean)
- [x] Task 3: Hydrate graduated receipts from canonical history — complete
      (`da60e417..ad436f78`, review clean; cohesive test file accepted at 797/800 lines)
- [ ] Task 4: Reconcile active membership without changing frozen data
      Implementation `ad436f78..e15d5fbc` is review-clean, but completion is
      blocked by canonical `origin/trunk` CI failure in the unchanged #1413
      lane-correction provenance assertion. Task 5 has not started.
- [ ] Task 5: Add the atomic graduation command
- [ ] Task 6: Add the weekly cleanup pull-request workflow
- [ ] Task 7: Teach test-impact selection about retirement authority
- [ ] Task 8: Create the four pilot receipts and remove the migrated subsystem
- [ ] Task 9: Run complete verification and prepare delivery
- [ ] Task 10: Verify canonical delivery and observe the first weekly PR
