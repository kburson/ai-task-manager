# Workspace Authority Stabilization Orchestration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development for child delivery,
> superpowers:requesting-code-review before integration, and
> superpowers:finishing-a-development-branch for every branch.

**Goal:** Deliver review-epoch authority, exclusive issue/worktree leasing, and
the existing Codex local-worktree environment change; reconcile trunk; then
retire only the scoped #925 artifacts with external recovery backups.

**Architecture:** One governed epic owns three sequential children. The first
two implement shared lifecycle authority in order; the third rebases, updates,
and delivers the two preserved local environment commits. Each child uses a
seeded issue worktree, TDD, task-scoped review, exact branch-to-trunk delta
audit, squash integration, AITM Review/approval/close, and origin verification.
The epic owns archival and cleanup.

**Tech Stack:** Git/Git worktrees, GitHub/AITM lifecycle, Node.js `>=22.15.0`,
ESM, `node:test`, SQLite, Bash.

## Immutable Inputs

- Approved spec:
  `docs/superpowers/specs/2026-07-29-workspace-authority-stabilization-design.md`
- Review child plan:
  `docs/superpowers/plans/2026-07-29-review-epoch-authority.md`
- Lease child plan:
  `docs/superpowers/plans/2026-07-29-exclusive-work-lease.md`
- Preserved local environment design/plan commit: `a9942483`
- Preserved local environment implementation commit: `8448906a`
- #925 squash on trunk: `5a32d626`
- #925 preserved tip: `fbdc2db6`
- Design branch baseline: `6c3c45e8`
- Hybrid-ledger design-plan reference: `4f70500b`

At issue creation, `git rev-parse HEAD` is the immutable reference commit for
all three tracked plan files. Issue bodies record the paths, reference commit,
task range, dependency order, and the exact preserved SHAs above.

## Global Constraints

- Create issues only with `npx aitm create-issue --shape epic|sub-issue`; never
  raw `gh issue create`.
- Use one epic and exactly three ranked children:
  Review epoch → work lease → local environment delivery.
- Run each lifecycle step through `npx aitm`; never jump state or close through
  GitHub directly.
- Full-Auto audit is truthful: prior chat approval covers the architecture,
  while later plan/final-review gates use the automated audit path.
- Seed every worktree and verify `node_modules/ai-task-manager -> ..`.
- Before integration, fetch origin and report exact commits/files/statistics,
  ancestry, mergeability, whitespace, and tests.
- Squash-integrated commits include `[#N]` and are pushed before AITM close.
- Backups live outside the repository and are read back before destructive
  cleanup.
- Never use `git clean`, `git reset --hard`, broad recursive delete, or touch
  an unrelated worktree, branch, stash, or host-managed checkout.

---

### Task 1: Commit and Publish Approved Provenance

- [ ] Format and lint the spec plus all three plans:

  ```bash
  npm exec prettier -- --write \
    docs/superpowers/specs/2026-07-29-workspace-authority-stabilization-design.md \
    docs/superpowers/plans/2026-07-29-workspace-authority-stabilization.md \
    docs/superpowers/plans/2026-07-29-review-epoch-authority.md \
    docs/superpowers/plans/2026-07-29-exclusive-work-lease.md
  npm exec markdownlint-cli2 -- \
    docs/superpowers/specs/2026-07-29-workspace-authority-stabilization-design.md \
    docs/superpowers/plans/2026-07-29-workspace-authority-stabilization.md \
    docs/superpowers/plans/2026-07-29-review-epoch-authority.md \
    docs/superpowers/plans/2026-07-29-exclusive-work-lease.md
  git diff --check
  ```

- [ ] Reject unresolved plan tokens or deferred implementation decisions.
- [ ] Commit the approved refinement and plans, then push
      `codex/stabilization-authority-design`.
- [ ] Verify the pushed commit resolves all four files through
      `git ls-remote` plus `git show`.

### Task 2: Create the Governed Epic and Children

- [ ] Under `.tmp/plan/stabilization/`, create separate `scope.md`, `acs.md`,
      and `plan-meta.md` fragments for the epic and each child. Every AC carries
      either an exact `aitm-verified` command marker or an honest
      `aitm-non-demonstrable` marker.
- [ ] Plan metadata names the approved spec/plan paths, published reference
      SHA, mapped task range, predecessor issue where applicable, and preserved
      local SHAs.
