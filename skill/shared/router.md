---
name: task
description: Bind work sessions to GitHub issues and track time + context words per issue. Use when the user types /task with no args or followed by #N, new, plan, resume, pause, update, review, close, log, check, fleet, or config.
---

<!-- aitm-skill-version: 1.2.0 -->

# Task Router

Tier-1 rules and routing.

On first read, emit `aitm-skill-loaded:router:1.1.0` once. Tier-2 rule files announce their own sentinels on JIT load.

**Full design:** `node_modules/ai-task-manager/docs/DESIGN.md`

## Hard cross-cutting rules

These rules apply to every verb. Skipping any is a process failure.

1. **Timer must be active before any work.** Never touch source files, run tests, edit issue bodies, or take any action against an issue without an active timer. Re-run `/task #N` to re-register if needed. "The work is small" is not a valid reason.
2. **Never call `move-state.mjs <N> done` directly.** Only `/task close` does that, internally. Direct calls skip the timing flush and corrupt the velocity ledger.
3. **Never call `gh issue create` directly.** Use `scripts/gh/create-issue.mjs --shape <stub|epic|sub-issue|solo|defect>` — the only sanctioned path. Direct calls skip project tether, `aitm-fields` injection, placeholder substitution, and assignee/priority gates.
4. **Never call `gh issue close` directly.** Use `/task close`.
5. **Never call `move-state.mjs <N> <state>` to skip stages.** Always `/task promote` (or `next`) one step at a time; `/task demote` to step back.
6. **Pause on blocking question.** Before any blocking user prompt: `/task pause "pause for question"`. After answer: `/task start "question answered"`. The clock reflects focused work only.
7. **Dirty-workspace gate exists.** Review verb warns; close verb blocks. See `rules/review.md` and `rules/close.md` for details.
8. **`--role` flag at bind.** Solo issue picked up directly: omit (defaults to `solo`). Starting an epic to fan out to agents: `--role orchestrator`. Agent picking up a sub-issue via Pickup Directive: `--role agent` (set in pickup-directive.md).
9. **Pickup-directive contracts.** Deep-dive-before-code, per-AC verification (no bulk-checking), and `/task review` as the agent terminal step are defined in `.ai-task-manager/templates/pickup-directive.md` Hard Rules. Honor them on every pickup.
10. **Honor project preferences.** Read `.ai-task-manager/task-tracker.json#preferences` at session start (`getPreferences()` from `scripts/task-tracker/config.mjs`). Keys: `noPushToOrigin`, `mainThreadOnly`, `driveSubIssuesToReview`, `pauseTimerOnBlockingQuestion`, `noConfirmAfterDeepDive`, `askGatesBeforeParallel`, `formatting.noEmojis`, `formatting.currencyInBackticks`, `scratchDir`. See `rules/preferences.md`.
11. **Post-Compact/Clear: follow the boot index before any verb.** If the session was just compacted, cleared, or freshly started — or no `aitm-boot-recovered:*` sentinel is in live context — read [`.ai-task-manager/templates/session-boot.md`](../../.ai-task-manager/templates/session-boot.md) and reload every Tier-1 file it names BEFORE running any verb. Discard prior `aitm-skill-loaded:*` sentinels; treat compacted summaries as hints, not source-of-truth. Emit a one-shot `aitm-boot-recovered:<session-id>:<timestamp>` sentinel after reload.
12. **Track before you start — no untracked work.** Every unit of work must be tracked by a GitHub issue before it begins. When you discover follow-up, out-of-scope, or newly-surfaced work worth doing, do not silently begin it and do not stage it as an untracked local or background "suggested task." Instead, offer to create a tracking issue (`/task new` → `scripts/gh/create-issue.mjs --shape <stub|epic|sub-issue|solo|defect>`) and bind to it first. The issue is what gives the work tracking, estimation, and a board state; an untracked task chip only starts work in the dark. No issue, no work.

