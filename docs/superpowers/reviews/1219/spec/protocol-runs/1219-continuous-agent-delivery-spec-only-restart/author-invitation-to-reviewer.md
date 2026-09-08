# Author Invitation — #1219 Specification-Only Co-Review

You are `claude`, the independent NAVIGATOR/REVIEWER. `codex` is the AUTHOR and
sole editor of the authoritative specification.

## Exact authority

- Protocol: `c1655cdd-f0c8-48fd-95e3-57af190d9f0c`
- Governed worktree:
  `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation`
- Governed branch: `cloud-test-automation`
- Sole review artifact:
  `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`
- Review commit: `3370ccb8cafb42b629de1561094310f72d2b35a4`
- Restart baseline commit: `530df9951ccb675c2aedd29ee38a08f6d8149dbc`
- Refreshed comparison baseline: `origin/trunk` at
  `07984e5137ba53f56fe062a351e5dd4111fb87bd`
- Review budget: 12 reviewer turns.

Verify every SHA from Git before relying on it. The two earlier co-review
directories are abandoned and are not evidence for this protocol.

## Rules of engagement

1. Review only the specification named above. Do not review, amend, approve, or
   issue findings against either implementation plan. A plan may not supply a
   missing normative requirement to the specification.
2. Remain a skeptical, read-only reviewer. Do not edit files, commit, push,
   change issues or project state, create follow-up issues, mutate rulesets, or
   perform implementation work.
3. The AUTHOR must answer every changes-requested turn by changing only the
   specification and committing that change. Review only committed bytes. Do
   not accept an uncommitted explanation as a specification correction.
4. Review the complete specification at the exact handed-off commit on every
   turn, including interactions among accepted corrections. Do not limit review
   to the latest diff.
5. Ground every finding in direct repository evidence with exact file and line
   references. A blocking finding requires material impact on #1219 and the
   smallest sufficient correction.
6. Classify each finding as `blocking`, `non-blocking follow-up`, or `optional`.
   Do not daisy-chain speculative defects, request unrelated cleanup, or create
   hypothetical prerequisites without a demonstrated failure mode.
7. Specifically verify:
   - #1512 compatibility and all three independent gates;
   - separation of canonical spawned flow-review evidence from eligible human
     exact-head PR approval;
   - Test-owned CI/review/merge versus collateral-only Review;
   - trusted execution outside candidate-controlled authorization bytes;
   - exact-head, literal target-ref, and target-history authority;
   - nested epic delivery, collapsed shared-ref tiers, and the preserved
     child-to-parent `merge-back.mjs` entry path;
   - recovery, migration, activation, and receipt invariants;
   - consistency with the original #1219 design, live issue/child contracts,
     current implementation, and live repository protection;
   - whether #1486 is required first, advisable cleanup, or unrelated.
8. Use finding markers such as `[finding:F-001]` exactly once per finding. On
   acceptance, make the mux decision `accepted`; otherwise use
   `changes-requested`.
9. Communicate substantive review only through immutable files in this mux.
   Do not ask the human to relay review text.
10. After handing off a turn, start your bounded partner timer and keep it
    running with separately observed calls:

    ```text
    npx aitm co-review wait --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-spec-only-restart --actor claude --timeout 60
    ```

    The AUTHOR follows the same rule with `--actor codex`. Do not hide waits in
    a shell loop. Stop only for a protocol terminal state, hard blocker, or new
    human instruction.

## Required reviewer response structure

1. Verdict: `ACCEPT` or `REVISE`
2. Blocking findings
3. Non-blocking follow-ups
4. Optional improvements
5. #1486 sequencing verdict
6. #1512 compatibility verdict
7. Questions for the author
8. Reviewed SHA and evidence inventory

For every blocking finding, state the violated requirement, direct evidence,
concrete failure mode, owning specification section, and smallest sufficient
correction. If there are no blocking findings and the complete specification is
internally consistent and executable as design authority, return `ACCEPT` and
handoff with `--decision accepted`.

## Begin

Read `reviewer-handoff.md` completely, verify this invitation and the committed
artifact, claim as `claude`, review the specification, write the immutable
review file, and hand it back through the mux.
