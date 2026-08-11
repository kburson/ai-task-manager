# Test Authoring Guide

Conventions for slow / integration tests under
`scripts/task-tracker/tests/slow/` and any test that builds a `gh` or `git`
shim and invokes a verb end-to-end. Captured as part of #344 after #343
surfaced a body-truncation defect that had masked guard-cascade rot across
multiple test files.

## Why this guide exists

The slow-test lane drives real verb scripts through shimmed `gh` and `git`
binaries against fixture issue bodies. Two failure modes have historically
gone undetected for long stretches:

1. **Pipe-truncation bug in shims.** A shim that wrote a large body via
   `process.stdout.write(...)` then immediately called `process.exit(0)`
   could silently truncate the payload at the pipe high-watermark
   (~8 KB on macOS). The parent then read a half-body fixture and any
   gate that depended on a marker past the cut-off silently misfired.
   #343 fixed the immediate symptom in `move-state-approval-gate.test.mjs`;
   #344 swept the rest of the slow lane.
2. **Fixture-marker rot.** Guards added since a test was authored never
   got wired into the fixture body or the shim's response payload. The
   test stayed green because the truncation bug above masked the cascade.
   Once the shim was fixed, the rot surfaced.

Both defect classes are preventable with the conventions below.

## Shim conventions

### Sandbox isolation

Use `mkdtempProjectIsolated(prefix)` from
`scripts/task-tracker/lib/scratch-dir.mjs`. It creates a fresh git-worktree
root under `./.tmp/test/` and drops an empty `package.json` so node defaults
to CommonJS for any shim placed under the sandbox. This keeps `git
rev-parse --show-toplevel` from escaping the sandbox into the live repo
and lets CJS-style shims (`require('node:fs')`) coexist with the project's
`type: module` root.

Never invent ad-hoc sandbox helpers. Never write under `/tmp` directly —
the `lint:tmp` guard rejects it.

### Stdout writes use `fs.writeSync(1, ...)`

Inside every shim body (the `#!/usr/bin/env node` text written into
`bin/gh` or `bin/git`), use `fs.writeSync(1, <payload>)` to emit response
payloads — never `process.stdout.write(<payload>)`. `process.stdout.write`
is non-blocking when stdout is a pipe; `process.exit(0)` on the next line
truncates anything past the pipe high-watermark.

Ensure the shim body imports `fs`:

```js
const shim = `#!/usr/bin/env node
import fs from 'node:fs';
// ...
fs.writeSync(1, JSON.stringify(payload));
process.exit(0);
`;
```

All shim bodies use ESM `import` (project convention: `type: module`). If
the shim lives under a sandbox whose root `package.json` has no `type` key
(e.g. `mkdtempProjectIsolated`), drop a `package.json` containing
`{"type":"module"}` next to the shim binary so node loads it as ESM:

```js
const binDir = path.join(sandbox, 'bin');
mkdirSync(binDir, { recursive: true });
writeFileSync(path.join(binDir, 'package.json'), JSON.stringify({ type: 'module' }));
```

Do not author `require`-based shims. The project is `type: module`; CJS
inside a sandbox is a leak.

### Shim API coverage

For every CLI invocation, REST endpoint, and GraphQL query the code path
under test exercises, the shim must respond — at minimum exit 0 silently.
Unhandled args today produce silent test-rot tomorrow when the production
code starts depending on the response.

Grep the code path before authoring the shim:

```sh
grep -nE "execFile\(|exec\(|pexec\(|'api'|'graphql'|'issue '|'project '" \
  scripts/task-tracker/verbs/<verb>.mjs scripts/gh/<script>.mjs
```

Every call site found is a branch the shim must cover.

### Fixture markers vs current guards

A body fixture used in a `move-state` / `promote` / `close` transition
must contain every marker required by the registered guards for that
transition. Cross-reference:

- `scripts/task-tracker/states/<stage>.mjs` — `exitGuards` list.
- `scripts/gh/move-state.mjs` — inline gates still living there
  (`aitm-plan-approved`, `aitm-deep-dive-complete`,
  `aitm-deep-dive-posted`, the `aitm-entered-<stage>` chain).
- `scripts/task-tracker/lib/refine-estimate-comment.mjs` — refine-estimate
  REST comment lookup; plan→develop requires the `### Planned Estimate`
  appendix.

When a new guard is added, the same PR must update every fixture body
that drives that transition. A guard-registry change with no test-fixture
churn is a smell.

## Vocab and field-schema drift

Refusal-text assertions reference current refusal strings. Fixture bodies
use the current verb vocabulary (Backlog, Assigned, Refine, Plan, Develop,
Test, Review, Done) — not `Groom` / `Analyze` / pre-eight-state names. Field schema and
assignee in fixtures must match the current `task-tracker.json`.

## When something is genuinely shim-incompatible

If a code path is impossible to shim without re-implementing half of `gh`,
escalate to either:

1. A unit test against a smaller injectable seam.
2. A real integration test under `tests/task-tracker/integration/` that
   talks to a live test repo (gated by env).

Do not paper over with a shim that lies about the response shape — the lie
becomes invisible test-rot.
