# Parallel Agents — Rules of Engagement

How to fan out parallel sub-agents in this repo without corrupting state, timing, or the project board. Operational details for worktrees, fleet, and bootstrap live in [`skill/shared/SKILL.md`](../../skill/shared/SKILL.md) § Multi-Agent / Parallel Worktrees — this guide is the rule surface; that section is the runbook.

---

## 1. When to spawn parallel agents

Parallel sub-agents are an **explicit, approved** operation — never the default.

Local implementation and full-suite validation are strictly sequential while
the resource-isolated cloud CI prerequisite remains unproven. Sharing a Rank,
using separate local worktrees, or disabling an approval gate does not waive
that limit. A later parallel epic wave requires fresh dependency re-triage,
independent dependencies, isolated worktrees, distinct owners, and isolated
exact-SHA cloud validation for every child.

- The orchestrator names the candidate sub-issues, estimates the parallelism (count + expected duration), and lists shared files (anything more than one agent might touch).
- The user must approve **before** any `Agent` spawn. "No spawning without approval" — see `CLAUDE.md` § Sub-Agents.
- Each candidate must already have `Size`, `Estimate`, `Priority`, and Acceptance Criteria set on the board. Unsized / un-AC'd issues do not fan out.
- If any two candidates touch the same file, either serialize them or split the file ownership in the prompts. Do not let two agents race the same path.

---

## 2. Worktree requirement

**Every `Agent` spawn runs in its own git worktree.** For a solo / non-epic fan-out the orchestrator stays in the main worktree; agents work in `.claude/worktrees/<agent-id>/`. **For an epic run the orchestrator gets its own worktree too** — see §2e.

