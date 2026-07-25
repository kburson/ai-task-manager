# Delivering "lessons learned" to downstream ai-task-manager users

Status: recommendation + spec (build deferred to a tracked follow-up per #518 AC-5).

## Problem

Building this package produced ~47 durable operational lessons (`docs/ai-memory/`,
plus `archive/` for retired ones). A downstream user who installs the package should be
able to inherit that hard-won knowledge instead of rediscovering it through their own
mistakes. What is the best mechanism to get these lessons into their workspace and in
front of their Claude sessions?

## Options considered

### (a) Single consolidated markdown, auto-loaded every session + post-compact

One big file, emitted into context on every SessionStart and PreCompact/PostCompact.

- **Pro:** zero user action; knowledge is always present.
- **Con:** burns context budget on every fact every session, even the 90% irrelevant to
  the current task. Grows unbounded as lessons accumulate. No opt-out per lesson. The
  monolith is also harder to keep curated — one file, many concerns.

### (b) Install-time menu of individual files

At `ai-task-manager install`, present the corpus as a menu; the user opts into the files
they want, copied into their workspace.

- **Pro:** per-file granularity, deliberate acceptance, small on-disk footprint.
- **Con:** nothing _surfaces_ the knowledge afterward. Files sit on disk unread; Claude
  never sees them unless the user manually points at them. Solves distribution, not recall.

## Recommendation: hybrid (seed files + always-loaded index)

Adopt the exact pattern this repo's own auto-memory uses — the very system that produced
these lessons: **a lightweight `MEMORY.md` index always in context, plus per-fact files
recalled on demand.** Port it downstream:

1. **Seed the individual files at install (option-b granularity).**
   Ship `docs/ai-memory/` in `package.json#files` (it is currently excluded, so the seed
   does not even reach npm today — fixing that is step one). Add a memory group to the
   install copy so the curated durable set lands in the user's workspace under
   `.ai-task-manager/memory/`. Present it as an **opt-in menu** so acceptance is deliberate.

2. **Always-load only the index (option-a persistence, minus the cost).**
   A SessionStart / PostCompact hook emits `MEMORY.md` — one line per lesson — via
   `hookSpecificOutput.additionalContext`. The index is cheap and bounded; the individual
   fact files are read on demand when a one-line hook matches the task at hand.

Option (a) alone pays full context cost forever; option (b) alone never surfaces anything.
The hybrid keeps the always-on cost to a bounded index while preserving both deliberate
acceptance and on-demand recall. It is also a _proven_ pattern — it is how this project's
maintainer memory already works.

## Concrete spec

### Ship the seed

- Add `"docs/ai-memory"` to `package.json#files`.
- New manifest group in `bin/lib/template-manifest.mjs` (e.g. `MEMORY_SEED_FILES`), sourced
  from `docs/ai-memory/*.md` (excluding `archive/`, and honoring the `EXCLUDE_PATTERNS` in
  `scripts/inspect/ai-memory-parity.mjs`).

### Install-time opt-in menu

- During `ai-task-manager install`, prompt: "Install the bundled operational-lessons memory
  seed? [all / choose / none]". `choose` lists each `MEMORY.md` bullet as a togglable item.
- Selected files copy into the downstream (gitignored) `.ai-task-manager/memory/`, alongside a
  copy of `MEMORY.md` filtered to the accepted set.

### Always-loaded index hook

- Reuse the proven `additionalContext` channel (see `codex-prompt-timestamp.mjs` for the shape).
- A `SessionStart` + `PostCompact` hook reads `.ai-task-manager/memory/MEMORY.md` and emits it as
  `hookSpecificOutput.additionalContext`, prefixed with a one-line "recall on demand via grep over
  `.ai-task-manager/memory/`" instruction. Only the index is emitted — never the full corpus.

### Parity / freshness

- `scripts/inspect/ai-memory-parity.mjs` (this issue) keeps the shipped seed honest against the
  maintainer's live memory: `--mode files` / `--mode index` / `--mode diff` / `--mode rebase`.
  Run `--mode diff` before publishing to confirm the seed is current.

## Freshness workflow (maintainer)

The shipped seed under `docs/ai-memory/` is a _snapshot_ of the maintainer's live
`~/.claude/.../memory/` corpus. It does not update itself — keeping it honest is a
deliberate pre-publish step. Before every `npm publish` (and, per
`feedback_rebase_origin_parent_before_pr`, before opening a release PR):

1. **Confirm parity.** Run the diff report against the live corpus:

   ```
   node scripts/inspect/ai-memory-parity.mjs --mode diff
   ```

   It prints net-new durable facts missing from the seed, content drift (seed ≠ live),
   stale seed files with no live source, and the ephemeral files intentionally excluded
   (`EXCLUDE_PATTERNS`). A clean run ends with `=> AT PARITY`; anything else means the
   seed is behind the maintainer's live memory.

2. **Catch the seed up to live when it drifts.** If `--mode diff` reports drift, sync the
   seed **by hand** — copy each net-new / content-drifted durable file that `--mode diff`
   names from live (`~/.claude/.../memory/`) into `docs/ai-memory/`, then add or refresh its
   one-line bullet in the seed `MEMORY.md` index, skipping the ephemeral trackers
   (`EXCLUDE_PATTERNS`). Re-run `--mode diff` to confirm `=> AT PARITY`, then commit the
   refreshed seed. Commit `f775fd9` (issue #780) is a worked example of this manual
   live→seed catch-up.

   There is **no** command that performs this copy for you. In particular, `--mode rebase`
   does **not** sync the seed: it is a git branch-linearity check that asserts the
   `ai-memory` branch is not behind `trunk`
   (`git rev-list --left-right --count trunk...ai-memory`) and copies zero files. Do not run
   it expecting a live→seed sync.

3. **Do not publish a drifted seed.** Shipping a stale seed silently hands downstream
   users last-quarter's lessons. The `--mode diff` gate is advisory-for-humans; the CI
   Fast lane's `--mode index` check (below) is the automated backstop — but `index` only
   proves the shipped index ⇄ shipped durable-set are internally consistent, **not** that
   the shipped seed matches live. Live-vs-seed freshness is a maintainer responsibility
   that only `--mode diff` surfaces.

### CI backstop (index parity)

The Fast lane runs `node scripts/inspect/ai-memory-parity.mjs --mode index`, which is
repo-only / CI-safe (it needs no maintainer `$HOME` memory dir). It fails the build on any
`MEMORY.md`-index ⇄ `docs/ai-memory/` durable-set drift — a bullet pointing at a missing
file, or a durable seed file absent from the index. This catches a hand-edited seed that
forgot to update the index; it deliberately does **not** reach into live memory.

## Post-upgrade resync (`memory-resync`, #978)

Install-time acceptance (above) is a one-shot decision: the seed a project accepted at
`ai-task-manager install` time never updates itself as the upstream package publishes new
or revised lessons. `npx ai-task-manager memory-resync` is the supported way to bring an
already-installed `.ai-task-manager/memory/` back in sync with the upgraded package's seed
without silently clobbering a user's own edits.

- Classifies every durable seed file into `new` (upstream-only), `changed` (upstream
  updated it, local copy untouched since last accept), `unchanged`, `locally-modified`
  (the local copy diverges from what was last accepted, so upstream's diff is never
  auto-applied), or `deprecated` (local-only, no longer shipped upstream).
- The distinction between `changed` and `locally-modified` is made against a per-file
  content-hash baseline (`.ai-task-manager/memory/.seed-state.json`) recorded whenever a
  file is accepted — install-time or resync-time — so a user's own edit is never mistaken
  for a safe upstream update. A file with no recorded baseline (pre-#978 installs)
  conservatively classifies as `locally-modified` rather than assuming it is safe to
  overwrite.
- Interactive mode (real TTY, no flags) opens an `npm-check`-style scrollable list grouped
  by status; space toggles accept/skip (or keep/remove for deprecated files), enter
  applies the confirmed decisions atomically, escape cancels with no changes made.
- `--dry-run` / `--list`, or any non-TTY invocation, print the classification only —
  zero filesystem changes — for scripting and CI use.

## Build status

Per #518 AC-5, the mechanism _build_ (package.json#files change, manifest group, install-menu
prompt, index hook) was filed as the tracked follow-up **#728** rather than built inside this
investigation. #728 delivered that mechanism: the seed ships in `package.json#files`, a
`MEMORY_SEED_FILES` manifest group sources it, `ai-task-manager install` presents the opt-in
`all` / `choose` / `none` menu, and the SessionStart + PostCompact index hook surfaces
`MEMORY.md` on demand. This investigation delivered the rebased+reconciled seed, the parity
tooling, and this spec.
