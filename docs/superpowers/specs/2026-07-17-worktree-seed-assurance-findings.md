# Worktree Seed Assurance — Open-Question Findings (#869)

The design spec (`2026-07-17-worktree-seed-assurance-design.md`, section
"Open questions the plan must resolve, not assume") records two unknowns that
gate later implementation tasks. This document answers both from reproduced
evidence.

## Mid-session self-link origin

**Question:** What created a `node_modules/ai-task-manager` self-link mid-session
(observed at 08:16:06) in a worktree that had none minutes earlier?

**Evidence (reproduced 2026-07-17):**

A throwaway detached worktree was created off `HEAD` and inspected at each step:

1. `git worktree add --detach <probe> HEAD` → **no** `node_modules/ai-task-manager`.
   A fresh worktree starts unseeded, as the design assumes.
2. `npx --no-install aitm help` inside the probe → exit 1, and **still no**
   self-link. A plain `npx` invocation does not create the link.
3. `npm run prepare` inside the probe → the `prepare` lifecycle script runs
   `scripts/task-tracker/ensure-self-link.mjs`, which printed
   `[self-link] created node_modules/ai-task-manager -> <probe-root>`.
   `realpath(node_modules/ai-task-manager)` then equalled the probe root.

`package.json` confirms the wiring:

```
"prepare":   "node scripts/task-tracker/ensure-self-link.mjs",
"link:self": "node scripts/task-tracker/ensure-self-link.mjs",
```

**Conclusion:** The mid-session self-link is created by npm's `prepare`
lifecycle running `ensure-self-link.mjs`. npm fires `prepare` automatically on a
bare `npm install` / `npm ci` (and it can be invoked directly as `npm run
prepare` / `npm run link:self`). The 08:16:06 appearance therefore corresponds
to an npm lifecycle invocation in that worktree during the session — not to any
spontaneous or unexplained mechanism. This is the **same** operation #869's heal
delegates to (`ensureSelfLink`), so the design already coexists with it: a
pre-existing, correctly-resolving self-link is classified `seeded` and left
untouched (verified by Task 8's idempotency test). No conflict.

## Consumer unscoped-path mechanism

**Question:** The package publishes scoped as `@kburson/ai-task-manager`, yet
every hook and guard command resolves the **unscoped** path
`node_modules/ai-task-manager/…`. How does a consumer obtain the unscoped path?

**Evidence:**

- `node -p "require('./package.json').name"` → `@kburson/ai-task-manager`
  (scoped publish name).
- `README.md:39` documents the consumer install as `npm i -D
@kburson/ai-task-manager` — the **scoped** name, which installs to
  `node_modules/@kburson/ai-task-manager`, not the unscoped path.
- `package.json` has **no** `postinstall` / `install` / `preinstall` script — only
  `prepare`. For a registry tarball install of a dependency, npm does **not** run
  the dependency's `prepare` (that runs for the package being developed and for
  git/local-path installs, not for published-tarball consumers). So nothing in a
  normal scoped consumer install provisions `node_modules/ai-task-manager`.
- No documented install alias (`npm i ai-task-manager@npm:@kburson/ai-task-manager`)
  exists anywhere in `docs/` or `README.md`.

**Conclusion: option (c) — no established consumer mechanism; the unscoped path
is a dev-checkout artifact.** `node_modules/ai-task-manager` is created only by
the dogfooding self-link (`prepare` / `link:self`) inside a dev checkout of this
repo. A registry consumer installing the scoped package does not obtain it. That
the shipped hook/guard commands reference the unscoped path is a pre-existing gap
for registry consumers, independent of and out of scope for #869.

**Implication for Task 6:** The `deps-missing` branch of `ensure-worktree-seeded.mjs`
is effectively a **dev-only diagnostic**. `inspectSeed` still classifies a
consumer layout correctly — a real install occupying the `node_modules/ai-task-manager`
slot is `not-applicable`; its absence is `deps-missing` — but because no
established consumer path provisions the unscoped slot, the `deps-missing` remedy
stays the generic `npm ci` text written in Task 3. **Task 6 makes no code change**
and records this decision in its commit body.
