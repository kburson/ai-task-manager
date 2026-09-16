# Worktree Seed Assurance — Design

Date: 2026-07-17
Status: Approved (design); implementation plan pending

## Problem

A fresh `git worktree add` creates no `node_modules`. Nothing in the `/task` skill
verifies seeding before work begins, so an agent starts working in a worktree whose
tooling is partly absent and partly resolving to the wrong tree.

At the time of writing, two of six live worktrees (`task-859-60be5c`,
`bug-triage-resolution-d0001d`) had no `node_modules` at all; a third
(`test-automation-audit-445003`) had only the self-link and no dependencies.

### Failure inventory

Three distinct behaviors, only one of which is safe:

1. **Skill load fails loudly.** `node_modules/ai-task-manager/skill/adapters/claude/SKILL.md`
   is unreachable, so `/task` cannot load its canonical instructions. Loud, therefore safe.

2. **Lifecycle hooks die silently.** Every hook wired as a bare path — `hook-handler`,
   `memory-index`, `on-ask`, `commit-trail-handler`, `on-stop` — throws `MODULE_NOT_FOUND`,
   and the hook runner swallows it. `hooks/task-tracker.sh` is explicit: `handler not
found — skipping`, `exit 0`. Timing log, compact handling, pause/resume and commit-trail
   are all dead with no error surfaced.

3. **Silent wrong-code execution (the dangerous one).** Worktrees live _under_ the main
   repo at `.claude/worktrees/*`, so Node's upward `node_modules` walk finds the parent's.
   The parent's `node_modules/ai-task-manager` is a self-symlink to the **main repo**.
   Therefore from an unseeded worktree:

   - `npx aitm <verb>` runs **trunk's** code, not the worktree's.
   - `import 'ai-task-manager'` resolves to `@kburson/ai-task-manager` at **trunk**.

   An agent editing `scripts/task-tracker/*.mjs` in a worktree and running `npx aitm`
   exercises code it did not write, and nothing says so. Bare-path invocations
   (`node node_modules/…`) do not walk up, so they hard-fail; module specifiers _do_ walk
   up, so they silently resolve to the wrong tree. That inconsistency is the trap.

### Not a failure: the PreToolUse guards

The guards are **not** affected. #751/#792 resolve each guard through a candidate list:

```text
["node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs",
 "scripts/task-tracker/bash-guard.mjs"]   ← repo-relative fallback, present in every worktree
```

Verified by firing a live `gh issue edit --body` payload at the guard from an unseeded
worktree: it blocked correctly. Any claim that a missing `node_modules` disables the bash
guards is false, and the durable-memory note asserting so is stale for the guard case.

### Prior art

Issue #791 already diagnosed this exact scenario — its header names
`isolation: "worktree"` and the silent fail-open — and shipped `ensureSelfLink` plus
`npm run link:self`. The gap is that `prepare` fires only on `npm install`/`npm ci`, and
`git worktree add` runs neither. The fix exists; nothing invokes it.

Issue #792 introduced the `node -e` candidate-list shim **specifically** for "a node_modules-less
worktree of this repo" (`bin/cli.mjs:215-219`) and applied it to the four guards only. The
timing/lifecycle hooks kept the bare-path form. Item 3 below is not a new idea — it is
finishing #792 with #792's own mechanism.

## Decisions

| Question                         | Decision                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unseeded worktree behavior       | Detect and **self-heal**, then proceed. Seeding is deterministic and non-destructive; stop-and-ask buys nothing.                                          |
| Scope                            | **Both** dev and consumer, one check, severity differs. Dev additionally asserts the link targets _this_ worktree.                                        |
| Enforcement                      | **Script gate + directive.** A directive alone is behavioral discipline, and the packaged copy is unreachable in precisely the failure case it addresses. |
| Lifecycle-hook fallback (item 3) | **Rides along** — same root cause, same mechanism, same test surface.                                                                                     |

## Key finding: the heal is nearly free

Creating just the self-link — no `npm ci`, no 278 packages — fixes everything that matters:

```text
node_modules/ai-task-manager -> ..           (one symlink, instant)
→ skill/adapters/claude/SKILL.md             REACHABLE
→ realpath(node_modules/ai-task-manager)     = the WORKTREE, not trunk   ← wrong-tree hazard gone
→ require.resolve('eslint')                  = parent's node_modules     ← deps still free via upward walk
```

Nearest-`node_modules`-wins means the worktree's own link shadows the parent's, so module
specifiers resolve to the worktree's code. `npm ci` per worktree would buy nothing.

## Components

### `scripts/task-tracker/lib/worktree-seed.mjs`

Pure, no side effects, unit-testable.

```text
inspectSeed({ projectRoot }) → { status, detail }
```

