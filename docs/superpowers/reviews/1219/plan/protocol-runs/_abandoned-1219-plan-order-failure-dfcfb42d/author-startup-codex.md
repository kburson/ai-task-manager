# Codex Author Startup — #1219 Plan-Only Co-Review

You are a new Codex session acting as the sole AUTHOR in a filesystem-muxed
co-review. Claude is the independent REVIEWER. Follow this file and the
generated `author-handoff.md` completely. Repository and mux state override
chat history after any reset or compaction.

## Exact authority

- Repository: `kburson/ai-task-manager`
- Governed worktree:
  `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation`
- Governed branch: `cloud-test-automation`
- Protocol directory:
  `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart`
- Protocol ID: `dfcfb42d-33aa-40c0-ad5b-621a5e227bbd`
- Sole editable review artifact:
  `docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md`
- Initial plan commit: `09d1835085fd2d010546f2f99103daec55244023`
- Initial plan SHA-256:
  `sha256:acd1b77ee70dc66fa1edaab6929041fe0b7f54d9b29260a0fbc707d3e32c6f87`
- Accepted normative specification:
  `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`
  at `1375edfd4b29c98e407ae428a15f992dbdff2cd6`
- Refreshed implementation comparison baseline: `origin/trunk` at
  `07984e5137ba53f56fe062a351e5dd4111fb87bd`
- Review budget: 12 reviewer handoffs.
- One wait episode: at most 15 separately observed waits of 60 seconds.
- Terminal archive destination, owned only by the AUTHOR:
  `docs/superpowers/reviews/1219/plan`

Review only the plan. The accepted specification is normative evidence, not an
editable co-review artifact. The original #1219 design, portfolio WBS, live
epic hierarchy, issue bodies, and current code are comparison evidence only.
Do not edit any file other than the plan until consensus has been accepted and
the deterministic review archive is ready to be committed.

## Required repository and task bootstrap

1. Change to the governed worktree above. Never work in TOP or another clone.
2. Read `AGENTS.md`, `.agents/skills/task/SKILL.md`, the applicable task rules,
   and relevant Superpowers review/planning skills before acting.
3. Seed the worktree if needed and prove
   `node_modules/ai-task-manager -> ..` resolves inside this worktree.
4. Run `git status --short --branch`, `git rev-parse HEAD origin/trunk`, and
   `npx aitm co-review status --dir <absolute-protocol-dir> --json`.
5. The #1219 issue timer records active AUTHOR work only. Resume it before
   author work with:

   ```text
   npx aitm resume 1219 "plan co-review author turn"
   ```

   If it is already active for this session, continue. Do not steal a live
   timer. If another active session unexpectedly owns it, inspect `npx aitm
   fleet`, preserve state, and report the exact conflict.
6. Claim only when status reports the owner role available:

   ```text
   npx aitm co-review claim --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor codex
   ```

The mux claim timestamp is the role-turn timer. The AITM #1219 timer is the
repository-work timer. Never substitute an unrecorded chat handoff for either.

## Known opening-round evidence to validate

Independently verify these observations before relying on them:

- The current plan retains original #1219 Tasks 1-11, 15-16, and 19-21, while
  replacing original Tasks 12-14, 17-18, and 22.
- Live #1226 is in Review with issue-attributed commits and is the only current
  implementation story with material completed work. It must not be rewritten
  or discarded.
- The remaining existing implementation stories have no completed deep dive or
  implementation checklist evidence, so their unstarted contracts can be
  amended through the governed issue workflow after plan acceptance.
- Minimum-churn mapping proposed for plan review:
  - preserve #1226-#1236, #1240-#1241, and #1244-#1246;
  - rewrite #1237 as amendment Task 3, #1238 as Task 4, #1239 as Task 5,
    #1242 as Task 7, #1243 as Task 8, and #1247 as Task 13;
  - create new governed children for amendment Tasks 1, 2, 6, 9, 10, 11, and
    12;
  - preserve the six sub-epics, revising root/sub-epic contracts and dependency
    edges where old issue meanings disappear.
- The current plan places WBS/issue reconciliation inside amendment Task 13,
  even though Tasks 1-12 require governed child issues before implementation.
  Validate whether reconciliation must instead be a pre-implementation,
  post-plan-acceptance migration step and correct the plan if confirmed.
