# #1857 cleanup skill RED baseline preservation

This tracked audit preserves the observed behavior and exact source digests before any cleanup SKILL.md is created. The fictional scenario ran with tools disabled; no real files, branches or worktrees were removed.

The genuine Claude Opus 5.5 medium baseline incorrectly proposed raw git worktree remove for a host-managed candidate, followed by local branch deletion and host attachment repair afterward. Required behavior is a typed host archive handoff, recoverable snapshot and fresh receipt validation before local pruning; unavailable archive capability remains protected. It also reported two candidates as applied despite running no tools. The completed skill must report proposals as proposals.

It correctly retained pending/unknown runtime records, active local work after origin deletion, a partial squash with unintegrated additions, and an origin ref whose OID had changed. GREEN repeats the same scenario independently and must preserve those refusals while fixing managed archival and outcome reporting.

Exact SHA-256 of original volatile inputs:

- result.json: 503ce1a8bd4daec1e1f831e5fd60df7e4f9e24bef41781e9b21980a5328ebbb7
- process.json: 5e8da3fd2af4c1d53f4bf38df79ed23599735e1b723218de35ff03dfa06af857
- audit.md: d6e53c761d553af28f2d5936bad9721d9767560381aafb97784f6bce70a5e3bb
- stderr.log: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 (zero bytes; complete stderr was empty)

Original paths are .scratch/1857-cleanup-skill-baseline-{result.json,process.json,audit.md,stderr.log}. Digests establish exact inputs; the behavioral record above survives their deletion. Raw provider handles are intentionally not copied here.

Process interval: 2026-09-30T20:31:53.658192Z–20:32:20.008014Z, 26.349430166184902 seconds, exit0. This reviewer/test-agent engagement is separate from concurrent controller work, and API duration is not added again.

Accepted-plan operational path corrections: Task3's activity-policy module is scripts/task-tracker/activity-policy.mjs, not its lib directory. Research c8 exclusions are in .c8rc.json, not package.json. These source-grounded path corrections do not alter accepted artifact bytes or behavior.
