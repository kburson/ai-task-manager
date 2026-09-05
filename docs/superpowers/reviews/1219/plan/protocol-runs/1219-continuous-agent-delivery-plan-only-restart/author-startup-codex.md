# Codex Author Startup — #1219 Plan-Only Co-Review

You are a new Codex session acting as the sole AUTHOR. Claude is the independent
REVIEWER. The human must start this author session first. Claude must not be
started until you complete the opening owner handoff and explicitly report
`AUTHOR_HANDOFF_COMPLETE`.

Read this file and the generated `author-handoff.md` completely. Repository and
mux state override chat history after reset or compaction.

## Exact authority

- Repository: `kburson/ai-task-manager`
- Worktree:
  `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation`
- Branch: `cloud-test-automation`
- Protocol directory:
  `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart`
- Protocol ID: `7374809a-7f65-493f-b74d-d66b8d173eca`
- Sole editable artifact:
  `docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md`
- Initial commit: `bd493ea2923705fb2a9039659359d1c3a84d1980`
- Initial artifact SHA-256:
  `sha256:acd1b77ee70dc66fa1edaab6929041fe0b7f54d9b29260a0fbc707d3e32c6f87`
- Normative accepted specification:
  `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`
  at `1375edfd4b29c98e407ae428a15f992dbdff2cd6`
- Initial implementation comparison: `origin/trunk` at
  `07984e5137ba53f56fe062a351e5dd4111fb87bd`; fetch and repin if it moved.
- Reviewer budget: 12 handoffs.
- Wait episode: at most 15 separately observed 60-second waits.
- AUTHOR-only archive destination: `docs/superpowers/reviews/1219/plan`.

Review only the plan. The accepted spec is immutable normative evidence. The
original design/plan, live #1219 graph and issue bodies, and current code are
read-only comparison evidence.

## Bootstrap and opening order

1. Change to the exact worktree. Never work in TOP or another checkout.
2. Read `AGENTS.md`, `.agents/skills/task/SKILL.md`, applicable task rules, and
   relevant planning/review skills.
3. Verify `node_modules/ai-task-manager -> ..`, clean tracked state, exact
   branch/HEAD, and current `origin/trunk`.
4. Read:

   ```text
   /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart/author-handoff.md
   ```

5. Run structured status. It must report protocol
   `7374809a-7f65-493f-b74d-d66b8d173eca`, round 1, `currentRole=owner`, and
   `turnState=available`. Otherwise stop with exact status.
6. Resume the #1219 task timer, then claim the owner turn:

   ```text
   npx aitm resume 1219 "plan co-review author round 1"
   npx aitm co-review claim --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor codex
   ```

The task timer records active author work. The mux claim/handoff timestamps
record the role turn. Never substitute chat messages for either.

## Mandatory opening correction

Do not hand off an empty opening commit. Independently validate and resolve
these known plan/WBS concerns in the plan itself:

- Preserve original #1219 Tasks 1-11, 15-16, and 19-21 and preserve #1226's
  completed/reviewing work.
- Decide and state the exact minimal migration for currently unused #1237,
  #1238, #1239, #1242, #1243, and #1247.
- The current minimum-churn hypothesis maps those issues to amendment Tasks 3,
  4, 5, 7, 8, and 13 and creates new children for Tasks 1, 2, 6, 9, 10, 11,
  and 12. Verify rather than assume it.
- Preserve the six sub-epics, but identify root/sub-epic contract changes and
  every dependency whose old issue meaning disappears.
- Move WBS/issue reconciliation out of late Task 13 if governed children are
  required before Tasks 1-12 can execute. Define the post-plan-acceptance,
  pre-implementation migration boundary.

Commit the corrected plan with `[#1219]`. Do not amend or rewrite the prior
empty startup commit. Run focused formatting/lint/structure checks and
`git diff --check`; prove the worktree and index are clean and `HEAD` contains
only plan changes since the preceding author commit.

Write a new immutable `round-1-author-response.md` explaining the opening
corrections, then hand off using the exact new `HEAD`:

```text
npx aitm co-review handoff --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor codex --response /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart/round-1-author-response.md --artifact docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md --commit COMMIT_SHA --message "author plan response complete"
```

After success, report `AUTHOR_HANDOFF_COMPLETE — start Claude now`, pause the
task timer, and begin the author wait episode. Do not start Claude yourself.

## Later author rounds

- Obtain the exact immutable review path from structured status and read the
  entire review and entire plan.
- Independently validate every `[finding:F-NNN]` and answer it exactly once with
  `accepted`, `accepted-with-modification`, `rejected`, or `deferred`.
- Rejection requires `[evidence:...]`. Deferral requires an existing governed
  `[follow-up:#N]` and `[safe-boundary:...]`; create no speculative issue here.
- Edit only the plan. Every author turn gets a new non-rewritten `[#1219]`
  commit. If every finding is rejected with evidence and no plan byte should
  change, use an explicit `--allow-empty` round-trace commit.
- Supply the immutable prior review with `--answers` on the handoff. Never edit
  any handed-off response, review, event, state, manifest, or generated handoff.
- Do not mutate issues, project state, source code, spec, original plans,
  rulesets, branches, or remotes during this review.

Avoid defect daisy-chaining. A blocker needs direct repository evidence,
material #1219 impact, and the smallest sufficient plan correction.

## Timer handoff and bounded waiting

After every successful nonterminal author handoff:

1. Pause issue time: `npx aitm pause "waiting for plan reviewer"`.
2. Run structured mux status.
3. While Claude owns the turn, run each wait as a separate observed call:

   ```text
   npx aitm co-review wait --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor codex --timeout 60
   ```

4. Record `wait cycle N/15`, then status. Exit 3 is a normal timeout. Never use
   a shell loop or silently reset the count.
5. When owner becomes available, resume #1219 before claiming. After 15
   timeouts, or on integrity refusal/intervention, preserve state and stop.

## AUTHOR-only finalization

Claude must never invoke `co-review finalize`. No archive destination is stored
in mux config, so accepted reviewer consensus should become durable with
publication pending. The waiting AUTHOR observes terminal `accepted`, verifies
the exact terminal evidence, resumes #1219, and alone runs:

```text
npx aitm co-review finalize --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --archive-dir docs/superpowers/reviews/1219/plan
```

Never use `--good-enough` without a new explicit authenticated-human
instruction at an intervention boundary. Verify and commit only the generated
archive outputs with `[#1219]`. Do not push, merge, close, or move issues.

## Begin

Complete the mandatory opening correction and owner handoff before telling the
human to launch Claude.
