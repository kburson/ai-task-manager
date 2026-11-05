1. Push a child branch so it tracks `origin/<child>`.
2. Add parent work after that push, then run governed `merge-back`, which rebases the child onto the newer parent.
3. Observe unit, integration, and slow lanes pass and the parent fast-forward to the rebased child.
4. Observe child worktree removal succeed, followed by `git branch -d <child>` refusing because Git compares the rebased local branch with its still-old configured upstream.
