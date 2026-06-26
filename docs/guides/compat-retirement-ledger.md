# Compatibility-Retirement Ledger

Migration residue — deprecated markers, compatibility shims, and legacy
command/verb aliases — has a habit of becoming permanent architecture because
nothing records _when it may go_. This ledger gives each legacy path an explicit
rationale, an owner, a **Removal** condition, and a review date, so retirement is
a tracked decision rather than indefinite drift.

The false guard "skeleton" comment (corrected in #552) is exhibit A for why this
ledger exists: a stale residual artifact that no one was tracking, which actively
misled readers about whether the guard layer was wired.

## How to use this ledger

- Add a row whenever you introduce a deprecation shim, a back-compat alias, or a
  legacy-form marker transform that exists only to ease a migration.
- The **Removal** column states the precondition that, once true, makes the entry
  safe to delete. When that precondition holds, delete the legacy path _and_ its
  ledger row in the same change.
- The **Review** date is the next time someone should re-check whether the
  removal precondition has become satisfiable.

## Ledger

### 1. `guard-bootstrap.mjs` deprecation shim

- **Kind:** compatibility shim (re-export).
- **Introduced:** #292 (replaced by `state-bootstrap.mjs`).
- **Rationale:** `scripts/task-tracker/lib/guard-bootstrap.mjs` is preserved as a
  re-export of `bootstrapGuards` from `state-bootstrap.mjs` so existing importers
  keep working unchanged while the per-state container model lands.
- **Owner:** state-machine maintainer.
- **Removal:** delete once every importer migrates to `state-bootstrap.mjs`
  directly. Current live importers (4): `scripts/gh/move-state.mjs`,
  `scripts/task-tracker/verbs/promote.mjs`, `verbs/close.mjs`, `verbs/review.mjs`.
- **Review:** 2026-09-01.

### 2. Guard "skeleton / no callers yet" comment residue — RETIRED (seed entry)

- **Kind:** deprecated/false source comment.
- **Introduced:** original `guard-registry.mjs` header during the #259
  inline-gate → registry migration.
- **Rationale:** the header claimed "Skeleton-only. No callers yet." long after
  `runGuards` was wired into every transition — dangerous in an AI-facing repo
  because an agent could conclude the guard layer was inert.
- **Owner:** state-machine maintainer.
- **Removal:** DONE in #552 — header rewritten to the real wiring; a
  `guard-comment-truth.test.mjs` regression test now fails if any guard-source
  comment reasserts a "skeleton / no callers / unimplemented" claim. Kept here as
  the seed example of the class this ledger guards against.
- **Review:** closed.

### 3. Promote stage-alias verbs (`develop → test`, `review → close`)

- **Kind:** legacy verb alias.
- **Introduced:** the `promote` consolidation (#533 and predecessors).
- **Rationale:** `promote` maps `develop → test` and `review → close` to the
  legacy stage verbs (`test`, `close`) so their full gate stacks run unchanged
  rather than being duplicated inside `promote`. States with no alias fall
  through to a direct `move-state` call.
- **Owner:** verb-layer maintainer.
- **Removal:** retire the alias indirection only if the stage-verb gate stacks
  are folded into the state containers' exit/entry guards so `promote` can move
  directly without delegating. Until then the aliases are load-bearing.
- **Review:** 2026-12-01.

### 4. Legacy config paths (`.claude/task-tracker.json`)

- **Kind:** deprecated file-location fallback.
- **Introduced:** pre-`.ai-task-manager` config layout.
- **Rationale:** `config.mjs` still reads `legacyProjectPath`
  (`.claude/task-tracker.json`) and `legacyUserPath`
  (`~/.claude/task-tracker-config.json`) when the canonical path is absent, so
  installs predating the relocation keep working.
- **Owner:** config maintainer.
- **Removal:** drop the legacy-path fallbacks once a migration step rewrites all
  known installs to the canonical `.ai-task-manager` location (and a major
  version bump signals the break).
- **Review:** 2026-12-01.

### 5. Legacy colon-form hidden-marker transforms

- **Kind:** deprecated marker grammar + migration transforms.
- **Introduced:** the marker grammar canonicalization (#375/#387/#388, C3
  corpus migration).
- **Rationale:** `scripts/maintenance/lib/corpus-marker-transforms.mjs` holds one
  pure `(body) => body` transform per marker family that converts the legacy
  `aitm-…:` colon form to the canonical pair form, repairing residual bodies the
  initial migration missed.
- **Owner:** maintenance/migration owner.
- **Removal:** delete the transforms once a corpus scan confirms zero stored
  issue bodies still carry any legacy colon-form marker.
- **Review:** 2026-09-01.

### 6. Retired workflow vocabulary

- **Kind:** deprecated state/vocabulary aliases.
- **Introduced:** the board-column model predating the current eight-state
  machine.
- **Rationale:** the `Groom` / `Analyze` / `Todo` columns and the "R4R" and old
  `Review → Test` terms are retired; they may still appear in historical issue
  bodies, comments, and docs.
- **Owner:** workflow-docs owner.
- **Removal:** purely historical — no code path depends on them. Scrub stray
  references opportunistically; no migration required.
- **Review:** as-encountered.
