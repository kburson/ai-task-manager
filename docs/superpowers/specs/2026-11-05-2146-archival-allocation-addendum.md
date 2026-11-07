# #2146 archival allocation addendum

This narrow correction supplements accepted design r2 (`1ea45b5c124834cfabdd62a0e2de2309014cecc67611c16afda0f810bd50c08d`) and plan r2 (`d7e41a2e5ff92c10c0e4298f8f33c6f370ef3dac185b85887414844201702fd3`). No other accepted requirement changes.

During required import review, `scripts/task-tracker/lib/scratch-dir.mjs` showed that `mkdtempProjectIsolated` builds a prototype with `git init`, `git add`, `git commit --no-verify` and then copies it. It is not an empty allocator. It must not be invoked by this archival reconstruction path: doing so would introduce Git mutations/helper execution before the reviewed checked runner and produce a nonempty clone destination. No call was made.

Instead import `resolveScratchRoot` from the same required carrier-owned scratch helper. Call it with the physically resolved actual carrier root. Its current `resolveProjectDir` dependency returns an explicit `deps.projectDir` before any bound-worktree lookup. Require the returned physical path to equal that actual carrier root; any mismatch refuses. Review this helper's import closure as planned.

Use Node filesystem primitives to allocate one private mode-0700 unique child under `<validated-carrier-root>/.ai-task-manager/runtime/test-fixtures/2146-archive/`, checking existing ancestors for symlinks and containment first. This follows the existing registered fixture namespace without calling the prototype builder or changing any product helper. The new root contains separate empty template and reconstruction subdirectories. The planned fixed checked Git runner then creates and populates only the new physical validation repository. No native worktree, copied runtime, fake commit, global override or disabled existing hook is introduced.

Task 2 tests must prove that allocation itself performs no Git subprocess, preserves carrier refs/index/HEAD, rejects a mismatched resolved root and refuses a pre-existing symlink ancestor. The existing private-root concurrency limit remains; no arbitrary same-user race-proof claim is added.

Task 1's closed archive and validation work is unchanged. This addendum requires independent acceptance before Task 2 reconstruction is implemented.
