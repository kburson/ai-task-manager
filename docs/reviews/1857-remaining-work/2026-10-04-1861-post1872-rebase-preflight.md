# #1861 post-#1872 rebase preflight

Status: blocked before native rebase. No rebase, branch push, candidate activation, build, Test stamp or new CI run has been performed. This is Git/source and lifecycle preflight evidence, not acceptance or delivery.

## Verified source and delivery

- PR #1875 merged into trunk at 2026-10-04T17:45:56Z.
- Trunk and the merge commit are identical: `3321c2256e577d8609c3979aa76391d0ae5c4c35`. GitHub compare returned ahead=0, behind=0, status=identical.
- Actual native workspace: `/Users/kpburson/.codex/worktrees/8dae/ai-task-manager`; actual branch: `codex/1857-continuation`.
- #1861 HEAD and PR #1871 head: `aaeaedfc11246a25828ffe0cf506ff35fdca8486`.
- PR #1871 base `feature/epic/1857/parent` remains `171c7d93866f67b58effa635be5ae737f54ef9eb`.
- Common ancestor is that same `171c7d93` commit. The branch contains 27 #1861 commits; delivered trunk contains one additional squash commit.
- Scoped control and native hooks still resolve to `.scratch/1857-delivered-control`, separate from the unfinished candidate.
- Genuine current session `01a10321-abd4-7982-b7ce-73cb6f603283` resumed #1861. The control returned a timing-publication readback warning: the resumed row was queued, not posted. No replacement actor or invented timing evidence was supplied.

## Preservation and rebase blockers

All 349 protected pre-existing paths match the retained preservation baseline, including file bytes, modes and symlink targets. The cached rename patch and both protected refs remain exact. Current status contains 318 tracked dirty paths; 38 of the 106 incoming trunk paths overlap that retained WIP.

The sole staged change remains the actor-flush-journal test rename from unit to integration. An ordinary in-place rebase requires resolving the staged/unstaged workspace condition. The user prohibits reset, stash, clean, broad staging and loss of this index/WIP. No automatic stashing or cleanup was attempted.

A separate epic integration decision is also needed: rebasing the child onto current trunk while leaving the epic base at the old commit makes #1872's source appear in the child's PR diff. Do not claim those changes as #1861 or silently retarget the PR to trunk.

Recommended authorized route to prepare: preserve 8dae unchanged; use an additional clean completion worktree with genuine native chat/binding alignment; fast-forward the epic parent base to delivered trunk through the authorized integration route; rebase the 27 C1 commits, resolve overlapping hunks retaining both contracts, and verify the exact resulting candidate. Working in a different shell directory alone does not change native authority. Creation/assignment and the shared parent update require the maintainer's explicit decision.

Preservation readback:

```json
{
  "head": "aaeaedfc11246a25828ffe0cf506ff35fdca8486",
  "indexPreserved": true,
  "cachedPatchSha256": "0e4a5b53347eff37d7c4d7731d5c49c912507e787d152fab9e0e88b42cc1c8e5",
  "protectedRefs": {
    "refs/codex/snapshots/232c87b2fd75d966c874bf2b4db40e126d3826ce": {
      "expected": "65e6887426307247770a9ce08e7642abc50c73e8",
      "actual": "65e6887426307247770a9ce08e7642abc50c73e8"
    },
    "codex/1857-draft": {
      "expected": "d4c42d7809c22acc9576d51da8938952588c207e",
      "actual": "d4c42d7809c22acc9576d51da8938952588c207e"
    }
  }
}
```

### Incoming paths overlapping retained WIP

