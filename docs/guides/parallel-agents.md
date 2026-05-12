# Parallel Agents — Rules of Engagement

How to fan out parallel sub-agents in this repo without corrupting state, timing, or the project board. Operational details for worktrees, fleet, and bootstrap live in [`skill/shared/SKILL.md`](../../skill/shared/SKILL.md) § Multi-Agent / Parallel Worktrees — this guide is the rule surface; that section is the runbook.

---

## 1. When to spawn parallel agents

Parallel sub-agents are an **explicit, approved** operation — never the default.

- The orchestrator names the candidate sub-issues, estimates the parallelism (count + expected duration), and lists shared files (anything more than one agent might touch).
- The user must approve **before** any `Agent` spawn. "No spawning without approval" — see `CLAUDE.md` § Sub-Agents.
- Each candidate must already have `Size`, `Estimate`, `Priority`, and Acceptance Criteria set on the board. Unsized / un-AC'd issues do not fan out.
- If any two candidates touch the same file, either serialize them or split the file ownership in the prompts. Do not let two agents race the same path.

---

## 2. Worktree requirement

**Every `Agent` spawn runs in its own git worktree.** The orchestrator stays in the main worktree; agents work in `.claude/worktrees/<agent-id>/`.

- The `agent-guard` hook blocks `Agent` tool invocations issued from the main worktree. If you see that block, you skipped a worktree — create one and retry.
- Worktrees are seeded by `scripts/task-tracker/seed-worktree.mjs` (copies `.ai-task-manager/` runtime files). An unseeded worktree fails closed at agent bootstrap; work performed there is discarded.
- Every worktree starts from fresh `trunk` HEAD. Delete any pre-existing local branch that would collide with the planned worktree branch name before dispatch. Verify post-dispatch that `git -C <worktree> rev-parse HEAD == git rev-parse trunk`.

---

## 3. Per-agent prompt requirements

Each agent prompt is self-contained — the spawned session has no memory of the orchestrator's context.

Required elements:

- **Bound issue:** Every prompt names the GitHub issue the agent is bound to. The agent's first action is `/task #<N>` to bind the session.
- **Scope boundaries:** Explicit "you may edit X, Y, Z; you may NOT edit A, B, C." If the sister agent owns shared territory, name it.
- **STOP conditions:** When to stop and report (verb failure twice in a row, bash-guard refusal after one fix attempt, scope creep, unresolvable ambiguity).
- **Verb chain:** The exact verbs to run, in order, with `--answer yes` for any human gates that have been pre-disabled for the batch (see §4).
- **No retroactive timing:** Pause/resume via `/task` only — never fabricate gaps (§6).

The `activity-guard` hook enforces `.ai-task-manager/activity-policy.json` on every `Edit`, `Write`, and `NotebookEdit` call. Out-of-policy writes refuse at the tool boundary; do not try to route around it — fix the policy or the scope. Writes under `tmp/**` are exempt from classification (canonical scratch directory; gitignored) and pass in every kanban state.

---

## 4. State-machine rules (7-state model)

The state chain is: `Backlog → Groom → Analyze → Development → Validate → Review → Done`.

Forward transitions run through the verb surface — never through direct `move-state.mjs` calls (§5). Backward transitions are limited to two named paths:

| Backward path | Verb | Trigger |
|---|---|---|
| `Review → Development` | `/task reject #N --reason "..."` | Reviewer rejected; reason posted as comment. |
| any-forward → `Development` | `/task demote #N` | Generic step-back (e.g. ran `approve` prematurely). |

### Gates

Two human gates exist between automation steps:

| Gate | Config key | What it blocks |
|---|---|---|
| Groom→Analyze, Analyze→Development promotions | `gateAnalysisToDevelopment` | `/task promote` refuses without `--answer yes` when `true`. |
| Review→Done close | `gateReviewToDone` | `/task close` refuses without the review-approval marker (written by `/task approve-review`) when `true`. |

