# Spike #429 — Fleet-registry proliferation and missing garbage collection

**Status:** complete (2026-06-16)
**Type:** investigation spike
**Trigger:** `.ai-task-manager/task-fleet.json` was observed holding 27 stale
entries in a single session — a mix of test detritus and bogus main-repo binds
recorded with a `trunk` worktree path. One such entry (`#405 @ trunk`) jammed
`chore-mode`, which refuses to engage while any live worktree-scoped agent is
registered.
**Follow-up implementation issues:** #441 (GC), #442 (test-leak).

## Summary

The fleet registry accumulates agent entries with no garbage collection. This
spike traces every write path, names why entries are never removed, explains the
`#405 @ trunk` misclassification that trips chore-mode, records a recommended
automated-cleanup design, and identifies the follow-up implementation issues. No
production fix lands here.

<!-- AC1-anchor: append-paths -->

## AC1 — Every append / write path to task-fleet.json, with stale/bogus producers flagged

The registry is mutated only through `scripts/task-tracker/fleet-registry.mjs`.
Three mutators:

- **`registerTask(projectDir, issueRef, worktreePath, branch)`** — sets
  `fleet[issueRef] = { worktreePath, branch, startedAt: existing?.startedAt ?? now, status: 'active' }`.
  This is the only *append* path. Three callers, **all of which pass
  `worktreePath = projectDir`** (the resolved project dir, i.e. the repo root on
  the main thread):
  - `verbs/switch.mjs:86`
  - `verbs/new.mjs:135`
  - `verbs/resume.mjs:79`
- **`setTaskStatus(projectDir, issueRef, status)`** — mutates `.status` in
  place; no-op if the entry is absent. Callers: pause / start / resume / review.
  Never creates or removes an entry.
- **`deregisterTask(projectDir, issueRef)`** — `delete fleet[issueRef]`. The
  only *removal* path. Callers: switch-away-from-previous (`switch.mjs`) and
  close (×4 in the close lifecycle).

**Stale / bogus producers identified:**

(a) **Main-thread binds are indistinguishable from worktree agents.** All three
`registerTask` callers store `worktreePath = projectDir`. On the main thread
`projectDir` resolves to the repo root, so a plain `/task #N` bind writes an
entry whose `worktreePath` equals the repo root — byte-identical in shape to a
real parallel-worktree agent. `#429` itself is exactly this class: its
`worktreePath` is the live repo root.

