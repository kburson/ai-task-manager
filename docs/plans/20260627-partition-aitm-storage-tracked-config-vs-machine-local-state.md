# Partition aitm storage — tracked config vs machine-local state

## Scope

Re-organize where the `/task` skill stores files so that the root config folders
(`.ai-task-manager/`, `.claude/`, `.agents/`) hold **only** files that define
behavior and project customization shared across team members and their separate
clones, and **everything machine-local / transient** lives under a single
`.tmp/aitm/` tree.

The organizing principle: **tracked set ≡ worktree-required set.** A `git worktree
add` checkout receives tracked files for free and gitignored files not at all, so
"does an isolated sub-agent need this file?" and "should this file be tracked?" are
the same question. Seeding exists only to paper over files that should have been
tracked; once the partition is right, seeding collapses.

**Out of scope:** changing the GitHub Projects board, the timing-log format, or the
verb state machine. Back-compat migration shims are unnecessary — the package is
unpublished, single-user; the one other install has no active issues and will be
reinstalled fresh after this lands (hard cut, no legacy `.claude/` fallback kept
alive beyond what already exists).

## Context

Decisions reached during discovery:

- **Two ways files currently "propagate to clones":** git-tracked (real shared
  config) and package-seeded (install-copies regenerable from `templates/`). Only
  the git-tracked set is authoritative.
- **Live runtime state is NOT tracked.** GitHub is the sync source of truth — the
  issue's board column + timing-log comment are machine-independent; the local
  `task-tracker-state.json` is a derived pointer reconstructed by re-binding
  (`/task #N`) after a `git pull`. Tracking live state was rejected for three
  reasons: (1) it dirties the working tree on every bind/pause/resume, which
  **disables the content-addressed verifier cache** (a dirty tree turns off every
  cache hit); (2) it is already synced via GitHub; (3) it is precisely the data
  that conflicts across machines/users. The single carve-out is an unsaved
  `/task discover` brainstorm, which has a real cross-machine loss story and gets a
  tracked draft home.
- **`project-fields.json` + `project-field-events.json` are stable declarative
  config, not ephemeral caches.** They encode board field schema, human-chosen
  aliases, and per-transition field-write rules — project customization that should
  not differ clone to clone. They will be tracked, guarded by a **write-if-changed**
  writer so the runtime never dirties the tree by rewriting an unchanged file.
- **Anchoring must be preserved.** `orchestrator.lock` and `task-fleet.json` are
  MAIN-worktree-anchored (resolve via `findMainWorktreePath`) and coordinate across
  linked worktrees; everything else is cwd-anchored (per-worktree). The move must
  keep each file's anchor — main-anchored files land at `<main>/.tmp/aitm/fleet/`,
  not `<cwd>/.tmp/...`.
- **A path-resolver layer lands first.** 39 `.ai-task-manager/` + 7
  `.claude/task-tracker` string literals are scattered inline; they collapse into
  named helpers in `paths.mjs` (a main-anchored family and a cwd-anchored family)
  before any file actually moves, so each later story flips one constant rather
  than chasing literals.

### Target layout

```
.ai-task-manager/            # ONLY tracked, behavior-defining config
  task-tracker.json
  activity-policy.json
  project-fields.json        # tracked (write-if-changed)
  project-field-events.json  # tracked (write-if-changed)
  templates/
    definition-of-done.md
    pickup-directive.md
    session-boot.md
    session-state-template.md
    worker-report.md
    epic-body.md  solo-issue-body.md  sub-issue-body.md
    references/

.tmp/aitm/                   # machine-local, untracked, worktree-fresh
  state/      task-tracker-state.json, task-tracker-queue.json
  cache/      verifier-results (regenerable; safe to nuke)
  locks/      issue-*.lock, timing-*.lock
  sessions/   per-session active-task
  gates/      (the old .claude/task-tracker.session.*.json)
  app/{claude,codex}/
  fleet/      task-fleet.json, orchestrator.lock   ← MAIN-anchored resolver
```

## Acceptance Criteria

Delivered as an epic with five child stories (dependency-ordered) plus two
standalone solos beside it. Hard chain: 1 → {2, 3} → 4; story 5 and the solos float.

- [ ] **Story 1 — Path-resolver layer (prerequisite).** Every current
      `.ai-task-manager/` and `.claude/task-tracker*` literal routes through a named
      helper in `paths.mjs`, split into a main-anchored family
      (`fleetPath`, `orchestratorLockPath`) and a cwd-anchored family
      (`statePath`, `queuePath`, `cacheDir`, `locksDir`, `sessionsDir`, …). No files
      move in this story; behavior is unchanged; resolver has unit coverage.
- [ ] **Story 2 — Move live runtime state to `.tmp/aitm/`.** state, queue, cache,
      locks, sessions, per-app (`claude/`, `codex/`), gate-override files (flip
      `session-store.mjs` `DEFAULT_DIR`), and fleet/orchestrator.lock
      (**main-anchored preserved**) resolve under `.tmp/aitm/`; gitignore block
      rewritten; no functional regression across bind/pause/resume/fleet.
- [ ] **Story 3 — Track config + consolidate templates.**
      `project-fields.json` + `project-field-events.json` tracked with a
      write-if-changed writer (verify a refresh of unchanged content leaves the tree
      clean); DoD, pickup-directive, `*-body.md`, `session-boot.md`, `references/`
      relocated into `.ai-task-manager/templates/` with all references updated
      (router hard-rules 9 & 11, SKILL.md, seed paths).
- [ ] **Story 4 — Retire seed-worktree.** A freshly created worktree functions with
      **zero seeding** (contracts arrive via git, runtime state auto-creates under
      `.tmp/aitm/`); `seed-worktree.mjs` + `create-worktree.mjs` copy logic
      deleted/shrunk; the #539 "missing templates" gap is provably closed.
- [ ] **Story 5 — Discover-autosave carve-out.** `/task discover` autosaves its
      working bucket to a tracked `docs/plans/.drafts/<slug>.md` so an unsaved
      brainstorm survives a machine swap.

### Standalone solos (filed beside the epic, not children)

- [ ] **`brainstorm` alias for `discover`.** Declared in `command-manifest.mjs`
      `aliases` AND as a fall-through `case 'brainstorm':` in `task-tracker.mjs`;
      `parseVerbs` parity test passes.
- [ ] **`project-fields` nesting by project-id.** Migrate the flat array to
      `{ "<projectId>": [...] }` for multi-board support; note the
      teammate-creates-own-board → stories-not-on-shared-board caveat (a GitHub
      Projects reality, documented not solved). Distinct feature; depends on Story 3
      landing first.

## Plan Metadata

- Priority: P1
- Size: XL
- Estimate: 24 hours
- Labels: refactor, infrastructure, EPIC
