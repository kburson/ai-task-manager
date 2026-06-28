# Cutting Context Bloat With the Just-In-Time Skill Loader

## The problem: every `/task` invocation paid for capability it never used

Before this work, the `/task` skill loaded as one monolith. The moment you typed `/task` for the first time in a session, Claude pulled in `skill/shared/SKILL.md` — **937 lines, roughly 12,000 tokens** — regardless of whether you were binding an issue, approving a plan, dispatching parallel worktrees, or running the config interview. Plan-mode orchestration rules sat in context next to parallel-worktree rules, which sat next to the config interview, which sat next to the review gates. You paid for all of it on every cold start.

That is a problem for three reasons:

1. **Idle tax.** Even sessions that never invoke `/task` still see the project's `CLAUDE.md`, `MEMORY.md`, and global instructions. Adding an eagerly-loaded skill on top compounds the floor.
2. **Cold-start tax.** First-invocation cost was a flat ~12K tokens before any actual verb ran.
3. **Re-load tax.** After `/clear` or `/compact`, the whole monolith reloaded — even if the next verb only needed three paragraphs of it.

Epic #114 set explicit token budgets and asked: can we keep the full capability of the skill while only loading the part each verb actually needs?

## The solution: a three-tier just-in-time loader

The carve replaces "load everything up front" with "load what this verb is about to use, and remember it for the rest of the session."

### Tier 0 — Installed shim (`~/.claude/skills/task/SKILL.md`)

~19 lines. A pointer plus the load-once procedure. Tells Claude how to read marker versions, how to detect prior loads via inline sentinels, and where to find the adapter. This is the only thing the host CLI sees at install time.

### Tier 1 — Router stub (`skill/shared/router.md`)

The only file loaded on first `/task` invocation. Contains the hard cross-cutting rules every verb needs (timer-must-be-active, never call `move-state.mjs done` directly, pause-on-blocking-question, `--role` flag), the verb → rule-file routing table, and one sentinel line. Detailed contracts are pointers, not prose.

### Tier 2 — Per-verb rule files (`skill/shared/rules/*.md`)

Loaded just-in-time, each with its own sentinel:

| Rule file                    | Loads when                               |
| ---------------------------- | ---------------------------------------- |
| `rules/bind.md`              | `/task #N`, `/task resume #N`            |
| `rules/review.md`            | `/task review`                           |
| `rules/close.md`             | `/task close`                            |
| `rules/state-walk.md`        | `promote`, `demote`, `next`, `reconcile` |
| `rules/plan-mode-backlog.md` | `/task new` in plan-mode                 |
| `rules/config-init.md`       | `/task config init`                      |
| `rules/parallel.md`          | parallel fan-out / worktree dispatch     |
| `rules/commit-trail.md`      | first commit / troubleshooting           |
| `rules/hooks.md`             | hook-output diagnosis                    |

A session that only binds an issue and runs the verb chain loads `bind.md` + `state-walk.md` + `review.md` + `close.md`. It never pays for the 270 lines of plan-mode backlog orchestration. It never pays for the parallel-worktree rules. Those files exist; they simply do not enter the context window unless the verb that needs them is about to run.

### Invisible by design

Sentinels are inline single-line emissions (`aitm-skill-loaded:<id>:<version>`) that Claude can grep against its own context window. They cost a few tokens each and are the only portable load-detection signal across Claude Code and Codex. After `/clear` or `/compact`, sentinels vanish; the router reloads on the next verb; only the just-needed Tier-2 reloads. There is no banner prose and no ceremonial announcement — the sentinel reads as procedural.

## Results

| Budget tier                              |  Target |  Measured | Headroom |
| ---------------------------------------- | ------: | --------: | -------: |
| **Idle** (no `/task`)                    |  ≤1,500 |   **237** |      84% |
| **Invoked** (first `/task` in session)   |  ≤8,000 | **2,961** |      63% |
| **Active** (mid-session, multiple verbs) | ≤12,000 | **9,459** |      21% |

All three tiers came in well under budget. The invoked tier — the one that used to be 12K tokens of monolith — now sits under 3K. The active tier reflects a realistic session that has actually loaded several Tier-2 rule files; it still leaves room before pressuring the context window.

Measurements come from `scripts/task-tracker/measure-context.mjs`, which tokenizes the actual files an agent would read at each stage and reports against the budget. It runs in CI alongside the unit tests, so a future change that re-bloats the skill fails the build.

## Fresh-session load order — where bloat comes from for the average user