- [ ] Dry-run, then create:

  ```bash
  AITM_STABILIZATION_EPIC="$(
    npx aitm create-issue \
    --title "Stabilize workspace authority after issue 925" \
    --shape epic \
    --scope-file .tmp/plan/stabilization/epic/scope.md \
    --ac-file .tmp/plan/stabilization/epic/acs.md \
    --plan-metadata-file .tmp/plan/stabilization/epic/plan-meta.md \
    --sub-issue-list-file .tmp/plan/stabilization/epic/sub-issues.md \
    --label enhancement \
      --assignee kburson |
      sed -nE 's#.*issues/([0-9]+).*#\1#p' |
      tail -1
  )"
  test -n "$AITM_STABILIZATION_EPIC"

  AITM_REVIEW_EPOCH_ISSUE="$(
    npx aitm create-issue \
    --title "Bind review approval to the current review epoch" \
    --shape sub-issue \
    --parent "$AITM_STABILIZATION_EPIC" \
    --scope-file .tmp/plan/stabilization/review-epoch/scope.md \
    --ac-file .tmp/plan/stabilization/review-epoch/acs.md \
    --plan-metadata-file .tmp/plan/stabilization/review-epoch/plan-meta.md \
    --label bug \
      --assignee kburson |
      sed -nE 's#.*issues/([0-9]+).*#\1#p' |
      tail -1
  )"
  test -n "$AITM_REVIEW_EPOCH_ISSUE"

  AITM_WORK_LEASE_ISSUE="$(
    npx aitm create-issue \
    --title "Add exclusive fenced issue and worktree leases" \
    --shape sub-issue \
    --parent "$AITM_STABILIZATION_EPIC" \
    --scope-file .tmp/plan/stabilization/work-lease/scope.md \
    --ac-file .tmp/plan/stabilization/work-lease/acs.md \
    --plan-metadata-file .tmp/plan/stabilization/work-lease/plan-meta.md \
    --label enhancement \
      --assignee kburson |
      sed -nE 's#.*issues/([0-9]+).*#\1#p' |
      tail -1
  )"
  test -n "$AITM_WORK_LEASE_ISSUE"

  AITM_LOCAL_ENV_ISSUE="$(
    npx aitm create-issue \
    --title "Deliver the Codex local-worktree environment" \
    --shape sub-issue \
    --parent "$AITM_STABILIZATION_EPIC" \
    --scope-file .tmp/plan/stabilization/local-environment/scope.md \
    --ac-file .tmp/plan/stabilization/local-environment/acs.md \
    --plan-metadata-file .tmp/plan/stabilization/local-environment/plan-meta.md \
    --label enhancement \
      --assignee kburson |
      sed -nE 's#.*issues/([0-9]+).*#\1#p' |
      tail -1
  )"
  test -n "$AITM_LOCAL_ENV_ISSUE"
  ```

  The epic number is captured and validated before the first child creation;
  each child number is likewise validated before proceeding.

- [ ] Verify project tether, parent/child links, assignee, p1 priority, ranks
      1–3, immutable metadata, AC markers, and canonical body tail.
- [ ] Refine and Plan the epic/children with sizes and estimates supported by
      the detailed plans. Record planned estimates, enable Full-Auto `both`,
      stamp plan approvals through its audit path, and promote only the epic
      and first child to Develop. Later children remain blocked/JIT.

### Task 3: Deliver Review-Epoch Authority

- [ ] Bind the epic as orchestrator, cut the epic branch, then cut/seed the
      ranked child worktree through AITM.
- [ ] Execute
      `docs/superpowers/plans/2026-07-29-review-epoch-authority.md` task by task.
      Maintain `.superpowers/sdd/progress.md`; use a fresh implementer and
      independent task reviewer per task.
- [ ] Run child focused/full verification and whole-branch review. Fix every
      Critical/Important finding and re-review.
- [ ] Stamp AC/DoD evidence individually, run AITM Test/Review, audit the exact
      child-vs-epic delta, merge back, push, and verify.

### Task 4: Deliver Exclusive Work Lease

- [ ] Pull/promote the lease child only after the review child has current
      final-review evidence and its merge-back to the pushed epic branch is
      independently verified.
- [ ] Cut and seed its worktree from the updated epic head.
- [ ] Execute
      `docs/superpowers/plans/2026-07-29-exclusive-work-lease.md` sequentially,
      reusing only the minimal package boundary from `4f70500b`.
- [ ] Independently review each task and the full branch. Verify both SQLite
      behavior and remote-contract fail-closed behavior.
- [ ] Stamp evidence, run AITM Test/Review, audit delta, merge back, push, and
      verify.

### Task 5: Preserve and Reconcile the Main Checkout

Use an exclusive, validated directory created under
`/Users/kpburson/projects/Vibe-Coding/` with prefix
`aitm-reconcile-backup-20260729-`.

- [ ] Record current refs, worktrees, stashes, file hashes, ancestry, patch IDs,
      and status. Require:
      local `trunk=8448906a`, merge base `1d8e6ae6`, and
      `origin/trunk=6c3c45e8` or a reviewed fast-forward successor.
- [ ] Copy the two legacy hook stubs with metadata; bundle local `trunk`; bundle
      `codex/925-close-convergence`; export stash `a839f5a0` as a binary patch.