- `cspell-dictionary.txt`
- `scripts/maintenance/capture-guidance-lifecycle.mjs`
- `scripts/task-tracker/lib/action-decision/legacy-refusals.json`
- `scripts/task-tracker/lib/artifact-write-policy.mjs`
- `scripts/task-tracker/lib/command-surface/catalog.mjs`
- `scripts/task-tracker/task-tracker.mjs`
- `scripts/task-tracker/verbs/help-data.mjs`
- `scripts/tests/fixtures/1558/admission-surface.json`
- `scripts/tests/helpers/capture-guidance-release.mjs`
- `scripts/tests/helpers/runtime-root-fixture.mjs`
- `scripts/tests/integration/task-tracker/lib/guidance-recertification.test.mjs`
- `scripts/tests/slow/task-tracker/lib/ac-evidence-gate.test.mjs`
- `scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs`
- `scripts/tests/slow/task-tracker/lib/agentic-help-runtime.test.mjs`
- `scripts/tests/slow/task-tracker/lib/cli.test.mjs`
- `scripts/tests/slow/task-tracker/lib/coverage-hook-handler.test.mjs`
- `scripts/tests/slow/task-tracker/lib/create-issue.test.mjs`
- `scripts/tests/slow/task-tracker/lib/dirty-review-promote-false-success.test.mjs`
- `scripts/tests/slow/task-tracker/lib/dirty-workspace-gate.test.mjs`
- `scripts/tests/slow/task-tracker/lib/discover-autosave.test.mjs`
- `scripts/tests/slow/task-tracker/lib/ensure-wave-parent.test.mjs`
- `scripts/tests/slow/task-tracker/lib/gates.test.mjs`
- `scripts/tests/slow/task-tracker/lib/lifecycle.test.mjs`
- `scripts/tests/slow/task-tracker/lib/log-issue-time.test.mjs`
- `scripts/tests/slow/task-tracker/lib/move-state-approval-gate.test.mjs`
- `scripts/tests/slow/task-tracker/lib/move-state-gate.test.mjs`
- `scripts/tests/slow/task-tracker/lib/move-state.test.mjs`
- `scripts/tests/slow/task-tracker/lib/proof-gate-reconciliation.test.mjs`
- `scripts/tests/slow/task-tracker/lib/review-approval-prompt.test.mjs`
- `scripts/tests/slow/task-tracker/lib/verb-preflight-wiring.test.mjs`
- `scripts/tests/slow/task-tracker/lib/worktree-isolation.test.mjs`
- `scripts/tests/slow/task-tracker/verbs/promote-verb.test.mjs`
- `scripts/tests/slow/task-tracker/verbs/recovery-path-independence.test.mjs`
- `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`
- `scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs`
- `scripts/tests/unit/task-tracker/lib/state.test.mjs`
- `scripts/tests/unit/task-tracker/verbs/coverage-promote.test.mjs`
- `scripts/tests/unit/task-tracker/verbs/pull-next-verb.test.mjs`

## Git conflict preflight

`git merge-tree --write-tree --messages origin/trunk HEAD` ran against the actual committed tips. It wrote Git objects only; it did not change source files, index, HEAD or branch refs. Exit 1 means conflicts. This is a final-tree merge preflight; it is not execution of, or a guarantee about, the sequential rebase.

The preflight found 25 conflicted paths:

- `cspell-dictionary.txt`
- `scripts/task-tracker/lib/artifact-write-policy.mjs`
- `scripts/tests/integration/task-tracker/lib/guidance-recertification.test.mjs`
- `scripts/tests/slow/task-tracker/lib/ac-evidence-gate.test.mjs`
- `scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs`
- `scripts/tests/slow/task-tracker/lib/cli.test.mjs`
- `scripts/tests/slow/task-tracker/lib/coverage-hook-handler.test.mjs`
- `scripts/tests/slow/task-tracker/lib/create-issue.test.mjs`
- `scripts/tests/slow/task-tracker/lib/dirty-review-promote-false-success.test.mjs`
- `scripts/tests/slow/task-tracker/lib/dirty-workspace-gate.test.mjs`
- `scripts/tests/slow/task-tracker/lib/discover-autosave.test.mjs`
- `scripts/tests/slow/task-tracker/lib/ensure-wave-parent.test.mjs`
- `scripts/tests/slow/task-tracker/lib/gates.test.mjs`
- `scripts/tests/slow/task-tracker/lib/lifecycle.test.mjs`
- `scripts/tests/slow/task-tracker/lib/log-issue-time.test.mjs`
- `scripts/tests/slow/task-tracker/lib/move-state-gate.test.mjs`
- `scripts/tests/slow/task-tracker/lib/move-state.test.mjs`
- `scripts/tests/slow/task-tracker/lib/proof-gate-reconciliation.test.mjs`
- `scripts/tests/slow/task-tracker/lib/review-approval-prompt.test.mjs`
- `scripts/tests/slow/task-tracker/lib/verb-preflight-wiring.test.mjs`
- `scripts/tests/slow/task-tracker/lib/worktree-isolation.test.mjs`
- `scripts/tests/slow/task-tracker/verbs/coverage-close.test.mjs`
- `scripts/tests/slow/task-tracker/verbs/recovery-path-independence.test.mjs`
- `scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs`
- `scripts/tests/unit/task-tracker/lib/state.test.mjs`

