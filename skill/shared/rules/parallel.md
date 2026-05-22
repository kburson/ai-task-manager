<!-- aitm-skill-version: 1.0.0 -->

# rules/parallel.md

Tier-2. Loaded JIT on any parallel fan-out (≥2 candidate children, or any worktree dispatch). On first read, emit:

```
aitm-skill-loaded:rules/parallel:1.0.0
```

## Patterns

**Epic / sub-issue.** Start `/task #<epic> --role orchestrator` in the main worktree, fan sub-issues to agent worktrees (agents use `--role agent` via the Pickup Directive). Epic accumulates orchestration time (human engagement); sub-issues accumulate execution time (AI effort). The value report uses the role written into each `start` row to compute Human Leverage.

**Solo fan-out.** When fanning a set of independent issues with no parent epic, the main thread stays on whichever issue was active when fan-out began. That issue's time records the orchestration cost. If no task is active, **stop and ask the user to pick an anchor before dispatching any agents** — never fan out without one. The anchor task must NOT itself be dispatched to an agent; its timing log belongs exclusively to the orchestrator.

`mainThreadOnly: true` in preferences disables parallel dispatch entirely — commit straight to trunk, no worktrees.

## Worktree creation (NON-NEGOTIABLE)

Every worktree MUST start from a fresh branch off `trunk` HEAD. The `Agent` tool's `isolation: "worktree"` flag does NOT guarantee this — it may reuse a pre-existing local branch with the same name and check out its stale tip. Stale-base work is wasted at best, regression-introducing at worst.

**Orchestrator pre-flight (every dispatch):**

1. `git fetch origin trunk` if needed; verify `git rev-parse trunk` is current.
2. Delete pre-existing local branches that would collide with planned worktree names: `git branch -D <name>` for each.
3. After dispatch, verify each worktree's base SHA matches trunk HEAD:

   ```bash
   git -C .claude/worktrees/<agent-id> rev-parse HEAD  # must equal `git rev-parse trunk`
   ```

   If it doesn't: kill the agent, `git worktree remove -f -f <path>`, `git worktree prune`, delete the stale branch, relaunch.

**Agent bootstrap MUST include (in the agent prompt):**

```
1. cd into the assigned worktree path
2. git rev-parse HEAD                # capture current SHA
3. git rev-parse origin/trunk        # capture trunk HEAD (or local trunk if no remote)
4. If they differ: STOP. Report "stale base; please relaunch" and exit.
   Do NOT rebase/merge/reset — risks corrupting state across worktrees.
5. npm install --no-audit --no-fund
6. node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs "#<N>" --role agent
7. Read .ai-task-manager/pickup-directive.md IN FULL.
```

**State-isolation guard.** Before dispatching, snapshot `.ai-task-manager/task-tracker.json` and `task-tracker-state.json` from the main repo. Agents occasionally resolve git-root wrong from inside a worktree and write to main-repo state. After all agents return, diff the snapshots; restore if changed unexpectedly.

## Worktree Config Seeding — MANDATORY

`.ai-task-manager/` is gitignored. `git worktree add` creates a worktree **without** `task-tracker.json`, `pickup-directive.md`, or `definition-of-done.md`. An agent booting into an unseeded worktree hits `config-not-found` and MUST `STATUS: BLOCKED`. Work performed in an unseeded worktree is discarded.

Run the seed helper **immediately after `git worktree add` and before the agent boots**:

```bash
node node_modules/ai-task-manager/scripts/task-tracker/seed-worktree.mjs <worktree-path>
```

Copies `task-tracker.json`, `pickup-directive.md`, `definition-of-done.md` from the parent repo, creates an empty `task-tracker-state.json`. Refuses to overwrite a populated target.

## Wave parent — required for solo fan-out of ≥2

**Before** the per-child `dispatch-prep.mjs` loop, when the planned fan-out spans **2 or more candidate children**, run:

```bash
node node_modules/ai-task-manager/scripts/gh/ensure-wave-parent.mjs \
  --children <N1>,<N2>,<N3> \
  --purpose "<one-line summary>"
```

Classification:

| Result                           | Behavior                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `len == 1`                       | No-op; `NO_WAVE_PARENT_NEEDED`; exit 0                                                                                         |
| All solo, `len ≥ 2`              | Creates parent at `Status=Develop`, links each child via `addSubIssue`, posts orchestration `start` row, prints `PARENT: #<N>` |
| All share one existing parent    | Prints existing `PARENT: #<N>`; no new issue                                                                                   |
| Mixed (some solo, some parented) | **REFUSES** — exit 2 `wave-detect: mixed-fanout`. Hoist solos under the existing parent (or detach the parented child).        |
| Multi-parent                     | **REFUSES** — exit 2 `wave-detect: multi-parent`. These are two waves.                                                         |

After `PARENT: #<N>`:

1. Switch active task to the parent: `/task #<N>`.
2. **Then** run the per-child `dispatch-prep.mjs` loop.

Children continue to log time on their own issues. Parent's ⏱ Timing Log accumulates orchestration time only. Leave parent's Size/Estimate blank for human grooming.

**Idempotency.** Parent body carries `<!-- wave-id: ... -->` derived from sorted child list. On retry mid-dispatch, helper reuses existing parent.