A user opens a fresh terminal and types their first message. Before any work happens, this stack is already in context:

### Phase 1 — Host-level (before any project)

1. **Claude Code's system prompt.** Tool definitions, output style, environment block. Fixed cost; the user does not control this.
2. **Global `~/.claude/CLAUDE.md`.** User's private cross-project instructions. For most users this is small (tens of lines). For power users it can creep — this is the first place to audit if your idle floor feels heavy.

### Phase 2 — Project-level (on entering the working directory)

3. **Project `CLAUDE.md`.** The team's coding conventions, workflow rules, formatting preferences. **This is the largest source of "always-on" project bloat for the average user.** Two patterns inflate it:
   - **Inline reference tables** (Recommended Skills, Key Files, full settings guides). These belong in `docs/onboarding.md` with a one-line pointer.
   - **"Just in case" rules** that apply to one verb but live in the global instructions. These should be in per-verb skill files, not the project root.
4. **`MEMORY.md`.** Auto-memory index — one line per memory file, pointing at on-disk entries. This file is loaded every turn, so the index must stay under ~200 lines. Individual memory files only load when their relevance triggers them. Bloat here is usually duplicate entries or memories that should have been deleted when the underlying fact changed.

At this point, with no skill yet invoked, a typical project sits around **600–1,500 tokens** in context. That is your idle floor.

### Phase 3 — First `/task` invocation

5. **Tier 0 shim** (`~/.claude/skills/task/SKILL.md`). ~19 lines. Tells Claude how to load the rest.
6. **Adapter `SKILL.md`** (Claude or Codex). ~54 lines. Adapter-specific conventions only — no verb contracts.
7. **Tier 1 router** (`skill/shared/router.md`). Cross-cutting rules + verb routing table. The router announces a single sentinel line.

That's the invoked floor: **~2,961 tokens**. Pre-JIT it was ~12,000.

### Phase 4 — Verb-specific (just-in-time)

8. **Tier 2 rule file for the verb that's about to run.** `/task #N` pulls `rules/bind.md`. `/task review` pulls `rules/review.md`. Each emits one sentinel and stays loaded for the rest of the session.
9. **Pickup directive** (`.ai-task-manager/templates/pickup-directive.md`). Loaded on sub-issue pickup. After #121, already-applied Deep-Dive Analysis appendices on the issue body collapse into a `<details>` block — GitHub renders them folded, and the pickup directive instructs Claude to skip collapsed blocks unless told to expand.

A full session that binds an issue, walks the state machine, reviews, and closes — touching four Tier-2 files — peaks at **~9,459 tokens**. The same session pre-JIT would have started at 12K and grown from there.

## Where bloat sneaks back in (and how the loader resists it)

| Source                                            | Symptom                                      | Mitigation                                                                                          |
| ------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Reference tables in `CLAUDE.md`                   | Idle floor creeps past 1,500                 | Move to `docs/onboarding.md`, leave a pointer                                                       |
| Stale `MEMORY.md` entries                         | Index past 200 lines                         | Memory hygiene; delete when fact is now in code                                                     |
| Eager skill expansion ("add it to the main file") | Invoked floor balloons                       | Add as a new `rules/*.md` and a routing-table row instead                                           |
| Deep-Dive appendices on closed issues             | Active context fills with re-read history    | `<details>` collapse + pickup directive skip rule                                                   |
| Multiple verbs loading same prose                 | Active context duplicates contracts          | Tier-1 router is the only file that references shared rules; Tier-2 files are single-responsibility |
| `npm update` that changes the skill               | Forced reload of router + already-used rules | Marker version bump; sentinels invalidate; reload only what's used                                  |

The architecture's central bet is that **most verbs touch a small, predictable slice of the skill**, and the slices are stable enough to factor cleanly. The measurement script holds that bet honest: if a future change blurs the slices, the budgets fail, and the regression is visible before it merges.

## What this unlocks

- **Longer sessions before `/compact`.** A session that starts 9K lighter on context has proportionally more room for actual work.
- **Cheaper cold starts.** First-invocation cost dropped ~75%. Sessions that only need one verb pay for one verb.
- **Symmetric across adapters.** Claude and Codex load the same Tier-2 rule files. Tool-specific differences live in the adapter file, not the contracts. No forks.
- **Headroom for future capability.** Adding a new verb is one Tier-2 file + one routing-table row. The router stays small. The idle and invoked floors do not move.

The skill is not smaller. The skill is **shaped**. Capability stayed flat; the cost of carrying it dropped to what you actually use.