Both live in `.ai-task-manager/task-tracker.json`. **Defaults are `true`.** Disable only for an approved parallel batch (§ Disabling gates for a batch) and restore both to `true` after.

### Disabling gates for a batch

```jsonc
// .ai-task-manager/task-tracker.json
{
  "gateAnalysisToDevelopment": false,
  "gateReviewToDone": false
}
```

After the batch returns and the orchestrator has merged the worktree branches, **set both back to `true`** in the same commit that records the wrap-up. Leaving gates off across sessions is a silent guardrail failure — the next solo run will skip its human checkpoints without anyone noticing.

---

## 5. `/task promote` / `/task demote` are mandatory

The canonical user-facing surface for state transitions is:

| Verb | Action |
|---|---|
| `/task promote [<N>]` | Forward by one state. Reads the current state, picks the legal next state, runs the appropriate gate. Applies to `groom`, `analyze`, `approve`, `review`, `close`. |
| `/task next [<N>]` | Alias of `/task promote`. Use whichever reads better in the moment. |
| `/task demote [<N>]` | Back to `Development` from any forward state. Records the demotion in the timing log. |
| `/task reconcile <accept-live\|revert-to-recorded>` | Drift recovery only — see §7. |

The single-purpose verbs `/task analyze`, `/task approve`, `/task review`, `/task close` are **deprecated aliases** that delegate to `/task promote`. New code, new docs, and new agent prompts use `promote` / `next` / `demote`.

**Forbidden:**

- `scripts/gh/move-state.mjs <N> <state>` invoked directly. No exceptions — `/task promote` calls it internally so the timing flush, fleet update, and field-DB write all happen atomically.
- `gh issue close <N>` directly. Same reason — bypasses timing.
- A user-facing `/task move <state>` verb. It does not exist; if you see it in older docs or prompts, replace it with `/task promote`.

---

## 6. No retroactive timing

The timing log is append-only and reflects only real-time pause/resume events. Gaps stay as gaps.

- A blocking question pauses the timer: `/task pause "pause for question"` before asking; `/task start "question answered"` on resume.
- Agents that wake from a long idle do NOT backfill the gap. The rollup classifies short pauses (`≤ reviewPauseThresholdMin`) as Review Time; longer gaps are excluded from Engaged Time. Both are correct outcomes — fabricating "I was thinking during those 47 minutes" is not.
- Editing past timing-log rows is a guardrail violation. If a row is genuinely wrong (e.g. stuck-timer recovery), use `/task reconcile` — never hand-edit.

---

## 7. Drift handling

State drift means the project board and the local field-DB disagree about an issue's state, size, or estimate. Common causes: a human moved the card manually, a crashed verb wrote one side but not the other, a worktree state file got out of sync.

Recover with `/task reconcile`:

| Mode | Behaviour |
|---|---|
| `/task reconcile <N> accept-live` | Treat GitHub Projects as source of truth. Rewrite local field-DB / timing log to match. |
| `/task reconcile <N> revert-to-recorded` | Treat the local recorded state as source of truth. Push it back to the board. |

Do not run any other verb on a drifted issue first — `reconcile` is the entry point. Forward verbs on a drifted issue can compound the drift (writing a partial update to whichever side was already lagging).

---

## 8. Post-mortem procedure

Any guardrail violation, lost work, or unexpected board-state corruption ends with a post-mortem.

- Template: [`docs/guides/postmortem-template.md`](postmortem-template.md).
- Output: `docs/postmortems/YYYY-MM-DD-<slug>.md`, one file per incident.
- Required outputs: a concrete guardrail change (new hook, tightened policy, refused-state, documentation patch) committed in the same branch as the writeup. A post-mortem without a guardrail change is incomplete.
- Link the post-mortem from the GitHub issue that triggered it, and (if the change is non-trivial) from `CLAUDE.md` or the relevant skill section.

The procedure is blameless on individuals and blameful on guardrails — every incident is, by definition, a place the rules let the wrong thing through.