## Pre-dispatch board flip — orchestrator owns the transition

Sub-issues about to be picked up by an agent MUST be moved to `In Progress` **by the orchestrator, before the agent boots**, and the `start` timing row MUST be posted by the orchestrator at the same moment. Do not rely on the agent's bootstrap — if it fails, the board state lies (still `Backlog`) and the work is invisible.

For each sub-issue about to be dispatched:

```bash
node node_modules/ai-task-manager/scripts/gh/dispatch-prep.mjs <SUB_N> --description "agent dispatch (sequence <S>)"
```

`dispatch-prep.mjs` runs `move-state.mjs <N> in-progress`, posts a `start` row to ⏱ Timing Log. Both happen before the agent boots. The agent's own bootstrap will call them again as idempotent confirmations.

## Orchestrator post-dispatch verification (≤60s after dispatch)

For every agent dispatched, complete all four checks within 60s. If any fails: kill the agent, force-remove the worktree (`git worktree remove -f -f <path> && git worktree prune`), re-dispatch.

1. **Worktree config present:** `test -f <worktree>/.ai-task-manager/task-tracker.json`.
2. **Agent registered in fleet:** `task-tracker.mjs fleet` lists the agent's session and issue.
3. **Issue moved to In Progress:** `gh issue view <N> --json projectItems` shows status `In Progress`.
4. **`start` row posted:** the issue's ⏱ Timing Log contains a row with `event=start` at or after dispatch.

A dispatch with no `start` row in 60s is a silent bootstrap failure. Treat it the same as `STATUS: BLOCKED` — the agent is not running the contract.

## Canary before fan-out

The first multi-agent dispatch in a repository, OR any dispatch following a change to the worktree/bootstrap pipeline (seed helper, pickup directive Hard Rules, agent prompt, or this file), MUST start with a **single-agent canary** on the smallest available sub-issue.

The fan-out is gated on the canary's `start` row landing in the ⏱ Timing Log. If the canary fails post-dispatch verification, do not fan out — fix the pipeline first. Parallel dispatch amplifies a broken pipeline into N units of discarded work.

## Subagent completion semantics

Subagents MUST report one of these statuses. **`DONE` and `DONE_WITH_CONCERNS` are not valid** — ambiguous, cause premature sequence-advance.

| Status                         | Meaning                                                                                                                                                                                                                                                                                                             | Orchestrator action                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `CODE_COMPLETE`                | Implementation done; some DoD items unverifiable by this agent. Agent lists them.                                                                                                                                                                                                                                   | Do NOT advance the sequence. Inspect remaining items; resolve or reassign.                                                          |
| `ISSUE_READY_FOR_REVIEW`       | All agent-verifiable AC + Verification Commands + DoD checked. `/task review` run. Issue in Review. For epics: only after `/task review #<epic>` and epic itself reaches Review.                                                                                                                                    | Notify the human. Do NOT run `/task close`. Count toward sequence completion only after human runs `/task close`.                   |
| `HUMAN_APPROVED`               | Human explicitly ran `/task approve` (or equivalent) after reading the diff — eyes on the diff. Sub-agents under `TT_FULL_AUTO=1` or single-gate-disable MUST NOT emit this; they emit `HUMAN_AUTHORIZED_AI_APPROVED` instead.                                                                                      | Run `/task close <N>`. Count as Done. Advance sequence only after every sequence-issue is Done.                                     |
| `HUMAN_AUTHORIZED_AI_APPROVED` | Human pre-authorized the gate-keeper (`TT_FULL_AUTO=1` or single-gate-disable); agent ran auto-approve; tests passed; code committed and merged to trunk; issue closed at Done. No further human action required — review is available retroactively via the commit trail and follow-up defect/enhancement stories. | Run `/task close <N>`. Count as Done. Treated as a terminal success status equivalent to `HUMAN_APPROVED` for close/merge purposes. |
| `BLOCKED`                      | Cannot proceed without orchestrator/human help.                                                                                                                                                                                                                                                                     | Intervene, then redispatch or reassign.                                                                                             |

**Sequence-advance rule.** A sequence is complete only after every issue reaches **Done** via `/task review` → human approval → `/task close`. `CODE_COMPLETE` and `ISSUE_READY_FOR_REVIEW` do not count.

## Task context — active task must match work happening now

- `/task #epic` when dispatching, reviewing output, orchestrating, or deciding next fan-out.
- `/task #child` when performing that child's work directly in this session (no sub-agent).
- Switch back to `/task #epic` the moment work is handed to a sub-agent or you return to orchestration.
- **`/task update` every time an agent returns.** Each completion is a checkpoint — flush timing and reset counters before the next batch. Without this, long sessions accumulate unbounded wall-clock with no intermediate record.
- Starting an epic for fan-out: `/task #<epic> --role orchestrator`. Records your session as human engagement cost in the value report.

## Pre-parallel gate toggle

If `askGatesBeforeParallel=true` (default), prompt the user which human gates to disable before parallel sub-agent dispatch (`analyze→dev`, `review→done`, both). Encode the choice into the agent prompts. Restore the gates after the wave completes.
