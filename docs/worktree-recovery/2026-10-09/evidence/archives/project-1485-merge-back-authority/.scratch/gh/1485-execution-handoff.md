## Execution Handoff

### Immediate objective

Implement and deliver #1485 first. It is the deepest blocker for approved child #1226 and therefore for the serial #1220 child chain.

### #1485 authority

- State: Plan; plan approval has not yet been recorded.
- Worktree: `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1485-merge-back-authority`
- Branch: `codex/defect-1485-merge-back-authority`
- Head: `acf63c162579cb8a21f72d5c1705b8bdba5c6710`
- Base: `origin/trunk` at `e5b3060cb27caf92239f05ca5552f364d500eec7`
- Local delta: two committed planning artifacts; branch is not pushed.
- Spec: `docs/superpowers/specs/2026-09-02-1485-merge-back-custom-epic-branch-authority-design.md`
- Plan: `docs/superpowers/plans/2026-09-02-1485-merge-back-custom-epic-branch-authority.md`
- Plan estimate: M / 3 hours; forecast record `01M1HCG2VAJQD5ZJW8D6SQBNBA`.
- Baseline: `npm test` passed all 811 fast-lane files at the trunk base before plan edits.

The new session must review the exact committed plan, obtain explicit human plan approval, run `npx aitm plan-approve 1485`, and only then promote to Develop and execute serially with TDD. Do not create an alias epic branch or parse a custom branch for issue identity.

### Root cause boundary

The repair requires all three parts already captured in the plan:

1. Supply durable parent branch authority to merge-back graph nodes.
2. Preserve numeric parent issue identity separately from the opaque branch ref.
3. Prefetch both the child and immediate-epic nodes before synchronous lineage resolution.

Authority or graph failures must occur before any Git or test-runner call. Existing rebase, bounded test, fast-forward-only, and success-only cleanup gates remain unchanged.

### #1220 retained authority and child order

- #1220: Develop, branch/worktree `cloud-test-automation` at local and remote `616c7a8fcb1b798ee0c590510318c5aac86d5626`.
- #1226: Review and approved, blocked by #1485, branch/worktree `feature/child/1226` at local and remote `ed9ae834d43fda0b3abf2a8c52cc6394befb1c22`.
- #1227: Ready for Planning, Rank 2.
- #1228: Ready for Planning, Rank 3.

Execute strictly serially: #1485 -> #1226 recovery and Done -> #1227 -> #1228 -> #1220 reconciliation, verification, review, approved delivery, and Done.

After #1485 lands on trunk, synchronize the retained #1220 and #1226 branches through governed workflows. Because #1485 changes test blobs, recapture #1226's exact-head Unit, Integration, and Slow timing artifacts, normalized fixture, and calibration-input digest before retrying its merge-back, delivery receipt, and close. Do not reuse its current baseline after synchronization.

Before every mutation, refresh live GitHub state, exact refs, ancestry, worktree dirtiness, and dependency fields. Preserve every recorded worktree and unrelated user change. Use only sanctioned AITM state, issue, delivery, and close commands.
