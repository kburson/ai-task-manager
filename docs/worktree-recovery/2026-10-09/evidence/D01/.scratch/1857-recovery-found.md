# #1857 recovered archive snapshot

The requested original worktree disappeared from Git registrations and could not be used as a command working directory. Investigation located Codex's archive-cleanup snapshot in the main repository.

Snapshot commit: 65e6887426307247770a9ce08e7642abc50c73e8
Protected snapshot ref: refs/codex/snapshots/232c87b2fd75d966c874bf2b4db40e126d3826ce
Original parent: d4c42d7809c22acc9576d51da8938952588c207e (codex/1857-draft)
Snapshot creation time: 2026-10-02 13:57:09 America/Chicago
Diff against original parent: 115 files changed, 6279 insertions, 1436 deletions.

Recovered checkout: /Users/kpburson/.codex/worktrees/1857-recovered-wip/ai-task-manager
Created through the Codex app managed-worktree API using the protected snapshot ref and attached to this chat. Git status --short returned no changes; diff against the original parent reproduced the 115-path snapshot diff.

Recovery includes runtime source, runtime tests, the relocated integration actor-flush-journal test, configuration .bak files, private fixture files and the untracked empty equals-sign file. Snapshot materializes original uncommitted files as committed content. Original staged/unstaged/untracked distinctions have not yet been reconstructed.

Earlier preservation checkpoint and backups remain referenced in .scratch/1857-takeover-workspace-blocker.md. Their current existence and hashes could not be rechecked because the AITM native read guard refused external /private/tmp and original-worktree paths, even with a filesystem escalation request. No backup deletion or source cleanup was performed.

Do not delete either the protected snapshot ref or the recovered worktree. Do not run candidate durable-runtime source against live legacy AITM authority. Restore intended original staging and compare with merged trunk before continuing implementation.
