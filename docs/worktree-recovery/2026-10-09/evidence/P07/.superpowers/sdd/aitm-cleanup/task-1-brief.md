### Task 1: Prove the cross-repository cleanup gate

**Files:**

- Read only: `docs/migration-provenance.md` in the fresh writing-studio clone
- Read only: AITM branch, worktree, and remote refs

**Interfaces:**

- Consumes: the verified writing-studio remote and source commit.
- Produces: a recorded, immutable cleanup authorization point; no AITM mutation.

- [ ] **Step 1: Seed and verify the AITM worktree**

```bash
cd /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe
node scripts/task-tracker/ensure-worktree-seeded.mjs
node scripts/dev-env/verify-local-worktree.mjs
test "$(readlink node_modules/ai-task-manager)" = ".."
git status --short
git branch --show-current
git rev-parse HEAD
git merge-base --is-ancestor origin/trunk HEAD
```

Expected: prepared linked worktree, expected branch, clean status, and branch
descended from `origin/trunk`.

- [ ] **Step 2: Re-read studio verification evidence**

From the fresh studio clone created by the extraction plan, run:

```bash
git status --short
git rev-parse HEAD
git ls-remote origin refs/heads/trunk
gh repo view kburson/writing-studio --json nameWithOwner,visibility,defaultBranchRef,url
gh run list --repo kburson/writing-studio --branch trunk --limit 3
sed -n '1,260p' docs/migration-provenance.md
```

Expected: private visibility, local and remote `trunk` SHAs match, CI is green,
the provenance document names the AITM source SHA, and status is clean.

- [ ] **Step 3: Verify the migrated corpus before deleting its source**

```bash
npm ci
npm run quality
npm run publish:articles -- --collection agentic-delivery --skip-diagrams
npm run book -- --collection agentic-delivery --target manuscript --target html --target epub
git status --short -- collections
```

Expected: all commands pass and the collection remains unmodified.

- [ ] **Step 4: Stop on any mismatch**

If any SHA, visibility, CI, fresh-clone, corpus, or provenance check fails, do
not mutate AITM. Report the exact mismatch and preserve both repositories.

---

