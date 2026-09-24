<!-- aitm-skill-version: 1.0.0 -->

# Commit trail — compatibility pointer

Emit `aitm-skill-loaded:rules/commit-trail:1.0.0` on first load. Every successful `git commit` made while an issue is bound belongs in its canonical `### 🔗 Commits` comment. Prefix the subject with `[#N]`, then run `/task commit-trace #N` if the hook did not record the exact current HEAD. Amend and rebase change SHAs: regenerate trace and exact-head evidence. The close gate checks attribution and reachability. Human detail: `../references/commit-trail-detail.md`; current CLI help and receipt govern.