(b) **Test sandboxes leak into the *real* registry.** Tests that allocate a
scratch dir with a bare `mkdtempSync(path.join(projectScratchDir('test'), ...))`
and then *skip* git-init produce entries in the live registry. Because the
sandbox has no `.git`, `findMainWorktreePath` walks up and out of the sandbox and
resolves to this repo's real root (the leak documented in `lib/scratch-dir.mjs`
lines 36-43), so `registerTask` writes to the live
`.ai-task-manager/task-fleet.json`. Confirmed leaking tests:
`tests/resume-seed.test.mjs` (→ #777, #888), the tt-cli test (→ #999, #108), and
the tt-start-switch test (→ #200, #201, #202). **7 of the 8 live entries at
spike time were test-leak garbage.**

<!-- AC2-anchor: no-removal-root-cause -->

## AC2 — Root cause: entries are never removed

`deregisterTask` fires on exactly two events: an explicit `close`, and switching
*away from* a previously-bound issue. There is:

- no session-end / stop-hook reap,
- no staleness sweep (`startedAt` is recorded but used for display only),
- no eviction when the referenced `worktreePath` no longer exists on disk.

`pause` only sets `status = 'paused'`; the entry stays. So any issue that is
bound but not explicitly closed — and every leaked test sandbox (which never
closes) — persists in the registry forever. The `fleet` verb (`verbs/fleet.mjs`)
is **read-only**: it has no prune / reap / gc subcommand, so there is no
operator-facing way to clean up either. **The missing hook is a removal trigger
at session-end and/or a lazy staleness reap at read-time.**

<!-- AC3-anchor: trunk-misclassification-root-cause -->

## AC3 — Root cause: #405@trunk trips chore-mode

`verbs/chore-mode.mjs` gates `choreModeOn` on
`liveWorktreeAgents(fleet).length > 0` (returns exit 2 when any "live worktree
agent" exists). The discriminator:

```js
for (const [ref, entry] of Object.entries(fleet)) {
  if (entry.status !== 'active') continue;
  if (!entry.worktreePath || typeof entry.worktreePath !== 'string') continue;
  out.push({ ref, ...entry });
}
```

The test "is this a live worktree agent?" is *status active + non-empty
worktreePath*. But **every** entry has a non-empty `worktreePath` (per AC1(a),
even main-thread binds store the repo root), so a plain main-thread bind such as
`#405@trunk` / `#429@trunk` is misclassified as a live worktree agent and blocks
chore-mode. The discriminator has no way to tell "agent running in its own
worktree" from "main-thread session bound to an issue." That is precisely how a
main-thread bind gets recorded with a `trunk` worktree path and trips
chore-mode's live-agent refusal.

<!-- AC4-anchor: cleanup-design -->

## AC4 — Recommended automated-cleanup design

A four-part remediation, ordered by value:

1. **Distinguish main-thread binds from worktree agents.** Minimal fix: in
   `liveWorktreeAgents`, compare `entry.worktreePath` to
   `findMainWorktreePath(projectDir)` and exclude entries equal to it (those are
   main-thread binds, not worktree agents). Robust fix: add a
   `kind: 'main' | 'worktree'` field at `registerTask` time (the caller knows
   which it is) and filter on `kind === 'worktree'`. The kind-field fix also
   future-proofs any other consumer that today has to infer intent from the path.

2. **GC trigger points.** Keep the existing close / switch-away
   `deregisterTask`. Add: (a) a stop-hook / session-end reap that deregisters the
   session's own bind, and (b) a bounded *lazy auto-reap* on `readFleet`
   (guard-time) that evicts stale entries whenever the registry is read.

3. **Staleness criteria for the reap:** evict an entry when any of — its
   `worktreePath` no longer exists on disk; it is `active` with `startedAt` older
   than a threshold (~24h); or it is a main-thread bind that is not the currently
   active issue.

4. **Operator escape hatch:** a `fleet prune [--dry-run]` subcommand on the
   (currently read-only) `fleet` verb, sharing the staleness predicate from (3),
   so a human can inspect-then-sweep on demand.

Highest-value single change: **fix the test leak** (AC1(b)) — migrate the
bare-`mkdtemp` tests to `mkdtempProjectIsolated` (which git-inits the sandbox so
`findMainWorktreePath` stays contained) and add a lint guard forbidding bare
`mkdtempSync` under `projectScratchDir` in tests. That alone removes 7 of 8
current garbage entries and stops the bleeding at the source.

<!-- AC5-anchor: follow-up-issues -->

## AC5 — Follow-up implementation issues

Two implementation issues were filed from this spike's findings and linked from
the issue:

- **#441 — Fleet registry GC — kind-tagged entries + `fleet prune` +
  guard-time auto-reap.** Implements AC4 parts 1-4: kind-tagged entries, the
  staleness predicate, guard-time auto-reap on `readFleet`, the
  `fleet prune [--dry-run]` subcommand, and migration of pre-existing entries.
  Size M, Estimate 4h, P2.
- **#442 — Test sandboxes leak into live fleet registry — migrate bare
  `mkdtemp` tests + lint guard.** Implements the highest-value single change
  from AC1(b)/AC4: migrate `resume-seed.test.mjs`, the tt-cli test, and the
  tt-start-switch test to `mkdtempProjectIsolated`, add a lint guard, and remove
  the 7 pre-existing garbage entries (or via #441's `fleet prune` if it lands
  first). Size S, Estimate 2h, P2.

The chore-mode `liveWorktreeAgents` misclassification (AC3) folds into #441 if
the kind-field fix is taken.