## CLI invocation

```bash
npx aitm <verb> [args...]
```

Print stdout verbatim. On non-zero exit, print stderr and surface the error. Exit code 3 from `/task review` or `/task close` means unchecked items (`rules/review.md` / `rules/close.md`).

The post-bind metadata fetch (`gh issue view`), reopen-if-closed, and Pickup-Directive follow-up for `/task #N` / `/task resume #N` live in `rules/bind.md`.

## Verb → rule-file routing

Load the rule file ONLY when its verb is about to run. If the sentinel `aitm-skill-loaded:rules/<name>:<version>` is already in context, skip the read.

<!-- prettier-ignore -->
| Verb / situation                                                         | Rule file                                                                 |
| --- | --- |
| `/task #N`, `/task resume #N`                                            | `rules/bind.md` (+ load `.ai-task-manager/templates/pickup-directive.md`) |
| `/task review #N`                                                        | `rules/review.md`                                                         |
| `/task deliver #N` | `rules/deliver.md` |
| `/task incident-ledger #1381`                                           | `rules/incident-ledger.md`                                                |
| evidence / reopen                                                       | `rules/evidence.md`                                                       |
| `/task close #N`, `/task close --force`                                  | `rules/close.md`                                                          |
| `/task promote`, `/task demote`, `/task next`, `/task reconcile`         | `rules/state-walk.md`                                                     |
| `/task new` (issue creation, any state)                                  | `rules/create-issue.md`                                                   |
| `/task new` while `active=="plan"`                                       | `rules/plan-mode-backlog.md`                                              |
| `/task config init`                                                      | `rules/config-init.md`                                                    |
| Parallel fan-out (≥2 candidate children, any worktree dispatch)          | `rules/parallel.md`                                                       |
| Session start (preferences detail beyond key names)                      | `rules/preferences.md`                                                    |
| First commit in session, commit-trail troubleshooting                    | `rules/commit-trail.md`                                                   |
| Hook-output diagnosis (rare)                                             | `rules/hooks.md`                                                          |
| `/task plan-approve`, `/task approve`, `/task reject`                    | `rules/state-walk.md` (gate verbs; covered there)                         |
| Scratch writes; `/task issue-body` or `comment`                          | `rules/scratch-dirs.md`; `rules/issue-records.md`                         |
| `/task block`, `/task unblock`, spawning a defect mid-task               | `rules/block.md`                                                          |
| Skill script blocks you (hook `block`, or `aitm-defect-hint:` on stderr) | `rules/report-on-block.md`                                                |

Verbs not listed (`/task`, `/task discover`, `/task plan`, `/task resume`, `/task pause`, `/task update`, `/task log`, `/task migrate`, `/task check`, `/task fleet`, `/task occupancy`, `/task config`) need no Tier-2 file — invoke the CLI and print output.

> `/task plan #N` is the Ready for Planning → Plan JIT-planning entry verb — refuses on any other current state. `/task discover` is the separate backlog-item-generation / pre-issue ideation bucket. The two are not interchangeable; the historical `plan → discover` deprecation alias was removed in #299.

## gh issue command policy (bash-guard)

The PreToolUse Bash hook (`scripts/task-tracker/bash-guard.mjs` → `lib/gh-edit-guard.mjs`) is the authoritative gh-issue policy. Summary: `gh issue view`/`list`, label & state-meta `gh issue edit` flags, `gh issue comment` (prefer structured helpers), and `gh issue reopen` are allowed; `gh issue create` and `gh issue close` are **BLOCKED** (hard rules 3–4 — use `scripts/gh/create-issue.mjs --shape …` / `/task close`); `gh issue edit --body` / `--body-file` is refused — route every body write through `mutateIssueBody` so hidden markers survive (`rules/create-issue.md`, `rules/state-walk.md`). `gh api graphql` mutations are allowed but exceptional (prefer helpers; document the site).
