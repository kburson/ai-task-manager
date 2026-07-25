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
- Worktrees need no seeding: `.ai-task-manager/` config + templates are git-tracked (#574), so a `git worktree add` checkout carries every behavioral contract, and transient runtime state auto-creates under `.tmp/aitm/` on first write (#573). The `seed-worktree` helper was retired in #575.
- **`node_modules/` bootstrap (#791).** `node_modules/` is inherently untrackable, and every SessionStart/PreCompact/PostCompact hook plus the bash/agent/activity PreToolUse guards resolve through the _unscoped_ alias `node_modules/ai-task-manager` (a self-link to the repo root). A worktree where npm was never run lacks that link, so `node <missing path>` crashes and Claude Code treats the failed hook/guard as a non-blocking no-op — the timing roll-up, SessionStart self-heal, and every guard **silently fail open**. After creating a worktree, run `npm ci` (or `npm run link:self` if deps are already present) so the link exists and the hooks + guards fire. The `link:self` script and the npm `prepare` lifecycle both invoke `scripts/task-tracker/ensure-self-link.mjs`, which is idempotent and dogfooding-gated (`isDevPackage()` — no effect on consumer installs).
- Every worktree starts from fresh `trunk` HEAD. Delete any pre-existing local branch that would collide with the planned worktree branch name before dispatch. Verify post-dispatch that `git -C <worktree> rev-parse HEAD == git rev-parse trunk`.

### 2a. Worktree-isolation dispatch recipe (`Agent({ isolation: "worktree" })`)

Aligned with Anthropic's `superpowers:using-git-worktrees` + `superpowers:dispatching-parallel-agents` skills (consulted under #299). The native isolation mechanism in this harness is `Agent({ isolation: "worktree" })`, with `EnterWorktree` / `ExitWorktree` as deferred tools for explicit orchestrator-side worktrees. Use the native tool; do not shell out to `git worktree add` when a native mechanism exists (the superpowers skill flags that as Red Flag #1).

Two failure modes were diagnosed against this recipe in #299:

- **Stale base.** Symptom: isolation worktree forks off a HEAD that does not include the orchestrator's pending edits. Root cause: dispatch happened before the orchestrator's working tree was committed. **Fix:** the orchestrator MUST commit (or stash) all pending edits to trunk before dispatching an isolated agent. The pre-dispatch checklist is `git status --porcelain` clean + `git rev-parse HEAD` matches intent.
- **Edit/Write path-restricted to the isolated tree.** Symptom: subagent's `Edit`/`Write` calls refuse to touch paths outside its isolation worktree. **This is correct isolation behavior, not a bug.** Subagents should read AND write inside their isolated worktree; the orchestrator merges the branch back after the agent returns. Do not "cd out of isolation" — that defeats the mechanism. If the subagent legitimately needs to write outside its tree, the work belongs in the orchestrator, not the subagent.

Working recipe:

```
1. Orchestrator: commit all pending edits to trunk. `git status --porcelain` must be empty.
2. Orchestrator: dispatch `Agent({ isolation: "worktree", prompt: <self-contained brief> })`.
   - The subagent receives no conversation history. The brief must carry every
     fact the agent needs: bound issue #, scope boundaries, verb chain, STOP
     conditions, and final-report schema (see §3 + worker-context-contract.md).
3. Subagent: bind `/task #N`, read + edit + commit INSIDE the isolated worktree,
   return its final report as plain text (per dispatching-parallel-agents).
4. Orchestrator: after Agent returns, merge the subagent's branch into trunk
   (fast-forward when possible). The native worktree is auto-cleaned when no
   changes remain; an explicit cleanup is rarely needed.
5. For READ-ONLY fan-out (research, grep, audit) omit isolation entirely —
   isolation costs ~200–500ms of setup per agent and adds no value when no
   writes will occur.
```

Skill cross-references (read these before authoring a worktree dispatch):

- `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/using-git-worktrees/SKILL.md`
- `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/dispatching-parallel-agents/SKILL.md`

### 2b. Epic-child dispatch — base on the epic head, not trunk (#905)

Native `Agent({ isolation: "worktree" })` always forks off `trunk`/`HEAD`. That is
correct for a **standalone** story, but **wrong for an epic child**: a child cut from
trunk misses its siblings' merged work and cannot fast-forward back into the epic
(the #859 wrong-base debacle). When the sub-issue belongs to an epic, do **not** use
native isolation — cut the worktree from the epic head, by construction:

```
node scripts/task-tracker/cut-child-worktree.mjs <child#> <worktree-path>
```

This resolves the child's epic branch live from the sub-issue graph and runs
`git worktree add -b feature/child/<N> <path> <epicHead>`, so the child is based on
the epic head every time. Dispatch the agent into that pre-cut path. Two fail-closed
backstops make the gap safe if the wrong path is ever taken:

- The **epic-base edit-guard** (`epic-base-edit-guard.mjs`, PreToolUse Edit/Write)
  refuses the first source edit in any `feature/child/<N>` worktree whose base is not
  its epic head — the mis-based child is caught before any work is wasted.
- **Merge-back** is owned too: `node scripts/task-tracker/merge-back.mjs <child#> <path>`
  opportunistically syncs the epic, rebases the child onto the epic head, runs the
  child's tests, then `git merge --ff-only` into the epic and cleans up — refusing on
  rebase conflict or test failure. When trunk advances under a live epic, resync it
  with `node scripts/task-tracker/sync-epic.mjs <epic#>` (see `aitm help` → Epic Branching).

The epic branch itself is cut once with `node scripts/task-tracker/cut-epic-branch.mjs <epic#>`
(from trunk for a root epic, from the parent-epic head for a nested one).

### 2c. Block-or-drop a feature (epic child that can't ship) (#912)

An epic child that turns out unshippable mid-flight is **never silently
abandoned** — leaving it half-done desyncs the epic head and hides the reason the
work stopped. There are exactly two sanctioned outcomes:

- **Block it.** When the child is blocked by a defect that must be fixed first,
  annotate it as blocked the moment the blocker issue is filed: add the `BLOCKED`
  label, set the project `Blocked By` field, and write the `aitm-blocked-by: #B`
  body marker. Then drive the blocker chain **deepest-first** — finish the blocker
  (and anything it itself spawns) to Done before resuming the child; `pull-next`
  auto-unparks the child when its blocker lands. See the
  [Blocking-defect isolation dance](workflow.md#blocking-defect-isolation-dance).
- **Drop it.** When the feature is not merely blocked but should not ship at all,
  remove it from the epic's child set explicitly (unlink the sub-issue and close it
  `not planned`, or `supersede` it if the work moved under another issue) so the
  epic's done/delivered accounting no longer waits on it. Done-vs-delivered
  (workflow.md → Two-Axis Delivery Model) is only correct if every remaining child
  is one the epic still intends to deliver.

The rule is: a child is either driven to done on its parent branch, blocked with a
recorded blocker, or dropped with an audit trail — but never left dangling.

---

## 3. Per-agent prompt requirements

Each agent prompt is self-contained — the spawned session has no memory of the orchestrator's context. The full prompt-construction contract — orchestrator pack, worker boot pack, task pack, chatter policy, and final-report schema — lives in [`worker-context-contract.md`](worker-context-contract.md). That doc is the source of truth for what goes into a worker prompt and what comes back; this section is the per-prompt checklist.

Required elements:

- **Bound issue:** Every prompt names the GitHub issue the agent is bound to. The agent's first action is `/task #<N>` to bind the session.
- **Scope boundaries:** Explicit "you may edit X, Y, Z; you may NOT edit A, B, C." If the sister agent owns shared territory, name it.
- **STOP conditions:** When to stop and report (verb failure twice in a row, bash-guard refusal after one fix attempt, scope creep, unresolvable ambiguity).
- **Verb chain:** The exact verbs to run, in order, with `--answer yes` for any human gates that have been pre-disabled for the batch (see §4).
- **No retroactive timing:** Pause/resume via `/task` only — never fabricate gaps (§6).

The `activity-guard` hook enforces `.ai-task-manager/activity-policy.json` on every `Edit`, `Write`, and `NotebookEdit` call. Out-of-policy writes refuse at the tool boundary; do not try to route around it — fix the policy or the scope. Writes under `.tmp/**` are exempt from classification (canonical scratch directory; gitignored) and pass in every kanban state.

---

## 4. State-machine rules (7-state model)

The state chain is: `Backlog → Refine → Plan → Develop → Test → Review → Done`.

Forward transitions run through the verb surface — never through direct `move-state.mjs` calls (§5). Backward transitions are limited to two named paths:

| Backward path           | Verb                             | Trigger                                             |
| ----------------------- | -------------------------------- | --------------------------------------------------- |
| `Review → Develop`      | `/task reject #N --reason "..."` | Reviewer rejected; reason posted as comment.        |
| any-forward → `Develop` | `/task demote #N`                | Generic step-back (e.g. ran `approve` prematurely). |

### Gates

Two human gates exist between automation steps:

| Gate                                 | Config key                  | What it blocks                                                                                                                 |
| ------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Refine→Plan, Plan→Develop promotions | `gateAnalysisToDevelopment` | `/task promote` refuses unless the required issue-body approval marker exists when `true`. (config key retained for stability) |
| Review→Done close                    | `gateReviewToDone`          | `/task close` refuses without the review-approval marker (written by `/task approve`) when `true`.                             |

Both live in `.ai-task-manager/task-tracker.json`. **Defaults are `true`.** Disable only for an approved parallel batch (§ Disabling gates for a batch) and restore both to `true` after.

### Disabling gates for a batch

```jsonc
// .ai-task-manager/task-tracker.json
{
  "gateAnalysisToDevelopment": false,
  "gateReviewToDone": false,
}
```

After the batch returns and the orchestrator has merged the worktree branches, **set both back to `true`** in the same commit that records the wrap-up. Leaving gates off across sessions is a silent guardrail failure — the next solo run will skip its human checkpoints without anyone noticing.

---

## 4a. Human-eyes-on-the-diff distinction

Two sub-agent terminal statuses look superficially identical — both end in `/task close` and Done — but encode different audit guarantees. `HUMAN_APPROVED` means a human ran `/task approve` after reading the diff (human eyes on the diff). `HUMAN_AUTHORIZED_AI_APPROVED` means a human pre-authorized the gate-keeper (Full-Auto via `TT_FULL_AUTO=1`, or single-gate-disable) but no human has yet read the diff; review is available retroactively via the commit trail and any follow-up defect/enhancement stories. Sub-agents running under `TT_FULL_AUTO=1` or single-gate-disable MUST emit `HUMAN_AUTHORIZED_AI_APPROVED`, never `HUMAN_APPROVED`. Use the right verb so the audit trail does not lie about which closures had human review.

---

## 5. `/task promote` / `/task demote` are mandatory

The canonical user-facing surface for state transitions is:

| Verb                                                | Action                                                                                                                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/task promote [<N>]`                               | Forward by one state. Reads the current state, picks the legal next state, runs the appropriate gate. Applies to all forward transitions through `Refine → Plan → Develop → Test → Review → Done`. |
| `/task next [<N>]`                                  | Alias of `/task promote`. Use whichever reads better in the moment.                                                                                                                                |
| `/task demote [<N>]`                                | Back to `Develop` from any forward state. Records the demotion in the timing log.                                                                                                                  |
| `/task reconcile <accept-live\|revert-to-recorded>` | Drift recovery only — see §7.                                                                                                                                                                      |

`/task approve`, `/task review`, and `/task close` remain first-class verbs (they carry side effects beyond the state move: marker stamps, verification dispatch, fleet deregister). The retired single-purpose verbs for the Refine-and-Plan transitions have been removed; use `/task promote` (or `/task next`) for those transitions.

**Forbidden:**

- `scripts/gh/move-state.mjs <N> <state>` invoked directly. No exceptions — `/task promote` calls it internally so the timing flush, fleet update, and field-DB write all happen atomically.
- `gh issue close <N>` directly. Same reason — bypasses timing.
- A user-facing `/task move <state>` verb. It does not exist; if you see it in older docs or prompts, replace it with `/task promote`.

---

## 6. No retroactive timing

The timing log is append-only and reflects only real-time pause/resume events. Gaps stay as gaps.

- A blocking question pauses the timer: `/task pause "pause for question"` before asking; `/task start "question answered"` on resume.
- Agents that wake from a long idle do NOT backfill the gap. The rollup classifies short pauses (`≤ reviewPauseThresholdMin`) as Review; longer gaps are excluded from Engaged. Both are correct outcomes — fabricating "I was thinking during those 47 minutes" is not.
- Editing past timing-log rows is a guardrail violation. If a row is genuinely wrong (e.g. stuck-timer recovery), use `/task reconcile` — never hand-edit.

---

## 7. Drift handling

State drift means the project board and the local field-DB disagree about an issue's state, size, or estimate. Common causes: a human moved the card manually, a crashed verb wrote one side but not the other, a worktree state file got out of sync.

Recover with `/task reconcile`:

| Mode                                     | Behaviour                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `/task reconcile <N> accept-live`        | Treat GitHub Projects as source of truth. Rewrite local field-DB / timing log to match. |
| `/task reconcile <N> revert-to-recorded` | Treat the local recorded state as source of truth. Push it back to the board.           |

Do not run any other verb on a drifted issue first — `reconcile` is the entry point. Forward verbs on a drifted issue can compound the drift (writing a partial update to whichever side was already lagging).

---

## 8. Post-mortem procedure

Any guardrail violation, lost work, or unexpected board-state corruption ends with a post-mortem.

- Template: [`docs/guides/postmortem-template.md`](postmortem-template.md).
- Output: `docs/postmortems/YYYY-MM-DD-<slug>.md`, one file per incident.
- Required outputs: a concrete guardrail change (new hook, tightened policy, refused-state, documentation patch) committed in the same branch as the writeup. A post-mortem without a guardrail change is incomplete.
- Link the post-mortem from the GitHub issue that triggered it, and (if the change is non-trivial) from `CLAUDE.md` or the relevant skill section.

The procedure is blameless on individuals and blameful on guardrails — every incident is, by definition, a place the rules let the wrong thing through.

---

## 9. Worker context contract

The mechanics in §1–§8 cover orchestration: when to spawn, where workers run, how state transitions land, how to recover from drift. The complementary question — what context flows in to a worker session and what shape reports return — is specified in [`worker-context-contract.md`](worker-context-contract.md).

The short version:

- Three named packs (orchestrator / worker boot / worker task); only the boot pack and task pack reach the worker prompt.
- Workers stay silent unless blocked or producing their final report.
- Final reports are a flat structured schema; no narrative dumps.
- No inherited orchestrator transcript; the boot pack points at [`.ai-task-manager/templates/session-boot.md`](../../.ai-task-manager/templates/session-boot.md) so workers reload Tier-1 rules from source (#190).

Use [`templates/worker-report.md`](../../templates/worker-report.md) as the report template.