Complete returned output (retain the original Git tab separators):

<!-- markdownlint-disable MD010 -->

```text
1efefa88e2a47e57b09d3ccc8246980a55986f89
100644 574cd860de407792fe950be7a59b3d1be472ceca 1	cspell-dictionary.txt
100644 545cb6532555e8d024767b4d77055f3f181b99fb 2	cspell-dictionary.txt
100644 7960b000348fc1fc088ab00a90026fc5d8b43e27 3	cspell-dictionary.txt
100644 d7ed1903389f9df692c88071c2e1b5534dfa4e49 1	scripts/task-tracker/lib/artifact-write-policy.mjs
100644 58d0825c919e6cf0d5a01d545fbe8b14704c3be1 2	scripts/task-tracker/lib/artifact-write-policy.mjs
100644 dd44b65fa2be51f3d9825d548259b382c9b19019 3	scripts/task-tracker/lib/artifact-write-policy.mjs
100644 e6ec91b4f199d0dda5f1e1142c4b6c4e19c6adf5 1	scripts/tests/integration/task-tracker/lib/guidance-recertification.test.mjs
100644 e40c19deafabd5dae0cf26265fe8ac50c6d3c154 2	scripts/tests/integration/task-tracker/lib/guidance-recertification.test.mjs
100644 e91ac69c26cd24824dce0a30c7ce132b1e9d5011 3	scripts/tests/integration/task-tracker/lib/guidance-recertification.test.mjs
100644 e8c665275a22e702867981c94c430d6e30300ed6 1	scripts/tests/slow/task-tracker/lib/ac-evidence-gate.test.mjs
100644 58fd28455dbe8226663436ff5c3c35254185657e 2	scripts/tests/slow/task-tracker/lib/ac-evidence-gate.test.mjs
100644 ea311d6ba32ba771283e2f9a61243c29d9a48b8e 3	scripts/tests/slow/task-tracker/lib/ac-evidence-gate.test.mjs
100644 aaf62418874ee976d8205ff5f0170cfe8d1e0c61 1	scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs
100644 6ed62579b505a110f8f3d630c7a7cca728483184 2	scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs
100644 105a9ca319106fb7922a4965938518e98865aed1 3	scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs
100644 fa8105eec550b6a8c39c1454e83a1650b417ef8c 1	scripts/tests/slow/task-tracker/lib/cli.test.mjs
100644 0796f78512d73a962c1a42ae073587bf97a72ff5 2	scripts/tests/slow/task-tracker/lib/cli.test.mjs
100644 552eade0c4b2a9badae6116cbf77dd9d13c66ab2 3	scripts/tests/slow/task-tracker/lib/cli.test.mjs
100644 b018ce8d811fc41a9a725e3ca5c2b1039004da61 1	scripts/tests/slow/task-tracker/lib/coverage-hook-handler.test.mjs
100644 fcd88c3da976849b0ec0f2fb93a29706f88893b5 2	scripts/tests/slow/task-tracker/lib/coverage-hook-handler.test.mjs
100644 1a1154c2b68353a952e4bd62fafcf3326cc80772 3	scripts/tests/slow/task-tracker/lib/coverage-hook-handler.test.mjs
100644 49701112b0f49997fcefd596605ab1ab74b7b95c 1	scripts/tests/slow/task-tracker/lib/create-issue.test.mjs
100644 bd1ece8caa2816f2c325c85b75b20b48a82ef582 2	scripts/tests/slow/task-tracker/lib/create-issue.test.mjs
100644 d064637035f7a82596f53e48aec102837d474b2d 3	scripts/tests/slow/task-tracker/lib/create-issue.test.mjs
100644 f25e2b22854605a476ac34b687cd9de9e64ff775 1	scripts/tests/slow/task-tracker/lib/dirty-review-promote-false-success.test.mjs
100644 f254f2d5f2541c771306d2bb8ff95dbfbdf23ec8 2	scripts/tests/slow/task-tracker/lib/dirty-review-promote-false-success.test.mjs
100644 5548caf3a91b50201035a5613a6c90068e07f9e3 3	scripts/tests/slow/task-tracker/lib/dirty-review-promote-false-success.test.mjs
100644 cb898956470afbf6e10ae79312edb5ae283a407a 1	scripts/tests/slow/task-tracker/lib/dirty-workspace-gate.test.mjs
100644 ed575e0ff6e32381b06367a6d45640af7c1921d2 2	scripts/tests/slow/task-tracker/lib/dirty-workspace-gate.test.mjs
100644 d3fb701ea2acb3ecba46f25d863033375cf422ee 3	scripts/tests/slow/task-tracker/lib/dirty-workspace-gate.test.mjs
100644 db5f20e9379e6cfca182653e6d3ac96e5dd67208 1	scripts/tests/slow/task-tracker/lib/discover-autosave.test.mjs
100644 d88d7398aa6b6d074084a0a44c20a8c60f544d42 2	scripts/tests/slow/task-tracker/lib/discover-autosave.test.mjs
100644 25c3f50bf08036cac61870d57642089626b35840 3	scripts/tests/slow/task-tracker/lib/discover-autosave.test.mjs
100644 e848b425c5c8c82a17b8060e24dc78a2ae95c0d8 1	scripts/tests/slow/task-tracker/lib/ensure-wave-parent.test.mjs
100644 5496e93f4afc43410f8ef8d3fa4fe5bc653d4e1d 2	scripts/tests/slow/task-tracker/lib/ensure-wave-parent.test.mjs
100644 20c3a6412edf918f845d279e226c9ab965e5cf75 3	scripts/tests/slow/task-tracker/lib/ensure-wave-parent.test.mjs
100644 c58904e6ca92762879da24b7bce602c0ea8d2416 1	scripts/tests/slow/task-tracker/lib/gates.test.mjs
100644 db5d1c8b87afaa32a99a9cc0b5b4a668803d6869 2	scripts/tests/slow/task-tracker/lib/gates.test.mjs
100644 3f8fc0d9b048c7b09652157c86c6f26decb06095 3	scripts/tests/slow/task-tracker/lib/gates.test.mjs
100644 3270d808e6c353905a4b8939cc366ca83c3486d3 1	scripts/tests/slow/task-tracker/lib/lifecycle.test.mjs
100644 f153d7685a8f1b89fb131a84b5e2458becd8a5d0 2	scripts/tests/slow/task-tracker/lib/lifecycle.test.mjs
100644 1673ba321b6b1512ca08f8f4a35edc733b27fac7 3	scripts/tests/slow/task-tracker/lib/lifecycle.test.mjs
100644 8587146feec15f936f08d4506a6900cec244d94a 1	scripts/tests/slow/task-tracker/lib/log-issue-time.test.mjs
100644 742c415626527ec33f13e6f472d4cd99e3e89f9b 2	scripts/tests/slow/task-tracker/lib/log-issue-time.test.mjs
100644 4edbf4b8ad5317ac3cd834a63e28cd19c84c3380 3	scripts/tests/slow/task-tracker/lib/log-issue-time.test.mjs
100644 54340eeedf0ffb9007f5fa43ccab0d5fb4061502 1	scripts/tests/slow/task-tracker/lib/move-state-gate.test.mjs
100644 5b0e0d053c062926d29798762bcede19ea98ac6b 2	scripts/tests/slow/task-tracker/lib/move-state-gate.test.mjs
100644 cb0952b2266a2d11578a72118453a06a5e5dcd57 3	scripts/tests/slow/task-tracker/lib/move-state-gate.test.mjs
100644 0ac6cba3be97e5ff5dc7ce552316f8bceaad5a72 1	scripts/tests/slow/task-tracker/lib/move-state.test.mjs
100644 4defdf2e3415beabe52eac5478d28b0299974205 2	scripts/tests/slow/task-tracker/lib/move-state.test.mjs
100644 a5eaa6087115edbaf70baad6364f99cedcce4167 3	scripts/tests/slow/task-tracker/lib/move-state.test.mjs
100644 2f60ee4d27372a33ae2ba454760f2463c6b945e3 1	scripts/tests/slow/task-tracker/lib/proof-gate-reconciliation.test.mjs
100644 6f40d0d8fce9e30f6a4726733826f7c846da1240 2	scripts/tests/slow/task-tracker/lib/proof-gate-reconciliation.test.mjs
100644 4894c8c05a3d1810be5f477269cd26c0118cd22b 3	scripts/tests/slow/task-tracker/lib/proof-gate-reconciliation.test.mjs
100644 d12da7e7a1fb683f925c661ece042c30b43bddd7 1	scripts/tests/slow/task-tracker/lib/review-approval-prompt.test.mjs
100644 8aee697b85b6279175d3f38e97f90ab4553fe37a 2	scripts/tests/slow/task-tracker/lib/review-approval-prompt.test.mjs
100644 7c64fddf0b261b778b7bbdcb74315ac9343c2074 3	scripts/tests/slow/task-tracker/lib/review-approval-prompt.test.mjs
100644 930c871bf51fda990a33adf7aa1584cec26cd7fe 1	scripts/tests/slow/task-tracker/lib/verb-preflight-wiring.test.mjs
100644 632bab4fb53053ab44cf057039bd0fc5d46fce34 2	scripts/tests/slow/task-tracker/lib/verb-preflight-wiring.test.mjs
100644 70721f9161bc8730e6f0eded256203b5c140c254 3	scripts/tests/slow/task-tracker/lib/verb-preflight-wiring.test.mjs
100644 90acc4e3100b137cd4fd43416b9e98d3a94dbf95 1	scripts/tests/slow/task-tracker/lib/worktree-isolation.test.mjs
100644 220bf158f2e13730fe1e800c50a5dc8bfcec855b 2	scripts/tests/slow/task-tracker/lib/worktree-isolation.test.mjs
100644 d904c81903a2275fdd1f38cc43e672a435f7423d 3	scripts/tests/slow/task-tracker/lib/worktree-isolation.test.mjs
100644 4129a034819d3da79eed14a179315144bba603f5 1	scripts/tests/slow/task-tracker/verbs/coverage-close.test.mjs
100644 16f4aa831c57d981f4874d98f29b23fcd9506519 2	scripts/tests/slow/task-tracker/verbs/coverage-close.test.mjs
100644 cb730404f01b60a0400b1c2090289c125a6cef83 3	scripts/tests/slow/task-tracker/verbs/coverage-close.test.mjs
100644 357a728bbb3990982cf645908ad07f471529918d 1	scripts/tests/slow/task-tracker/verbs/recovery-path-independence.test.mjs
100644 aadec36bc6c1a994e25e87a6003aded14ef31f02 2	scripts/tests/slow/task-tracker/verbs/recovery-path-independence.test.mjs
100644 ca632a10db313d0e868ebf06a7753814dda103a5 3	scripts/tests/slow/task-tracker/verbs/recovery-path-independence.test.mjs
100644 782cf2a18a26c1688d1a28cfb21a12cfb0aeaa87 1	scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs
100644 9a254cf29b459524524a1accb0e9dada54603dbb 2	scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs
100644 f6cc649e0b31a514fa98668ec50cd29c9168f469 3	scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs
100644 abd1aea64459c1d05360617dfc46fbe6833651ca 1	scripts/tests/unit/task-tracker/lib/state.test.mjs
100644 bcde68f76aea33029e84ef87983d44a82aca974f 2	scripts/tests/unit/task-tracker/lib/state.test.mjs
100644 f46d22d017a6d085986ca1c100c65bcd4e0de313 3	scripts/tests/unit/task-tracker/lib/state.test.mjs

Auto-merging cspell-dictionary.txt
CONFLICT (content): Merge conflict in cspell-dictionary.txt
Auto-merging scripts/task-tracker/lib/artifact-write-policy.mjs
CONFLICT (content): Merge conflict in scripts/task-tracker/lib/artifact-write-policy.mjs
Auto-merging scripts/task-tracker/lib/command-surface/catalog.mjs
Auto-merging scripts/task-tracker/lib/command-surface/routing.mjs
Auto-merging scripts/task-tracker/task-tracker.mjs
Auto-merging scripts/task-tracker/verbs/help-data.mjs
Auto-merging scripts/tests/fixtures/1558/admission-surface.json
Auto-merging scripts/tests/helpers/runtime-root-fixture.mjs
Auto-merging scripts/tests/integration/task-tracker/lib/guidance-admission.test.mjs
Auto-merging scripts/tests/integration/task-tracker/lib/guidance-recertification.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/integration/task-tracker/lib/guidance-recertification.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/ac-evidence-gate.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/ac-evidence-gate.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/agentic-help-runtime.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/cli.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/cli.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/coverage-hook-handler.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/coverage-hook-handler.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/create-issue.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/create-issue.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/dirty-review-promote-false-success.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/dirty-review-promote-false-success.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/dirty-workspace-gate.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/dirty-workspace-gate.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/discover-autosave.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/discover-autosave.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/ensure-wave-parent.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/ensure-wave-parent.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/gates.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/gates.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/lifecycle.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/lifecycle.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/log-issue-time.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/log-issue-time.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/move-state-approval-gate.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/move-state-gate.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/move-state-gate.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/move-state.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/move-state.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/proof-gate-reconciliation.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/proof-gate-reconciliation.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/review-approval-prompt.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/review-approval-prompt.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/verb-preflight-wiring.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/verb-preflight-wiring.test.mjs
Auto-merging scripts/tests/slow/task-tracker/lib/worktree-isolation.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/lib/worktree-isolation.test.mjs
Auto-merging scripts/tests/slow/task-tracker/verbs/coverage-close.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/verbs/coverage-close.test.mjs
Auto-merging scripts/tests/slow/task-tracker/verbs/recovery-path-independence.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/slow/task-tracker/verbs/recovery-path-independence.test.mjs
Auto-merging scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
Auto-merging scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs
Auto-merging scripts/tests/unit/task-tracker/lib/state.test.mjs
CONFLICT (content): Merge conflict in scripts/tests/unit/task-tracker/lib/state.test.mjs
```

