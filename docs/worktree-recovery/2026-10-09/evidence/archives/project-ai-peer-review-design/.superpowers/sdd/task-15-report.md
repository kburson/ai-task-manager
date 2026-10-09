# Task 15 report — guarded partial

## Status

`DONE_WITH_CONCERNS` for the authorized guarded partial. Commit `311cef526ecc637ab0edbbcfbe18ace816ff73c4`
is clean and has an exact-SHA Develop receipt. The sanctioned Develop-to-Test promotion
was attempted but failed its isolated verification and left #1546 in `Develop`; no Review,
delivery, release, push, merge, provider action, or issue closure was performed.

## Bootstrap and AITM evidence

- Worktree: `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/ai-peer-review-design`
- Recorded branch: `codex/ai-peer-review-design`
- Baseline: `c7a880d275a63ce6323b78b32f5fb2b0b2b833c5`
- Bound #1546 as `agent`; `npx aitm auto both` confirmed Full-Auto.
- Deep dive was written through the canonical `ensureDeepDive` writer and stamped through
  `npx aitm ensureChecked "Deep dive complete"`.
- The controller completed the adaptive forecast after local `plan-estimate` calls exceeded the
  execution boundary. `npx aitm plan-approve 1546` succeeded after the sanctioned root-level
  waiver operation (`issue-body: ok version=17`), and `npx aitm promote 1546` entered Develop.
- The governed decomposition waiver was inserted before Acceptance Criteria with fresh timestamp
  `2026-09-10T13:23:37Z`; it states the one-boundary rationale, 16h focus estimate, checkpoints,
  no-nested-children rationale, and Full-Auto orchestrator approval without claiming human review.
- Sentinels emitted: `aitm-skill-loaded:router:1.1.0`,
  `aitm-boot-recovered:task15-1546:2026-09-10T00:00:00-05:00`,
  `aitm-skill-loaded:rules/bind:1.0.0`, `aitm-skill-loaded:rules/full-auto:1.0.0`,
  `aitm-skill-loaded:rules/state-walk:1.2.0`, `aitm-skill-loaded:rules/issue-records:1.0.0`,
  `aitm-skill-loaded:rules/scratch-dirs:1.0.0`, and
  `aitm-skill-loaded:rules/commit-trail:1.0.0`.

## Implementation and changed files

`npm install ai-peer-review@0.1.0 --save-exact` added the published exact dependency.
The implementation adds a public-API-only adapter (`statusReview` imported from
`ai-peer-review`), fixed package configuration, a non-authoritative occupancy observation cache,
and an active-legacy-row removal guard.

- `package.json`
- `package-lock.json`
- `scripts/task-tracker/lib/peer-review-adapter.mjs`
- `scripts/task-tracker/lib/occupancy.mjs`
- `scripts/tests/integration/review/peer-review-package-parity.test.mjs`
- `scripts/tests/integration/review/peer-review-migration-guard.test.mjs`

The complete `c7a880d2..311cef52` self-review reports exactly these six files and 151 added lines;
`git diff --check c7a880d2..HEAD` passed.

## TDD evidence

RED was first run with:

```text
node --test scripts/tests/integration/review/peer-review-package-parity.test.mjs scripts/tests/integration/review/peer-review-migration-guard.test.mjs
```

It failed as intended because the package adapter and migration guard did not exist. A second RED
after the adapter existed failed on absent `cachePeerReviewStatus`. After implementing the adapter,
guard, cache, and tests, the same focused command was GREEN: 5 passing, 0 failing. The final focused
GREEN rerun also passed; `npm run lint:story-tags` and targeted Prettier check passed after adding
the required `@story #1546` headers.

## Commands and verification

```text
node --test scripts/tests/integration/review/peer-review-package-parity.test.mjs scripts/tests/integration/review/peer-review-migration-guard.test.mjs
# PASS: 5/5

git diff --check
# PASS

node scripts/task-tracker/verify-develop.mjs --mode final --issue 1546
# PASS: lint-full and format-full for 311cef52
# receipt: 01M25RG43NHSGMK4M69G4R8N0R

npx aitm commit-trace 1546
# PASS: canonical commit trace created

npx aitm ac-stamp 'Deliver "### Task 15: Migrate AITM Through the Published Package Boundary" exactly as specified in the accepted source plan.'
# PASS: VC 1, 2, 3; AC evidence key 6d6c0c10 at SHA 311cef52

npx aitm ensureChecked 'Deliver "### Task 15: Migrate AITM Through the Published Package Boundary" exactly as specified in the accepted source plan.'
# PASS
```

The first `npx aitm promote 1546` correctly refused until the AC evidence and commit trace existed.
After the commands above, the next promotion ran its final checks and isolated Test verification,
then returned:

```text
✗ #1546 verification failed in sandbox (3 command(s)).
promote: delegate /task test exited 3; recorded state left at "develop".
```

`npx aitm status 1546` then read the active recorded #1546 binding in this worktree.

## Guarded partial and concerns

The recorded global legacy index
`/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.tmp/aitm/fleet/co-review-index.json`
contains 14,103 rows with `lifecycle: "active"`; examples point to historical `1321-grok-provider-adapter`
and `1325-occupancy-co-review` scratch worktrees. Per orchestrator direction, this task did not
reconcile, delete, or rewrite those rows. Consequently Step 6 (legacy runtime deletion) is
conditional and was not taken: all `scripts/review/**` paths and dependent entrypoint/help/manifest
surfaces remain unchanged until a separate authority/cleanup scope supplies proof that removal is safe.

The direct iteration verifier command

```text
node scripts/task-tracker/verify-develop.mjs --mode iteration
```

failed on an unrelated existing file, `scripts/tests/integration/task-tracker/verbs/bind.test.mjs`:
its second integration test attempted to write
`.../.scratch/test/tt-bind-hint-<random>/state-1.json` after the parent directory was removed.
The standalone command reproduced it (`7 pass, 1 fail`). Read-only instrumentation attributed the
removal to the test's own `test.after(() => rmSync(tmp, ...))` at line 153, which is attached to the
first async integration test and fires before the second test begins. The file is byte-identical
between `c7a880d2` and `311cef52`; #1546 did not modify it. The smallest corrective experiment is a
separate scoped change that attaches cleanup to a true enclosing/root fixture, then reruns only that
test (expected 8/8). No correction was made here.

The earlier synchronized baseline note saying `npm test` passed 843 files cannot prove this current
failure is caused by #1546: the current baseline tree already contains 1,053 test files, while HEAD
contains 1,055 solely because this task added two tests, and the failing test is byte-identical.

## Commit

```text
311cef52 [#1546] feat: consume standalone peer review package
```