- Recheck dependencies that currently name #1238, #1242, or #1247; their old
  meanings cannot silently survive issue repurposing.

These are author-side hypotheses, not pre-approved conclusions. Improve or
reject them only with repository evidence.

## Author rules of engagement

1. Only the plan file may change during active rounds. Do not edit the accepted
   spec, original plans, issue bodies, project state, source code, review files,
   mux state, or generated handoffs.
2. Read the entire current plan and the entire immutable reviewer response each
   round. Independently validate every finding; do not accept feedback merely
   because Claude proposed it.
3. Answer every `[finding:F-NNN]` exactly once with one of:
   `accepted`, `accepted-with-modification`, `rejected`, or `deferred`.
   Rejection requires `[evidence:...]`. Deferral requires an already-existing
   governed `[follow-up:#N]` plus `[safe-boundary:...]`; do not create speculative
   issues during this review.
4. Avoid defect daisy-chaining. A blocker needs direct repository evidence,
   material impact on #1219 execution, and the smallest sufficient plan
   correction.
5. Every AUTHOR turn must create a new Git commit so round history is visible.
   Normal turns commit plan improvements only, with `[#1219]` attribution. If
   every finding is rejected with evidence and no plan byte should change, use
   one explicit `--allow-empty` response-trace commit rather than silently
   reusing the prior commit. Never amend, squash, rebase, or rewrite prior
   co-review commits.
6. Before handoff, run focused plan validation, `git diff --check`, prove the
   tracked worktree is clean, and prove the handed-off commit is `HEAD` and
   changes no tracked path other than the plan since the preceding author
   commit.
7. Write a new immutable response file under the protocol directory. Never edit
   a response or review after handoff.
8. On later rounds, obtain the exact preceding review path from structured mux
   status and supply it through `--answers`.
9. Do not mutate the live #1219 hierarchy during plan review. The accepted plan
   will govern that later transaction.
10. Do not spawn another reviewer. Claude is the configured reviewer.

## Author handoff and waiting

Read the generated file first:

```text
/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart/author-handoff.md
```

The opening handoff omits `--answers`. Use the actual round number and exact
`HEAD`:

```text
npx aitm co-review handoff --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor codex --response /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart/round-N-author-response.md --artifact docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md --commit COMMIT_SHA --message "author plan response complete"
```

After every successful nonterminal author handoff:

1. Pause the issue timer so reviewer wait time is not booked as author work:

   ```text
   npx aitm pause "waiting for plan reviewer"
   ```

2. Run structured mux status.
3. If Claude owns the turn, run this as a separately observed call:

   ```text
   npx aitm co-review wait --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor codex --timeout 60
   ```

4. Record `wait cycle N/15`. Exit 3 is an ordinary timeout: run status, then
   another separate wait only while Claude still owns the turn. Never hide
   waits in a shell loop or reset the count silently.
5. When status returns the owner role, resume #1219 before claiming. After 15
   timeouts, or on intervention-required/integrity refusal, preserve everything,
   report exact status, and stop.

## Author-only finalization boundary

Claude must never invoke `co-review finalize`, with or without `--good-enough`.
The protocol deliberately has no configured archive destination so reviewer
acceptance becomes durable and normally returns exit 4 with publication
pending. Claude stops after the accepted reviewer handoff. The waiting AUTHOR
observes terminal `accepted`, verifies status and exact evidence, then alone
runs:

```text
npx aitm co-review finalize --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --archive-dir docs/superpowers/reviews/1219/plan
```

Never use `--good-enough` without a new, explicit authenticated-human
instruction at an intervention boundary. After ordinary consensus
finalization, verify the generated archive, stage only the plan and/or exact
archive outputs, and create the final author-owned `[#1219]` archive commit.
Do not push, merge, close issues, or modify lifecycle state.

## Begin

Read `author-handoff.md`, bootstrap the governed task, run structured status,
claim round 1, validate and correct the known decomposition-migration concerns,
commit the plan-only author turn, write the immutable round response, hand off,
pause the issue timer, and begin the bounded wait episode.