<!-- markdownlint-enable MD010 -->

## Actual lifecycle authority

The live native dependency reader reports #1861 blocked by #1872, which is still Review. A merged PR is not a Done issue. Its owner retains delivery/closure responsibility; this chat did not mutate #1872 or its dependency relationship.

```json
{
  "blockedBy": [1872],
  "states": {
    "1872": "review"
  },
  "status": "blocked",
  "unfinished": [
    {
      "ref": 1872,
      "state": "review"
    }
  ]
}
```

Fresh scoped Explain remains blocked on dependency readiness, five unticked ACs, preserved dirty-source authority and pending Develop finalization. It supplies no permission to bypass Test or invent acceptance. Complete returned decision:

```json
{
  "schema": "aitm.action-explanation/v2",
  "result": {
    "issue": 1861,
    "actionId": "promote",
    "status": "blocked",
    "blockers": [
      {
        "guardId": "blocked-by-not-done",
        "code": "unclassified-refusal",
        "args": {},
        "noAutomaticRemediation": {
          "reason": "legacy-guard-requires-human-investigation"
        }
      },
      {
        "guardId": "develop-exit-code-complete",
        "code": "code-complete-ac-evidence-incomplete",
        "args": {
          "label": "Journal complete before/after identities and payloads before any member publication. Every interrupted binding/timing/global batch refuses ordinary reads; registered exact recovery is idempotent and refuses changed/conflicting bytes.",
          "condition": "unticked",
          "section": "Acceptance Criteria",
          "nextAction": "In Develop, add a targeted verifier declaration with npx aitm issue-body if one is missing; then run npx aitm ac-stamp \"<AC label>\" and npx aitm ensureChecked \"<AC label>\"."
        },
        "noAutomaticRemediation": {
          "reason": "operator-action-required"
        }
      },
      {
        "guardId": "develop-exit-code-complete",
        "code": "code-complete-ac-evidence-incomplete",
        "args": {
          "label": "Coordinator/writer/operation/initialization ownership, pending publication artifacts and competing recovery claims have real SIGKILL cases. Only exact identity plus confirmed death admits recovery; live/reused PID, foreign host and unknown owner refuse.",
          "condition": "unticked",
          "section": "Acceptance Criteria",
          "nextAction": "In Develop, add a targeted verifier declaration with npx aitm issue-body if one is missing; then run npx aitm ac-stamp \"<AC label>\" and npx aitm ensureChecked \"<AC label>\"."
        },
        "noAutomaticRemediation": {
          "reason": "operator-action-required"
        }
      },
      {
        "guardId": "develop-exit-code-complete",
        "code": "code-complete-ac-evidence-incomplete",
        "args": {
          "label": "Cover bootstrap/approved plan, stage copy, each root rename, control activation, manifest complete, timing retry and fence release with killed child processes. Thrown faults remain supplemental.",
          "condition": "unticked",
          "section": "Acceptance Criteria",
          "nextAction": "In Develop, add a targeted verifier declaration with npx aitm issue-body if one is missing; then run npx aitm ac-stamp \"<AC label>\" and npx aitm ensureChecked \"<AC label>\"."
        },
        "noAutomaticRemediation": {
          "reason": "operator-action-required"
        }
      },
      {
        "guardId": "develop-exit-code-complete",
        "code": "code-complete-ac-evidence-incomplete",
        "args": {
          "label": "Completed no-fence timing retry tolerates proven successor generations and legitimate census evolution without republishing stores. Retained fence requires original roots. New roots initialize separately; partial loss refuses; explicit empty initialization requires proven total absence of legacy/durable data.",
          "condition": "unticked",
          "section": "Acceptance Criteria",
          "nextAction": "In Develop, add a targeted verifier declaration with npx aitm issue-body if one is missing; then run npx aitm ac-stamp \"<AC label>\" and npx aitm ensureChecked \"<AC label>\"."
        },
        "noAutomaticRemediation": {
          "reason": "operator-action-required"
        }
      },
      {
        "guardId": "develop-exit-code-complete",
        "code": "code-complete-ac-evidence-incomplete",
        "args": {
          "label": "Synchronous promise misuse preserves recovery evidence. A lease alone is never multi-file atomic publication proof.",
          "condition": "unticked",
          "section": "Acceptance Criteria",
          "nextAction": "In Develop, add a targeted verifier declaration with npx aitm issue-body if one is missing; then run npx aitm ac-stamp \"<AC label>\" and npx aitm ensureChecked \"<AC label>\"."
        },
        "noAutomaticRemediation": {
          "reason": "operator-action-required"
        }
      },
      {
        "guardId": "develop-exit-code-complete",
        "code": "unclassified-refusal",
        "args": {},
        "noAutomaticRemediation": {
          "reason": "legacy-guard-requires-human-investigation"
        }
      }
    ],
    "normalizations": [],
    "warnings": [
      {
        "code": "test-develop-finalization-pending",
        "args": {}
      }
    ],
    "humanDecision": {
      "requests": [
        {
          "kind": "manual-investigation",
          "actor": "human-operator",
          "subject": {
            "issue": 1861,
            "actionId": "promote"
          },
          "args": {
            "guardId": "blocked-by-not-done",
            "code": "unclassified-refusal"
          }
        },
        {
          "kind": "manual-investigation",
          "actor": "human-operator",
          "subject": {
            "issue": 1861,
            "actionId": "promote"
          },
          "args": {
            "guardId": "develop-exit-code-complete",
            "code": "unclassified-refusal"
          }
        }
      ]
    }
  },
  "guidance": [
    {
      "id": "action.promote",
      "digest": "sha256:5333329fe234b578f1b60fed8c65d3107a38812dd6adeb2a1ad098d1a9342cfc",
      "status": "expanded",
      "agent": {
        "instruction": [
          {
            "query": "promote"
          },
          {
            "require_status": "ready"
          },
          {
            "if_blocked": "use_returned_remediation_ids"
          },
          {
            "execute": "promote"
          },
          {
            "never": "bypass_guard"
          },
          {
            "execution_revalidates": true
          }
        ]
      }
    }
  ]
}
```

## Continuation boundary

After the worktree and epic-base decision, run applicable package/build checks, local lint/format and the complete canonical affected selection in the admitted confined candidate. Full unit/integration/slow lanes remain cloud-only. Push only the reviewed child source with exact remote-head lease protection, retain source-head versus tested-merge SHA and complete #1872 worker/lane artifact coverage, then re-query AITM.

CI artifacts remain separate from accepted AITM Test receipts. Genuine native bootstrap admission remains unproved; no adapter result, cloud aggregate or local process-observation refusal grants that acceptance. #1862 remains paused and has not been started.

## Evidence authoring observations

The native hook refused a raw JSON redirect as WRITE_OTHER and the patch-tool transport as an invalid mutation payload, before either write. An explicit Markdown file write succeeded under the active binding. The first document checks reported 75 MD010 findings for the retained raw Git tab separators and two spelling findings in the narrative. A rule annotation limited to that exact raw-output block preserves the original separators; narrative spelling is corrected. No project configuration, discovery filter, runtime guard or acceptance requirement changed.