- [ ] Read back with `git bundle verify`, `git apply --check` in an isolated
      temporary checkout, SHA-256 comparison, and recorded manifest.
- [ ] Create `codex/local-env-preservation` and
      `codex/local-env-delivery-rebased` at `8448906a`. Remove the two untracked
      hook stubs only after verified copy.
- [ ] In a new seeded worktree for `codex/local-env-delivery-rebased`, fetch and
      rebase only that delivery ref onto current origin/trunk. Abort on conflict.
      Verify stable patch equivalence, nine changed files, 1,004 insertions at
      the audited baseline, and `git diff --check`.
- [ ] Do not push these rewritten commits directly; the local-environment child
      owns their governed delivery. After both preservation refs and the bundle
      verify, realign the main checkout without a hard reset:
      `git switch --detach origin/trunk`, assert detached HEAD equals the
      fetched origin SHA, `git branch -f trunk origin/trunk`, then
      `git switch trunk` and assert `trunk == origin/trunk`.

### Task 6: Deliver the Codex Local-Worktree Environment

- [ ] Pull/promote the third child only after the lease child has current
      final-review evidence and its merge-back to the pushed epic branch is
      independently verified. Cut/seed from that updated epic head.
- [ ] Apply the two preserved changes by patch identity, retaining the design,
      plan, implementation, tests, guide, setup script, self-doc entry, and
      spelling update.
- [ ] Update the environment contract, verifier, guide, tests, and CI to the
      program-wide Node `>=22.15.0` floor.
- [ ] Witness the verifier tests RED against the pre-change child branch, then
      GREEN after applying the change. Run:

  ```bash
  node --test scripts/dev-env/verify-local-worktree.test.mjs
  bash -n scripts/dev-env/setup-local-worktree.sh
  node scripts/dev-env/verify-local-worktree.mjs
  npm run format:check
  npm run lint
  npm test
  npm run test:slow
  git diff --check
  ```

- [ ] Independently review, stamp AC/DoD evidence, run AITM Test/Review, audit
      delta, merge back, push, and verify.

### Task 7: Integrate and Close the Program

- [ ] Reconcile epic ACs only after all children reach Review. Run epic-wide
      focused, fast, slow, format, lint, spell, and whitespace verification.
- [ ] Produce the exact epic branch versus current origin/trunk audit:
      commits, file list, per-file added/deleted counts, patch equivalence, merge-tree result,
      whitespace, package contents, and tests.
- [ ] Squash integrate to trunk with one commit whose subject includes
      `[#${AITM_STABILIZATION_EPIC}]`,
      `[#${AITM_REVIEW_EPOCH_ISSUE}]`, `[#${AITM_WORK_LEASE_ISSUE}]`, and
      `[#${AITM_LOCAL_ENV_ISSUE}]`; push and prove that tagged commit is
      reachable from `origin/trunk` for every issue.
- [ ] Approve/close children and epic through AITM’s Full-Auto audit path in
      dependency order. Verify Closed, Done, Delivered, timing, commit trace,
      and trunk reachability for each.

### Task 8: Retire Only Scoped #925 Artifacts

- [ ] Revalidate the backup manifest and require:
      `git diff --quiet 5a32d626 fbdc2db6`, clean #925 worktree, closed/Done/
      Delivered #925, #925 squash `5a32d626` reachable from origin/trunk, and
      bundle read-back for non-ancestor feature tip `fbdc2db6`.
- [ ] Resolve the exact stash selector with
      `git stash list --format='%gd %H'`; require its full object ID to equal
      `a839f5a0a945ec2809e0e9fe27dcbaf08e012dd5`. In an isolated checkout of its
      first parent, require `git apply --check --binary` on the exported patch;
      then drop only that still-matching selector.
- [ ] Remove only `.worktrees/925-close-convergence`, then delete only
      `codex/925-close-convergence`. Squash-equivalence plus the verified bundle
      authorizes the otherwise-force branch deletion.
- [ ] Do not remove the design worktree until its published provenance commit
      is reachable from trunk or retained by a remote branch.
- [ ] Run `git worktree prune --dry-run --verbose`; do not execute prune if it
      names an unrelated target.

### Task 9: Final Workspace Audit

- [ ] Verify main `trunk == origin/trunk`, clean status, no legacy hook stubs,
      no #925 branch/worktree/stash, backup manifest readable, and no
      `.db/aitm/project.sqlite` tracked by Git.
- [ ] Verify all unrelated worktree paths/branches and their HEADs match the
      pre-program inventory.
- [ ] Run AITM fleet/lock/active-session inspection and confirm no stale
      stabilization holder remains.
- [ ] Run `npm ci`, `npm run quality`, `npm run test:slow`, `git diff --check`,
      and a clean package smoke test from main.
- [ ] Preserve the external recovery directory and report its exact path and
      contents; cleanup of that backup is a separate human decision.
