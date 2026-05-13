# Parallel-Agent & Kanban-State Guardrails

## Context

The repo has accumulated three repeatable failure modes that text-only rules and existing superpowers skills haven't prevented:

1. **Spawn-class** — orchestrator used the `Agent` tool to spawn multiple sub-agents in the main workspace (no worktree). Concurrent edits corrupted code and GitHub issue state. Required full rollback.
2. **Process-skip class** — agent jumped from issue-pickup straight to "code-complete / requesting human review" without invoking `/task` at any state transition, then proposed **fabricating retroactive timestamps** to fill the gap. Data integrity violation.
3. **Sequence-skip class** — agent skipped Groom → Analyze, bypassing the gates added in PRs #49 (groom→analyze 4-part check) and #50 (analyze→development human approval). The 7-state kanban (`Backlog → Groom → Analyze → Development → Validate → Review → Done`, PR #56) defines the chain; nothing currently enforces it as a state machine.

4. **Activity-misalignment class** (the harder cousin of #3) — the agent doesn't _attempt_ a state change at all. The state stays at Groom; the agent silently begins editing source code, performing Development activity from the wrong state. State-machine validation never fires because no transition was requested. This is what the recent "straight to code-complete without `/task start`" failure actually was.

**Intended outcome:** make each failure mechanically impossible — not through stronger guidance, but through hooks and a single chokepoint that refuse the wrong action. Text rules complement enforcement; they don't replace it. Every overstep gets logged in a post-mortem so the rule set evolves with experience.

This plan delivers:

- Two new directional verbs `/task promote [<id>]` and `/task demote [<id>]` as the **only** sanctioned state-change paths for agents (rename per #81 — supersedes the earlier `/task move <state>` design).
- A state-machine validator (forward one step + two named backward paths).
- Drift detection: live project board vs. recorded `lastKnownState`, with explicit reconcile.
- A PreToolUse hook on the `Agent` tool that refuses spawns in the main worktree, no override.
- Hard refusal of retroactive timing entries.
- A rules doc and a post-mortem template.

---

## Design Summary

### Failure-class → guardrail map

| Class                  | Mechanism                                                                        | Enforcement                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Spawn                  | Agent tool in main worktree                                                      | PreToolUse hook on `Agent`: reject unless `cwd ≠ main_worktree_path`. No override.                                                      |
| Process-skip           | State changed without `/task` event                                              | Single chokepoint (`/task promote` / `/task demote`) + PreToolUse on direct `move-state.mjs` calls + PostToolUse auto-stamp safety net. |
| Sequence-skip          | Illegal transition (e.g., Backlog→Development)                                   | Transition matrix in `move-state.mjs`; rejects everything except next-forward, Validate→Development, Review→Development.                |
| Activity-misalignment  | Out-of-scope tool use for current state (e.g., `Edit src/foo.ts` while in Groom) | Activity-policy hook on `Edit`/`Write`/`NotebookEdit`/`Bash` — classifies operation, refuses if not permitted in cached current state.  |
| Data fabrication       | Backfilled timestamps                                                            | `gh-timing-comment.mjs` refuses any timestamp not equal to "now" (within ±60s). No flag, no override.                                   |
| Drift (manual UI move) | Live state ≠ recorded                                                            | Pre-flight live-state read on every `/task promote` / `/task demote`; mismatch → refuse, instruct `/task reconcile`.                    |

### State machine (sole source of truth)

```
backlog ──► groom ──► analyze ──► development ──► validate ──► review ──► done
                                       ▲              │            │
                                       └──────────────┘            │
                                       └─────────────────────────-─┘
```

Allowed transitions:

- **Forward, one step**: each adjacent pair above (left to right). Driven by `/task promote`.
- **Backward, named only**: `validate → development` (test failure rework), `review → development` (review rework). Driven by `/task demote`.

Anything else → refused with `reason: "illegal transition: <from> → <to>. Allowed: <next>."`.

### `/task promote [<id>]` and `/task demote [<id>]` semantics

Signature: `/task promote [<id>]` and `/task demote [<id>]`. `<id>` is optional and defaults to the currently-bound active issue (matches the pattern of `/task close [#N]`). `<id>` is **required** when no issue is active.

`/task promote` and `/task demote` are the only verbs that mutate kanban state for agents. Both share an identical pre-flight + post-write pipeline; only target resolution differs.

`/task promote [<id>]`:

1. Reads `lastKnownState` from the issue's timing-comment metadata block.
2. Reads **live** state via the existing GraphQL query in `move-state.mjs:171-187`.
3. If `live ≠ lastKnownState` → drift; refuse, print reconcile instructions, exit non-zero.
4. Resolves `target = forward neighbor of lastKnownState` from the state-machine matrix. If `lastKnownState === done` → refuse with "already in done."
5. Runs the gatekeeper for `target` (existing groom→analyze and analyze→development gates; new gates per state where missing).
6. Calls `move-state.mjs` internally with `AITM_INTERNAL=1` set.
7. Appends a `promote:<target>` entry to the `⏱ Timing Log` comment with the **current** wall-clock timestamp.
8. Updates the `<!-- aitm-last-known-state: <target> -->` metadata line in the timing comment.
9. When `target === done`: also performs every side effect of today's `/task close` (cascade close, fleet deregister, end-of-task counters). `/task close` becomes a deprecated thin alias.

`/task demote [<id>]`:

1. Same drift detection + lastKnownState read as `promote`.
2. Resolves `target = development` if `lastKnownState ∈ { validate, review }`. From any other state → refuse with "no development state to demote to from <state>."
3. Runs no extra gatekeeper (demoting to Development for rework is always permitted from validate/review).
4. Calls `move-state.mjs` with `AITM_INTERNAL=1`.
5. Appends a `demote:development` entry to the timing log.
6. Updates `lastKnownState` metadata.

`/task next [<id>]` is an alias of `/task promote` (sub-issue #79).

Existing per-state verbs (`/task analyze`, `/task approve`, `/task review`, `/task close`) become thin aliases that delegate to `/task promote`. They remain for backward compatibility but emit a deprecation note.

There is no user-facing `/task move <state>` verb. The state-machine validator and chokepoint logic remain as internal primitives invoked by both `promote` and `demote`.

### Activity-policy enforcement

The state machine catches _transition attempts_. It does not catch the failure where the agent silently performs out-of-scope work without changing state — agent in Groom edits `src/foo.ts`; no transition is requested; nothing fires.

Mechanism: PreToolUse hooks on `Edit`, `Write`, `NotebookEdit`, and `Bash` classify every operation into an **activity class**, look up the **cached current state** (from `.ai-task-manager/task-tracker-state.json`, written by every `/task promote` / `/task demote`), and refuse if the activity is not permitted in that state.

**Activity classes:**

| Class         | Detection                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `WRITE_CODE`  | Edit/Write/NotebookEdit on a code-glob path; Bash redirect/heredoc/`tee` to a code-glob path                                            |
| `COMMIT_CODE` | `git commit` (any form) when staged paths include code-glob matches                                                                     |
| `WRITE_DOCS`  | Edit/Write to `docs/**`, `.claude/plans/**`, `**/*.md` outside code paths                                                               |
| `WRITE_ISSUE` | `gh issue edit`, `gh issue comment`, `gh issue create`                                                                                  |
| `RUN_TESTS`   | Bash matching configured test-runner patterns (defaults: `npm test`, `npm run test*`, `node --test`, `pytest`, `cargo test`, `go test`) |
| `RUN_BUILD`   | Bash matching configured build patterns (defaults: `npm run build`, `tsc`, `cargo build`, `go build`)                                   |
| `READ_*`      | Reads (Read tool, `cat`, `gh issue view`, etc.) — **never blocked**, regardless of state                                                |

Path classification uses globs from `.ai-task-manager/activity-policy.json` (shipped defaults below; project may override).

**Default activity policy file** (`.ai-task-manager/activity-policy.json`):

```json
{
  "codeGlobs": ["src/**", "lib/**", "bin/**", "scripts/**"],
  "codeGlobExcludes": ["scripts/task-tracker/**", "scripts/gh/**"],
  "docGlobs": ["docs/**", ".claude/plans/**", "**/*.md", "CLAUDE.md"],
  "testRunners": ["npm test", "npm run test", "node --test", "pytest", "cargo test", "go test"],
  "buildCommands": ["npm run build", "tsc", "cargo build", "go build"]
}
```

**State → allowed activities:**

| State       | Allowed                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| Backlog     | WRITE*ISSUE, READ*\*                                                                                   |
| Groom       | WRITE*ISSUE, READ*\*                                                                                   |
| Analyze     | WRITE*ISSUE, WRITE_DOCS, RUN_TESTS, READ*\*                                                            |
| Development | all                                                                                                    |
| Validate    | RUN*TESTS, RUN_BUILD, WRITE_ISSUE, READ*\* (no WRITE_CODE — failed tests require `/task demote` first) |
| Review      | WRITE*ISSUE, WRITE_DOCS, READ*\* (review-failure rework requires `/task demote` first)                 |
| Done        | READ\_\* only (issue closed; reopen and promote-out required for further work)                         |

**No-active-task policy:** when no issue is bound (no `/task start` has run, no `/task plan` is active):

- `WRITE_CODE` and `COMMIT_CODE` → **refused**, with message: _"no active task. Run `/task start <issue#>` (or `/task plan` for untracked work) before editing code."_
- All other classes → allowed.

This is the missing trip-wire for the "agent skipped `/task start` and went straight to code" failure.

**Block message format:**

```
activity refused: <CLASS> on <target> is not permitted in state <STATE>.
  Active task: <#N | none>
  Allowed in <STATE>: <list>
  To proceed: <suggested action — e.g., "/task demote", "/task start <issue#>", or "/task plan">
```

**New hook:** `scripts/task-tracker/activity-guard.mjs`. Pattern follows `bash-guard.mjs`. Two settings entries (matching `Edit|Write|NotebookEdit` and extending the existing `Bash` matcher to also classify activities, not just paths).

**Bash classification** reuses `bash-guard.mjs`'s existing redirect/heredoc/`tee` extraction (lines 35-70 of that file). For commands matching test/build patterns, the activity-guard short-circuits the path check.

**False-positive remediation:** project edits `.ai-task-manager/activity-policy.json` to tighten or loosen globs. **No per-call override flag.** If a single edit is genuinely out of scope and the agent needs to do it, the answer is `/task demote` (back to Development) — not a bypass.

### Drift detection

Storage: a single HTML-comment line at the top of the `⏱ Timing Log` issue comment:

```
<!-- aitm-last-known-state: development -->
<!-- aitm-last-known-state-ts: 2026-05-10T14:32:11Z -->
```

Issue body is authoritative across worktrees (local state files don't sync).

On every `/task promote` / `/task demote`:

- Pre-flight: live GraphQL read.
- If `live === recorded` → proceed.
- If `live ≠ recorded` → refuse with:

  ```
  drift detected: board says "<live>", task-tracker says "<recorded>".
  Run `/task reconcile <accept-live|revert-to-recorded>`.
  ```

New verb `/task reconcile <accept-live|revert-to-recorded>`:

- `accept-live`: writes a `drift-reconcile` timing entry recording the gap (no fake duration), sets `lastKnownState = live`.
- `revert-to-recorded`: calls `move-state.mjs` to push board back to `recorded`.

### How an agent knows which workspace it's in

The agent cannot infer worktree membership from prompt context alone. Three layered surfaces make it explicit:

1. **SessionStart banner.** `hooks/task-tracker.sh` already runs on SessionStart. Extend `hook-handler.mjs` to emit a single-line status as part of its existing output:
   - In a worktree: `WORKTREE: ✓ <branch> @ <cwd>` — Agent spawns permitted.
   - In main: `WORKSPACE: MAIN — Agent tool spawns will be BLOCKED. Create a worktree first.`
     Detection uses `findMainWorktreePath(cwd)` from `fleet-registry.mjs:6-14`; if `cwd === main`, banner says MAIN.

2. **`/task status` first line.** Whenever the agent runs `/task` (status), the first line of output reports `worktree: <main | <branch>@<path>>`. Same detection function. Gives the agent a way to check explicitly before deciding to spawn.

3. **Block message itself.** If the agent ignores the banner and calls `Agent` anyway, the PreToolUse refusal text names the cwd and the main path so the agent can see exactly why:
   `"Agent tool spawns are forbidden in the main worktree (cwd=<X>, main=<Y>). Create a worktree first (see superpowers:using-git-worktrees). No override exists."`

### Agent-tool PreToolUse hook

New script: `scripts/task-tracker/agent-guard.mjs`. Pattern mirrors existing `bash-guard.mjs`.

Logic:

1. Read tool input JSON from stdin.
2. Resolve `cwd` (use `process.env.PWD` or fall back to `process.cwd()`).
3. Call `findMainWorktreePath(cwd)` from `scripts/task-tracker/fleet-registry.mjs` (existing utility).
4. If `cwd === main_worktree_path`:

   ```json
   {
     "decision": "block",
     "reason": "Agent tool spawns are forbidden in the main worktree. Create a worktree first (see superpowers:using-git-worktrees). No override exists."
   }
   ```

5. Else: pass.

Settings entry: PreToolUse matcher `Agent` → `node scripts/task-tracker/agent-guard.mjs`.

### Hard refusal of retroactive timestamps

In `gh-timing-comment.mjs::buildRow`:

- Reject any `ts` argument whose absolute delta from `Date.now()` exceeds 60 seconds.
- Throw `Error("retroactive timing entries are forbidden; recorded gaps must be reconciled, not fabricated")`.
- No flag, no env-var bypass.

Existing legitimate retro-style entries (`session-end-recovery`, `pre-compact-flush`) all use `Date.now()` at the moment of write — they're "now" entries describing past events, not backdated timestamps. Audit during implementation to confirm none pass an explicit past `ts`.

### Direct `move-state.mjs` block

`move-state.mjs` checks `process.env.AITM_INTERNAL`. If unset and stdin is a TTY-less agent context, refuse with:

```
move-state.mjs is internal. Agents must use `/task promote` or `/task demote`.
```

`/task promote` and `/task demote` set `AITM_INTERNAL=1` before invoking. Humans calling from a terminal still work (TTY check). PreToolUse on `Bash` is extended (in `bash-guard.mjs`) to refuse command lines matching `move-state\.(mjs|sh)` so agents can't bypass via shell.

### Post-mortem template

New file: `docs/guides/postmortem-template.md`. Sections:

- **Date / Incident ID**
- **What happened** — exact action taken
- **Why it was wrong** — rule violated
- **Root cause** — was the rule missing, unclear, or unenforced?
- **Resolution** — what was rolled back / fixed
- **Guardrail change** — code/hook/rule update committed in response (link)

New directory: `docs/postmortems/`. One file per incident: `YYYY-MM-DD-<slug>.md`.

Process: any time a hook blocks an action, or a human catches an overstep that a hook missed, a postmortem is written and any new rule is added to `docs/guides/parallel-agents.md` and (if mechanically detectable) a hook is added/extended.

### Rules doc

New file: `docs/guides/parallel-agents.md`. Sections:

1. **When to spawn parallel agents** — only with explicit user approval; orchestrator must name candidate tasks, estimate parallelism, list shared files.
2. **Worktree requirement** — every Agent spawn is in its own worktree, enforced by hook.
3. **Per-agent prompt requirements** — self-contained, explicit STOP conditions, scope boundaries, must reference the bound issue.
4. **State-machine rules** — the 7-state chain, allowed transitions, gate references.
5. **`/task promote` / `/task demote` are mandatory** — direct `move-state.mjs` calls forbidden.
6. **No retroactive timing** — gaps are recorded as gaps.
7. **Drift handling** — `/task reconcile` only.
8. **Post-mortem procedure** — link to template.

CLAUDE.md gets a one-paragraph pointer to this doc, replacing the existing 3-bullet Sub-Agents section.

---

## Critical Files

### New

- `scripts/task-tracker/agent-guard.mjs` — PreToolUse hook for `Agent` tool.
- `scripts/task-tracker/activity-guard.mjs` — PreToolUse hook for `Edit`/`Write`/`NotebookEdit`/`Bash`; classifies activity and refuses if not permitted in current state.
- `scripts/task-tracker/activity-policy.mjs` — shared classifier (path globs + command patterns + state matrix); imported by activity-guard and tests.
- `.ai-task-manager/activity-policy.json` — shipped defaults, copied to target projects on install; project-editable.
- `scripts/task-tracker/state-machine.mjs` — transition matrix + validator (single source of truth, imported by `move-state.mjs`, `verbs/promote.mjs`, and `verbs/demote.mjs`).
- `scripts/task-tracker/verbs/promote.mjs` — `/task promote [<id>]` implementation; advances by one forward state.
- `scripts/task-tracker/verbs/demote.mjs` — `/task demote [<id>]` implementation; backward to development from validate/review.
- `scripts/task-tracker/verbs/reconcile.mjs` — `/task reconcile` implementation.
- `docs/guides/parallel-agents.md` — rules doc.
- `docs/guides/postmortem-template.md` — incident template.
- `docs/postmortems/.gitkeep` — directory placeholder.
- `tests/state-machine.test.mjs` — transition matrix coverage.
- `tests/agent-guard.test.mjs` — hook block / pass cases.
- `tests/activity-guard.test.mjs` — per-state matrix, code-glob classification, no-active-task refusal of WRITE_CODE.
- `tests/promote-verb.test.mjs` — gate firing, drift detection, retroactive-ts refusal, done-terminal refusal.
- `tests/demote-verb.test.mjs` — drift detection, refusal from non-validate/non-review states, success from validate and review.

### Modified

- `scripts/gh/move-state.mjs` — gate behind `AITM_INTERNAL=1`; import and apply state-machine validator (currently accepts any→any per `move-state.mjs:21-29`).
- `scripts/task-tracker/task-tracker.mjs` — register `promote`, `demote`, `next` (alias of promote), and `reconcile` verbs; convert `analyze`/`approve`/`review`/`close` into aliases that delegate to `promote`.
- `scripts/task-tracker/gh-timing-comment.mjs` — refuse retroactive `ts`; add `lastKnownState` metadata read/write helpers.
- `scripts/task-tracker/hook-handler.mjs` — emit worktree/main banner on SessionStart.
- `scripts/task-tracker/task-tracker.mjs` (status verb) — first line reports `worktree: <main | <branch>@<path>>`.
- `scripts/task-tracker/bash-guard.mjs` — extend to block direct `move-state.{mjs,sh}` invocations from agents.
- `bin/cli.mjs` — install `agent-guard.mjs` and add PreToolUse `Agent` matcher to `.claude/settings.json`.
- `.claude/settings.json` — add PreToolUse `Agent` hook entry (this repo's own dogfood install).
- `skill/shared/SKILL.md` — document `/task promote`, `/task demote`, `/task next`, and `/task reconcile`; mark `analyze`/`approve`/`review`/`close` as aliases.
- `CLAUDE.md` — replace Sub-Agents section with pointer to `docs/guides/parallel-agents.md`.

### Reused (do not modify)

- `scripts/task-tracker/fleet-registry.mjs::findMainWorktreePath` (lines 6-14) — worktree detection.
- `scripts/task-tracker/hook-handler.mjs` — pattern for hook scripts; `agent-guard.mjs` follows the same stdin-JSON convention as `bash-guard.mjs`.
- Existing GraphQL query in `move-state.mjs:171-187` — drift-detection live read uses the same shape.
- Existing gates in `verbs/analyze.mjs` and `verbs/approve.mjs` — invoked from `promote.mjs` keyed on target state.

---

## Verification

End-to-end checks before declaring done:

1. **State-machine matrix**
   - `node --test tests/state-machine.test.mjs` — every legal transition passes; every illegal one rejects with the matrix's error message; both backward paths (`validate→development`, `review→development`) accepted; no other backward transitions accepted.

2. **Agent-guard hook**
   - In the main worktree, attempt to spawn an `Agent` (any subagent_type). Expect block with the worktree-required reason naming both cwd and main path.
   - In a worktree (`git worktree add ../aitm-test-wt`), spawn the same `Agent`. Expect pass.
   - `node --test tests/agent-guard.test.mjs` covers both cases via mocked stdin.

2c. **Activity-policy enforcement**

- With active task in state Groom: attempt `Edit src/foo.ts`. Expect refusal naming state, class (`WRITE_CODE`), and remediation (`/task promote` to advance through analyze→development).
- With active task in state Groom: attempt `Edit docs/notes.md`. Expect pass (WRITE_DOCS allowed).
- With active task in state Development: attempt `Edit src/foo.ts`. Expect pass.
- With active task in state Validate: attempt `Edit src/foo.ts`. Expect refusal pointing to `/task demote`.
- With NO active task: attempt `Edit src/foo.ts`. Expect refusal: "no active task — run `/task start <issue#>` or `/task plan`".
- With NO active task: attempt `Edit docs/notes.md`. Expect pass.
- In `/task plan` mode: attempt `Edit src/foo.ts`. Expect refusal (plan mode is untracked planning, not code).
- Bash heredoc test: in Groom, run `cat > src/foo.ts <<EOF ... EOF`. Expect refusal (bash-guard's existing redirect extraction reused).
- Bash test in Validate: run `npm test`. Expect pass (RUN_TESTS allowed).
- Bash test in Groom: run `npm run build`. Expect refusal (RUN_BUILD not allowed in Groom).
- `git commit` test in Groom with staged code paths: refused. With only doc paths staged: passes.

2b. **Worktree visibility surfaces**

- Open a session in main worktree. SessionStart banner shows `WORKSPACE: MAIN — Agent tool spawns will be BLOCKED.`
- Open a session in a linked worktree. Banner shows `WORKTREE: ✓ <branch> @ <cwd>`.
- Run `/task` (status) in each. First line reports `worktree: main` vs `worktree: <branch>@<path>`.

3. **`/task promote` happy path**
   - Create a test issue. Verify it starts in `backlog`.
   - Run `/task promote`. Confirm: target resolves to `groom`; timing entry written with current ts; `lastKnownState` metadata updated; board moved; exit 0.
   - Run `/task promote` again. Confirm groom→analyze gate (PR #49's 4-part check) fires; passes when checklist ticked, refuses when not.
   - Continue running `/task promote` through the chain and confirm the final `promote` (review→done) performs every side effect today's `/task close` does (cascade close children, fleet deregister, final timing flush).
   - Run `/task next` as alias — same target resolution and same gate behavior.

4. **`/task promote` illegal-transition / terminal cases**
   - Issue in `done`. Run `/task promote`. Expect refusal: `already in done — no forward state.`
   - Drift case: issue in `groom` (recorded), board manually moved to `analyze`. Run `/task promote`. Expect drift refusal (covered in test 5).

5. **`/task demote` happy path + refusals**
   - Issue in `validate`. Run `/task demote`. Expect pass; target=development; timing entry `demote:development`.
   - Issue in `review`. Run `/task demote`. Expect pass; target=development.
   - Issue in `groom`. Run `/task demote`. Expect refusal: `no development state to demote to from groom.`
   - Issue in `development`. Run `/task demote`. Expect refusal.
   - Issue in `done`. Run `/task demote`. Expect refusal.

6. **Drift detection**
   - Issue in `groom` (recorded). Manually move via GitHub UI to `analyze`.
   - Run `/task promote`. Expect refusal with drift message naming both states.
   - Run `/task reconcile accept-live`. Confirm: timing entry `drift-reconcile` written, `lastKnownState=analyze`, no fabricated duration.
   - Run `/task promote`. Expect pass (gate permitting).

7. **Retroactive timestamp refusal**
   - Unit test invokes `buildRow` with a `ts` 5 minutes in the past. Expect throw.
   - Unit test invokes with `ts = Date.now()`. Expect success.

8. **Direct `move-state.mjs` block**
   - From an agent context (no `AITM_INTERNAL`), call `node scripts/gh/move-state.mjs <issue> done`. Expect refusal pointing to `/task promote` / `/task demote`.
   - From a human terminal (TTY), same call. Expect pass.
   - Bash-guard test: command line matching `move-state.mjs|move-state.sh` from agent → block.

9. **Install dogfood**
   - `npm pack`, install into `/Users/kpburson/projects/Vibe-Coding/aitm-test`. Confirm `.claude/settings.json` in target now has the `Agent` PreToolUse entry. Confirm `agent-guard.mjs` is present in the installed `node_modules/ai-task-manager/scripts/task-tracker/`.

10. **Existing test suite**
    - `npm test` — all currently-passing tests still pass. The two known pre-existing failures (init-project-config jq schema) remain isolated.

11. **Docs review**
    - `docs/guides/parallel-agents.md` is concise (under 400 lines) and covers all eight sections from the design.
    - `docs/guides/postmortem-template.md` exists with the six fields.
    - `CLAUDE.md` Sub-Agents section replaced with a pointer.
    - No occurrences of `/task move <state>` (the superseded verb) remain in `docs/`, `skill/`, or any sub-issue body of #61.