- The `agent-guard` hook blocks `Agent` tool invocations issued from the main worktree. If you see that block, you skipped a worktree — create one and retry.
- Worktrees need no separate config-copy step: `.ai-task-manager/` config and templates are git-tracked (#574), and transient runtime state auto-creates under `.tmp/aitm/` on first write (#573). They **do** require dependency seeding as described below; tracked policy without the runtime self-link is not an operationally ready worktree.
- **`node_modules/` bootstrap (#791).** `node_modules/` is inherently untrackable, and every SessionStart/PreCompact/PostCompact hook plus the bash/agent/activity PreToolUse guards resolve through the _unscoped_ alias `node_modules/ai-task-manager` (a self-link to the repo root). A worktree where npm was never run lacks that link, so `node <missing path>` crashes and Claude Code treats the failed hook/guard as a non-blocking no-op — the timing roll-up, SessionStart self-heal, and every guard **silently fail open**. After creating a worktree, run `npm ci` (or `npm run link:self` if deps are already present) so the link exists and the hooks + guards fire. The `link:self` script and the npm `prepare` lifecycle both invoke `scripts/task-tracker/ensure-self-link.mjs`, which is idempotent and dogfooding-gated (`isDevPackage()` — no effect on consumer installs).
- A standalone issue worktree starts from fresh `trunk` HEAD. An epic starts from its governed parent integration ref, and an epic child starts from the current epic head. Delete any pre-existing local branch that would collide with the planned worktree branch name before dispatch. Verify post-dispatch that `git -C <worktree> rev-parse HEAD` equals the exact governing base selected for that issue.

### 2a. Worktree-isolation dispatch recipe (`Agent({ isolation: "worktree" })`)

Aligned with Anthropic's `superpowers:using-git-worktrees` + `superpowers:dispatching-parallel-agents` skills (consulted under #299). The native isolation mechanism in this harness is `Agent({ isolation: "worktree" })`, with `EnterWorktree` / `ExitWorktree` as deferred tools for explicit orchestrator-side worktrees. Use the native tool; do not shell out to `git worktree add` when a native mechanism exists (the superpowers skill flags that as Red Flag #1).

**Child-worktree lifecycle: fresh per child, never pooled or reused (#871).** Each child
gets a worktree created for it and destroyed after its integration; no worktree is handed
from one child to the next. The deciding evidence is the pair of #299 failure modes below.
A pooled worktree carries **both** of them structurally: it holds a base captured when the
pool entry was created (the stale-base failure, which for an epic child is the #859
wrong-base debacle in slow motion), and it carries the previous child's residue in the
working tree and index (the dirty-state failure). Recreating a worktree costs ~200–500ms;
a mis-based or dirty child costs a wasted agent run and a corrupted integration. The
trade is not close. Fresh-per-child also makes the cleanup contract in §2f tractable,
because a worktree maps one-to-one to a child issue and its `[#N]` commit.

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

**Where cleanup runs in an epic loop, and against which base (#871).** The recipe above
is the standalone case, where step 4 targets trunk and the native auto-clean suffices. An
epic run has two cleanup points, and they pass **different** `--base` refs:

- **After each child merges back**, while the epic is still in flight, the orchestrator
  reaps that child with `--base feature/epic/<N>`. The child's `[#N]` commit is reachable
  on the epic branch but nowhere near trunk, so this is the only base under which it is
  prunable — and surviving siblings must rebase onto the **epic branch**, not trunk.
- **After the epic PR merges to trunk**, the orchestrator runs cleanup once more with the
  default `--base origin/trunk` to reap the epic branch itself and any straggler.

Both invocations share one rule: the prune predicate and the rebase target are evaluated
against the same `--base`. §2f is the contract; the routine itself is #1259.

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

> **Ratified-but-pending (#871 → #1257): child → epic integration becomes a squash.**
> The `git merge --ff-only` step above is **what ships today**, and this guide describes
> shipped behavior. The maintainer has ratified replacing it with `git merge --squash`, so
> that each child lands as exactly **one commit** on the epic branch and the epic PR
> presents a clean per-child review surface. That change order is #1257 and has not landed;
> until it does, `--ff-only` remains correct.
>
> Attribution is safe under either strategy, for the same reason the trunk-facing squash PR
> is safe (workflow.md → Two-Axis Delivery Model): attribution greps `[#N]` across commit
> **messages**, and `git merge --squash` concatenates the squashed commits' messages into
> the staged commit message. The squash commit's subject must still lead with `[#N]` for the
> subject-line lint gate. #1257 also carries the required audit of `epic-derived-commit-trail`
> and `epic-ac-commit-citation`, both of which currently assume a multi-commit-per-child epic.

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

### 2d. GitHub-native coordination authority

Worktree isolation protects files; it does not grant assignment, lifecycle, or
integration authority. On a directory-governed issue, the active GitHub
coordinator grant and accepted record chain are authoritative. A worker result,
chat handoff, local fleet row, or green branch remains a submission until the
current coordinator records its disposition.

Refresh the directory, grant epoch, assignment, contract epoch, and record-chain
head before accepting work or integrating a branch. A replaced worker may report
observed work but cannot exercise the old grant. A delegated nested-epic
coordinator may integrate only within its granted branch boundary.

See [GitHub-Native Coordination](github-native-coordination.md) for adoption,
append-first mutation, replacement, repair, and recovery procedures.

### 2e. The epic development pattern (#871)

The ratified end-to-end shape of a full-auto epic run. Everything below is shipped
except where explicitly marked pending.

1. **Cut the epic integration branch.** `node scripts/task-tracker/cut-epic-branch.mjs <epic#>`
   creates `feature/epic/<N>` from trunk head (or from the parent-epic head when the epic is
   nested).
2. **Orchestrate from a dedicated worktree** _(pending — #1258)_. The orchestrator runs in
   its **own** worktree checked out on `feature/epic/<N>`; the main worktree stays on trunk
   and is never moved by epic work. Two reasons this is the ratified shape rather than a
   preference: it keeps the shared main checkout free while a long epic runs, and it removes
   the `git update-ref refs/heads/trunk` desync hazard **by construction**, because no epic
   operation ever needs to touch the main worktree's ref. Until #1258 lands, the orchestrator
   still sits in the main worktree per §2.
3. **Cut each child from the epic head.** `cut-child-worktree.mjs <child#> <path>`, fresh per
   child (§2a), never from trunk (§2b).
4. **Children develop in parallel** and commit to their own `feature/child/<N>` branches.
5. **Each child rebases onto the epic head and integrates**, running its own tests first —
   `merge-back.mjs`. Today that integration is `git merge --ff-only`; the ratified squash is
   #1257 (§2b).
6. **Reap the merged child** with cleanup `--base feature/epic/<N>` (§2a, §2f).
7. **Verify the epic** once every child has merged back. Final verification runs **in the
   orchestration worktree against the epic branch** — not in the main worktree, and not
   against trunk, because trunk does not yet contain the epic's work.
8. **Push the epic branch and open one PR to trunk** (§2e, "Remote/PR granularity").
9. **After the PR merges**, run cleanup once more with the default `--base origin/trunk` to
   reap the epic branch and any straggler.

**Remote/PR granularity: one PR per epic, not one per child.** The epic's PR is the review
and CI unit; children integrate locally into the epic branch and never open their own PRs.
The trade-offs, recorded so the decision can be revisited on evidence rather than taste:

- **CI cost** — decisive. Per-child PRs run the full required-contexts matrix once per child;
  one epic PR runs it once for the whole epic. Children are not unverified under this model:
  `merge-back` runs the child's own tests before integrating, and step 7 verifies the
  assembled epic. The cost saved is redundant full-matrix runs, not verification.
- **Review surface** — favors one PR. A reviewer reads the epic's change as one coherent
  story instead of N partial diffs that only make sense assembled. This is also what makes
  the #1257 squash worth doing: one commit per child turns the epic PR into a readable
  per-child sequence.
- **Trunk cleanliness** — favors one PR. Trunk gains one merge per epic rather than N, and
  every `[#N]` child token still resolves, because the squash-to-trunk preserves commit
  message bodies (workflow.md → Two-Axis Delivery Model).
- **The cost, stated honestly** — a single PR is larger and lands later, so trunk-vs-epic
  divergence has more time to accumulate. That is precisely why drift mitigation below is
  not optional under this model.

**Epic-branch drift mitigation.** The epic branch is long-lived, so `origin/trunk` moves
underneath it. Two mechanisms, both shipped:

- **Opportunistic, on every integration.** `merge-back` syncs the epic before it rebases the
  child, so ordinary epic activity absorbs trunk drift continuously and no child is ever
  rebased onto a stale epic head.
- **Explicit, on demand.** `node scripts/task-tracker/sync-epic.mjs <epic#>` re-syncs the epic
  branch with trunk. Run it when trunk advances during a quiet stretch of the epic — a
  dependency bump, an unrelated hotfix — rather than discovering the drift at step 7.

Sync must never force-push `feature/epic/*`: #1240 adds ruleset non-fast-forward and
deletion protection over that namespace, so a force-push is both wrong and refused.

### 2f. Base-aware cleanup contract (#871)

Post-close cleanup is **base-aware**. It accepts `--base <ref>`, defaulting to
`origin/trunk`, and both of its decisions are evaluated against that one ref:

- **Prune predicate** — a child's worktree and branch are prunable when the child's `[#N]`
  commit is reachable from `--base`.
- **Rebase target** — surviving siblings rebase onto `--base`.

The defect this prevents is a routine that hardcodes `origin/trunk` for both. Mid-epic, a
merged child's commit is on `feature/epic/<N>` and nowhere near trunk, so a trunk-bound
predicate reaps nothing; worse, a trunk-bound rebase target drags in-flight siblings off the
epic head and back to trunk — the exact wrong-base failure `cut-child-worktree` and the
epic-base edit-guard exist to prevent.

Reachability is **message-based**, consistent with the repository's attribution contract
(workflow.md → Commit Attribution): the probe greps the `[#N]` token across commit messages
reachable from the base, never SHA identity, so it survives the rebase, squash, and amend
that the integration path performs.

Two sanctioned invocations, both described in §2a: `--base feature/epic/<N>` mid-epic, and
the default `--base origin/trunk` after the epic PR merges.

The pure planner is shipped — `resolveCleanupBase` and `planBaseAwareCleanup` in
[`scripts/task-tracker/lib/cleanup-base-aware.mjs`](../../scripts/task-tracker/lib/cleanup-base-aware.mjs),
covered by `scripts/tests/unit/task-tracker/lib/cleanup-base-aware.test.mjs`. It decides
what a run **would** do and touches nothing. The executing half — the verb, the real
reachability probe, `git worktree remove` / `git branch -d` / `git rebase`, and a dry-run
mode — is #1259. Two invariants that story must hold: never prune a child with uncommitted
work, and never prune a branch whose `[#N]` commit is not reachable from `--base`, because a
false prune destroys unmerged work.

### 2g. Interaction audit against existing mechanisms (#871)

The pattern in §2e was checked against the three mechanisms most likely to contradict it.
Findings, recorded so a future reader does not have to re-derive them:

- **`orchestrator-lock.mjs` / `agent-guard.mjs` — compatible, with one consequence worth
  knowing.** The lock file resolves against the **main** worktree
  (`findMainWorktreePath`), not the current one, so an orchestrator running from a dedicated
  worktree still contends for the same single per-repo lock — one orchestrator per repo,
  exactly as today. The consequence: `agent-guard` returns early when `cwd !== main`, so its
  two spawn protections (a live lock must exist, and every spawn must set
  `isolation: "worktree"`) apply **only** to spawns from the main worktree. Once #1258 moves
  the orchestrator out of main, those protections stop covering the orchestrator by default.
  #1258 must therefore acquire the lock explicitly and keep setting `isolation: "worktree"`
  on every spawn — the guard will no longer catch the omission.
- **`pull-next` wave admission — no conflict.** Admission is decided from board state and
  blocker markers; it never reads the git base, so cutting children from an epic head rather
  than trunk does not change which child is admitted. One cosmetic inaccuracy: `pull-next`'s
  success message tells the operator to "refresh JIT planning against current trunk", which
  is the wrong base for an epic child (§2b). Message-only — behavior is correct.
- **The 2026-07-07 PR-based migration — narrowed, not contradicted.** That migration made
  _feature branch → push → CI → PR → merge trunk_ the default for a story. Under an epic it
  still holds, but at the **epic** boundary: the epic branch is what gets pushed, CI'd, and
  PR'd to trunk. Children integrate locally into the epic branch and open no PRs of their
  own — see "Remote/PR granularity" in §2e for why, and note that children are still
  verified (`merge-back` runs the child's tests before integrating). A **solo, non-epic**
  story is unchanged: it PRs to trunk directly.

---

## 3. Per-agent prompt requirements

Each agent prompt is self-contained — the spawned session has no memory of the orchestrator's context. The full prompt-construction contract — orchestrator pack, worker boot pack, task pack, chatter policy, and final-report schema — lives in [`worker-context-contract.md`](worker-context-contract.md). That doc is the source of truth for what goes into a worker prompt and what comes back; this section is the per-prompt checklist.

Required elements:

- **Bound issue:** Every prompt names the GitHub issue the agent is bound to. The agent's first action is `/task #<N>` to bind the session.
- **Scope boundaries:** Explicit "you may edit X, Y, Z; you may NOT edit A, B, C." If the sister agent owns shared territory, name it.
- **STOP conditions:** When to stop and report (verb failure twice in a row, bash-guard refusal after one fix attempt, scope creep, unresolvable ambiguity).
- **Verb chain:** The exact verbs to run, in order, with `--answer yes` for any human gates that have been pre-disabled for the batch (see §4).
- **No retroactive timing:** Pause/resume via `/task` only — never fabricate gaps (§6).

The `activity-guard` hook enforces `.ai-task-manager/activity-policy.json` on every `Edit`, `Write`, and `NotebookEdit` call. Out-of-policy writes refuse at the tool boundary; do not try to route around it — fix the policy or the scope. Writes under `.scratch/**` are exempt from classification as disposable scratch, while `.tmp/**` remains exempt for machine-local runtime state and generated output. Both pass in every kanban state.

---

## 4. State-machine rules (8-state model)

The state chain is: `Backlog → Refine → Ready for Planning → Plan → Develop → Test → Review → Done`.

Forward transitions run through the verb surface — never through direct `move-state.mjs` calls (§5). Backward transitions are limited to two named paths:

| Backward path           | Verb                             | Trigger                                             |
| ----------------------- | -------------------------------- | --------------------------------------------------- |
| `Review → Develop`      | `/task reject #N --reason "..."` | Reviewer rejected; reason posted as comment.        |
| any-forward → `Develop` | `/task demote #N`                | Generic step-back (e.g. ran `approve` prematurely). |

### Gates

Two human gates exist between automation steps:

| Gate                                | Config key                  | What it blocks                                                                                                                             |
| ----------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Refine→R4P, Plan→Develop promotions | `gateAnalysisToDevelopment` | `/task promote` refuses unless the required issue-body evidence or approval marker exists when `true`. (config key retained for stability) |
| Review→Done close                   | `gateReviewToDone`          | `/task close` refuses without the review-approval marker (written by `/task approve`) when `true`.                                         |

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

| Verb                                                | Action                                                                                                                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/task promote [<N>]`                               | Forward by one state. Reads the current state, picks the legal next state, runs the appropriate gate. Applies to all forward transitions through `Refine → Ready for Planning → Plan → Develop → Test → Review → Done`. |
| `/task next [<N>]`                                  | Alias of `/task promote`. Use whichever reads better in the moment.                                                                                                                                                     |
| `/task demote [<N>]`                                | Back to `Develop` from any forward state. Records the demotion in the timing log.                                                                                                                                       |
| `/task reconcile <accept-live\|revert-to-recorded>` | Drift recovery only — see §7.                                                                                                                                                                                           |

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