| status           | meaning                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `seeded`         | link exists and realpaths to `projectRoot`                             |
| `missing-link`   | no `node_modules/ai-task-manager` (dev) → healable                     |
| `foreign-link`   | link resolves _outside_ `projectRoot` — the trunk-code trap → healable |
| `deps-missing`   | consumer: no aitm reachable at all → not healable, instruct `npm ci`   |
| `not-applicable` | not a dev checkout, install intact                                     |

Dev vs consumer branches on the existing `isDevPackage(projectRoot)` (`.git` presence).
Verified: `existsSync` matches a worktree's `.git` **file**, so `isDevPackage` returns true
in a worktree — no change needed there.

### `scripts/task-tracker/ensure-worktree-seeded.mjs`

Thin CLI over the lib. `--check` reports; default heals via the existing `ensureSelfLink`
and re-inspects to confirm. Reuses #791's helper rather than reimplementing symlink logic.

`ensureSelfLink` already covers `foreign-link`: it `realpathSync`s the existing link and on
mismatch `rmSync`s and recreates — a link pointing at trunk is just its "stale symlink"
path. `real-entry-present` (a genuine install) is left alone. Heal is therefore _call it and
re-inspect_; no new symlink logic.

### `.claude/settings.json` (and `patchSettingsJson` in `bin/cli.mjs`)

Two edits:

- SessionStart entry for `ensure-worktree-seeded.mjs`, via the `node -e` candidate shim.
- Bare-path hooks (`hook-handler`, `memory-index`, `on-ask`, `commit-trail-handler`,
  `on-stop`) converted to the same shim, `node_modules` first so consumers are unaffected.
  `patchSettingsJson` gets the strip-legacy-then-register treatment it already performs for
  the guards.

### `.claude/skills/task/SKILL.md`

Step 0 in the Load-Once Procedure, **above** the `node_modules` reads: run the seed check,
heal, then load. This is the reachable copy — the harness seeds `.claude/` into a worktree
even when `node_modules` is absent. The packaged copy documents the same contract.

## Error handling

The entire bug class is silence, but a SessionStart hook that hard-crashes takes the session
with it. Therefore: **loud, never fatal.**

- Heal failure (permissions, `real-entry-present`, consumer `deps-missing`) reports status
  plus the manual command to **stderr and** SessionStart `additionalContext`, so it lands in
  agent context rather than a log nobody reads.
- No retry loop.
- Already-seeded is one `lstat` + one `realpath`: silent, no output.

## Testing

- Unit — `inspectSeed` per status, fixtures under `./.tmp/inspect/` (system `/tmp` is
  lint-blocked): `seeded`, `missing-link`, `foreign-link` (link → parent repo, the trunk
  trap), `deps-missing`, `not-applicable`.
- Heal round-trip — `foreign-link` → heal → `realpath === worktree`.
- Integration — real `git worktree add` → run the hook → assert reachable skill and
  worktree-resolving link.
- Regression for item 3 — assert `patchSettingsJson` output contains **no** bare
  `node node_modules/…` hook command. The lint-shaped assertion that stops the class
  regrowing.

## Open questions the plan must resolve, not assume

### 1. What creates the self-link mid-session?

During investigation, `node_modules/` and the self-link were both born at **08:16:06**,
roughly eight minutes after session start, in a worktree that had neither at 08:08. Nothing
in `bin/` or `scripts/` calls `ensureSelfLink` except `ensure-self-link.mjs` itself, and an
explicit run of it reported _"already present."_ The most likely cause is npm firing the
`prepare` lifecycle during `npx --no-install aitm help` — **this is unconfirmed and must not
be assumed.**

It matters: a nondeterministic self-heal means "is this worktree seeded?" is not stable over
a session, and it plausibly explains the 4-of-6 split. The plan must reproduce it on a fresh
worktree before the fix is called done. If something else is racing to create that link, this
design must coexist with it rather than fight it.

### 2. How does a consumer ever get the unscoped `node_modules/ai-task-manager`?

The package publishes as `@kburson/ai-task-manager`, but every hook and guard command
resolves the **unscoped** path `node_modules/ai-task-manager/…`. npm never creates that
directory. `ensureSelfLink` is gated to dev checkouts by design ("so a consumer's installed
tree is never touched"), and `bin/cli.mjs` uses `PKG_NAME = 'ai-task-manager'` only
cosmetically (banner and `--version`) — it creates no alias.

So it is **unresolved** whether consumers rely on an install alias
(`npm i ai-task-manager@npm:@kburson/ai-task-manager`), a documented manual step, or whether
the consumer path is simply untested. This directly determines what `deps-missing` should
say, and whether the consumer branch is reachable at all. Resolve before implementing the
consumer branch; do not infer it from `PKG_NAME`.

## Out of scope (YAGNI)

Worktrees located **outside** the parent repo: no upward walk, so dependencies are genuinely
absent and `npm ci` really is required. Every current worktree lives under
`.claude/worktrees/`, so this stays out until a real case appears.
