# #1855 parent ancestry reconciliation

PR #1907 reported conflicts against the held epic parent. This merge records that parent ancestry while preserving the newer child implementation. All four parent-only patches are already represented by rebased commits in the child. The nine paths changed by the parent also have identical complete blobs at the already-integrated Task1 tip. Only this review record is added by the reconciliation merge.

## Exact Git identities

| Role | Git object |
|---|---|
| First merge parent / preserved WIP checkpoint | `b3a473792319a578c97268a63bac71f6a70ad7e7` |
| Second merge parent / verified remote epic parent | `b1cf667dc72265bac34f3c8c854679866f2ea235` |
| Pre-merge implementation tree | `fdb35b4a1b2728e5f56d0c102e46ad1514a4b7e6` |
| Already-integrated rebased Task1 tip | `6d678b873def5d68f0c82ee8db5115d8bdc90992` |
| Common-base comparison | `15faa18e18b31a5965a15d0482750c6c0b9d125d` |
| Full Task5 review base, unchanged by this merge | `fda96c767cd08254ba460ef69dfa65819ed8e2fe` |

The child branch is `feature/epic/1847/child/1855`; the PR base is `feature/epic/1847/parent`. The remote parent was freshly verified with `git ls-remote origin refs/heads/feature/epic/1847/parent` before beginning the merge. No parent ref was pushed or rewritten.

## Represented parent patches

`git cherry b3a473792319a578c97268a63bac71f6a70ad7e7 b1cf667dc72265bac34f3c8c854679866f2ea235` reported `-` for every parent-only commit. Independently computed `git show --format= --binary <commit> | git patch-id --stable` values match these already-integrated commits:

| Parent-only commit | Stable patch ID | Already-integrated commit |
|---|---|---|
| `35ab06ffd43af6aa7ffb2e56fb1f4b88822ae30d` | `6e8a7cec22891fa813cb3d8b8f25bdbec974811b` | `b2c3384ccc5feaa0bfcb3219c895e02b7f3a3d53` |
| `d7d65217733c43752915239b6655693805925622` | `b36c1565a8712b31bb97bfeacf0e24972b26d66d` | `edb434a41b57af888a723a3fbb41a82ac1cec1d8` |
| `0861ee74f8deb432ccc2932944b5f6919d73bf46` | `cebc57bea2f09d92fc93096cfdaf243475492a21` | `a5a446776221dae6ba2a2da160b84a1d97c041dc` |
| `b1cf667dc72265bac34f3c8c854679866f2ea235` | `54136c221c6144d5a1d65078a043997274ec90dd` | `6d678b873def5d68f0c82ee8db5115d8bdc90992` |

## Complete parent file comparison

The complete path set comes from `git diff --name-only 15faa18e18b31a5965a15d0482750c6c0b9d125d b1cf667dc72265bac34f3c8c854679866f2ea235`. For every path, `git rev-parse <commit>:<path>` returned the following identical blob objects; zero differences were found. This checks complete file bytes in addition to patch equivalence.

| Path | Remote-parent blob | Integrated Task1 blob |
|---|---|---|
| `scripts/task-tracker/lib/criteria-revision/authorization.mjs` | `0c614d8ad3f470fc0f7efc48f3d23aa58e8d1ec1` | `0c614d8ad3f470fc0f7efc48f3d23aa58e8d1ec1` |
| `scripts/task-tracker/lib/criteria-revision/proposal.mjs` | `0b3d7640e6d9d5786da59d4010ceb3dfc5d9ff6f` | `0b3d7640e6d9d5786da59d4010ceb3dfc5d9ff6f` |
| `scripts/task-tracker/lib/criteria-revision/schema.mjs` | `9d0d7a36a06afe0a6a3025121de2307f5f392415` | `9d0d7a36a06afe0a6a3025121de2307f5f392415` |
| `scripts/task-tracker/lib/workflow-policy/authority-resolver.mjs` | `e4853b6cc58740a26154aa7b54d5adb3ddb82cd0` | `e4853b6cc58740a26154aa7b54d5adb3ddb82cd0` |
| `scripts/tests/fixtures/criteria-revision.mjs` | `a31dc6e91ad9eb11893c482738dde4b132e49697` | `a31dc6e91ad9eb11893c482738dde4b132e49697` |
| `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` | `4fd1b0ac9cef100c5ad6cbe9475f2c531248ca52` | `4fd1b0ac9cef100c5ad6cbe9475f2c531248ca52` |
| `scripts/tests/unit/task-tracker/lib/criteria-revision/authorization.test.mjs` | `b0c8748a0c91e94a0494794b7bad61380dda0c00` | `b0c8748a0c91e94a0494794b7bad61380dda0c00` |
| `scripts/tests/unit/task-tracker/lib/criteria-revision/proposal.test.mjs` | `32b24613a62b125f964f39a12e54ffe54d89d08d` | `32b24613a62b125f964f39a12e54ffe54d89d08d` |
| `scripts/tests/unit/task-tracker/lib/criteria-revision/schema.test.mjs` | `b9a4b0969575bdee5e93f04e673c0b58e702586e` | `b9a4b0969575bdee5e93f04e673c0b58e702586e` |

## Conflict resolution and unchanged implementation

`git merge --no-ff --no-commit b1cf667dc72265bac34f3c8c854679866f2ea235` returned the expected conflict status for exactly four paths. Each was resolved to the exact pre-merge child version, preserving later Task2–Task5 changes:

- `scripts/task-tracker/lib/criteria-revision/proposal.mjs`
- `scripts/task-tracker/lib/criteria-revision/schema.mjs`
- `scripts/tests/fixtures/criteria-revision.mjs`
- `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`

The resolution used `git restore --source=b3a473792319a578c97268a63bac71f6a70ad7e7 --staged --worktree -- <four exact paths>`. Before this audit was added, `git write-tree` returned `fdb35b4a1b2728e5f56d0c102e46ad1514a4b7e6`, exactly equal to the first parent tree. The final index must differ from that tree only by this audit document. No blanket merge strategy, force push, reset, rebase, or implementation edit was used.

## Workflow refusal and durable audit

The first normal merge commit attempt was refused before execution:

```text
[task-tracker] commit inventory unavailable: mutation-context: empty staged inventory.
Command: git commit -m '[#1855] Reconcile epic parent ancestry for draft PR'
node bin/aitm.mjs commit-trace 1855
```

Neither command executed in that attempt. The workflow classifies staged files and rejects an empty inventory; it has no supported unchanged-tree merge exception. This tracked audit preserves the non-obvious reconciliation evidence beyond ignored working reports and provides a genuine documentation change for normal commit classification. No hook, environment, chore mode, alternate commit transport, or fabricated implementation change was used to evade the refusal.

## Verification and delivery limits

The first parent preserves all fourteen test-only WIP files (+196/-3): the late-input fixture, discovery metadata, independent source-membership assertions, and eleven wrappers. Six persistence-input cases have passed across two retained runs; the five effect/context cases remain unrun. The most recent five-case run exited 0, with five outer and five genuine inner passes, no skips, and duration 536403.392833 ms. Its raw SHA256 is `52669bb552a5ef90c9f189a898f5bebb7c03b0f0fc2cc7e6381026a2512505c2`. This is functional coverage, not a canonical full-lane or CI receipt.

No implementation test was repeated solely for this ancestry repair because the implementation tree is unchanged. This audit is not CODE_COMPLETE, a lifecycle promotion, a human approval of live criteria, a production activation, or a successful full Task5 verification. The Draft remains incomplete. Prior WIP quality failures (three extra EOF blank lines and fourteen whitespace-only fixture lines) and the remaining native continuation, current/custody/lock, durable retry, topology, semantic graph, package, and full CI/performance obligations remain open. Exact-head evidence must be refreshed when the implementation is complete.

The WIP checkpoint received its exact native commit trace before merging. The reconciliation commit must likewise receive native `node bin/aitm.mjs commit-trace 1855`, followed by a normal child-only push and a fresh PR head/base/Draft/mergeability check. Those post-commit results are not claimed by this pre-commit document.
