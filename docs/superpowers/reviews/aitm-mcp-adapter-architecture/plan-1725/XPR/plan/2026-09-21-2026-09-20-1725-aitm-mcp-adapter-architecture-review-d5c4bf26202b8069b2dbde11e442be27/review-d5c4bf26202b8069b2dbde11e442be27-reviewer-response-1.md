<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-d5c4bf26202b8069b2dbde11e442be27"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md"
artifact_commit: "e85068ad3c46acdaffcd5b13cfc3fd336b2172fa"
artifact_blob: "ec62580ea3faaf61cc71463b74092144cff6a505"
artifact_digest: "sha256:ebf579e3a1c3e93be3f1943476e29d0053b18cc8740db9eaf367409eb6b9955a"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:844daf447a0727e0845be44cc15ff09d863d0e03d5f31d9c253d3917fc407618"
  identity_source: "declared"
started_at: "2026-09-21T04:17:25.225Z"
submitted_at: "2026-09-21T04:22:06.126Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md`
(artifact commit `e85068ad3c46acdaffcd5b13cfc3fd336b2172fa`) as an umbrella
hydration plan, against the governing specification
`docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md` and
against the current repository state in this worktree.

Scope of what I verified, and how:

- Spec-to-plan criterion coverage. The specification carries 21 numbered
  acceptance criteria with criterion 8 split into 8a–8d (spec lines 1704–1778).
  The plan's `Acceptance-to-Task Traceability` table enumerates rows 1–21 with
  8a, 8b, 8c, and 8d as separate rows plus a quota/retention envelope row. Every
  criterion has at least one owning task and at least one named executable
  suite, and every one of the 20 tasks appears as an owner in at least one row.
  The plan's own first acceptance criterion ("All 21 architecture acceptance
  criteria have an owning task and named executable verification coverage") is
  therefore internally satisfied by the table it ships.
- Phase and gate consistency. `Hydration and Execution Protocol` maps tasks
  1–3 → Phase 0, 4–10 → Phase 1, 11 → Phase 2, 12–13 → Phase 3, 14–15 → Phase 4,
  16 → Phase 5, 17–19 → Phase 6, 20 → Phase 7. That partition is total, disjoint,
  and matches the specification's `### Phase 0` … `### Phase 7` headings (spec
  lines 1507–1644). Gates A–E partition tasks 1–3 / 4–10 / 11–13 / 14–16 / 17–20
  with no task uncovered and no task claimed twice.
- The SDK ordering hazard. Task 16 (Phase 5) publishes the adapter SDK, but
  Tasks 4, 8, and 9 (Phase 1) already need a shared ABI and conformance
  fixtures. The plan resolves this explicitly rather than by accident: Task 4
  creates `src/adapter-sdk/index.mjs`, `define-adapter.mjs`, and
  `manifest-schema.mjs` and ratifies the ABI; Task 8 runs the local-git adapter
  "through the Task 4 shared ABI and conformance contract used by external
  adapters; there is no separate built-in contract"; Task 16 "extends the Task 4
  SDK" and publishes it. Task 2's prototype is correctly fenced off from this
  with "uses an isolated draft SDK contract fixture; it does not depend on Task
  16 publication or establish the production ABI." I found no circular
  dependency here.
- Existing-path references. I confirmed on disk that every current path the
  plan says it will adapt or extend exists:
  `scripts/task-tracker/lib/evidence-v2/` (including `migration.mjs`),
  `scripts/task-tracker/lib/github-records/`,
  `scripts/task-tracker/lib/workflow-policy/`,
  `scripts/package/install-contract.mjs`, `install-manifest-store.mjs`,
  `install-observer.mjs`, `doctor.mjs`,
  `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`,
  `bin/aitm.mjs`, `bin/aitm-registry.mjs`, and
  `docs/decisions/0002-github-native-authority-records.md` (the ADR Task 16
  supersedes; `docs/decisions/` currently holds only 0001 and 0002, so "next
  available number at delivery time" is unambiguous). `src/` does not yet
  exist, which is consistent with the plan creating it.
- Test-layout conformance of the planned paths. `parseCanonicalTestPath` in
  `scripts/task-tracker/lib/test-lanes.mjs:17` requires
  `scripts/tests/<unit|integration|slow>/<relative>.test.mjs`, and
  `scripts/tests/tools/audit-test-layout.mjs:22` additionally rejects a file
  sitting directly in a lane root with no subsystem directory. Every test path
  the plan names satisfies both. The enforcement is structural only — it does
  not require the subtree to mirror a real source path — so relocating
  production code to `src/` while keeping tests under `scripts/tests/` does not
  violate ADR 0001's tree convention as it is actually enforced.
- The coverage-reach lint. I initially expected `npm run lint:test-reach` to
  condemn every new kernel test, because both the runner
  (`scripts/maintenance/lint-test-coverage-reach.mjs`) and the detector
  document the rule as "must exercise code under `scripts/`". Reading the
  detector, that is not what it implements: `MJS_LITERAL_RE` in
  `scripts/maintenance/lint-test-coverage-reach-detector.mjs:45` accepts any
  quoted non-test `.mjs` path literal, so `'../../../src/kernel/...mjs'`
  counts as reach. The plan is safe here. I record the check because the prose
  and the code disagree and a future reader could reach my first conclusion.
- The tracked-output assumption. Specification criterion 7 and plan Tasks 14
  and 15 depend on generated integration files being *tracked* and committable.
  A comment at `bin/lib/template-manifest.mjs:2` describes `.ai-task-manager/`
  as "gitignored", which would break that story. That comment is stale:
  `INSTALL_GITIGNORE_ENTRIES` in `scripts/package/install-content.mjs:102-110`
  ignores only `.ai-task-manager/.cache/` and `templates/**/*.bak`, not the
  directory. The plan's portability premise holds. No finding.

Overall assessment: this is a strong, unusually disciplined umbrella plan. Its
safety architecture — Phase 0 as a hard approval gate with budgets agreed
*before* measurement (Task 1) and compared *against the retained thresholds*
(Task 3), serial Gate B, the refusal to preassign child issue numbers, the
repeated insistence that a skipped live suite is not a certification pass, and
the explicit "never fabricate history or replace a missing stream with a new
genesis" in Task 5 — is exactly right for work of this blast radius. My
findings are not about that architecture. They are all in one narrow band: the
plan's **verification commands do not execute what the plan claims they
execute**, and one existing production entry point that the plan changes the
contract of is named by no task. For a plan whose entire value proposition is
gated, evidence-bearing delivery, a program gate that can go green without
running a third of its own new suites is a defect worth fixing before
hydration.

Decision: revisions-requested. The four required changes below are all small,
local edits to this file; none of them disturb the task decomposition, the
phase mapping, or the traceability table.

## Findings

1. **The Final Program Verification block never runs the integration lane, and
   neither does any task's verification block.** This is the most consequential
   finding.

   `package.json:21` defines `"test": "node scripts/run-tests.mjs --lane fast"`,
   and `scripts/run-tests.mjs:19` documents `--lane fast (default) — unit only
   (the deterministic local regression floor)`. `npm run test:slow` is
   `--lane slow`. The integration lane has its own script,
   `"test:integration": "node scripts/run-tests.mjs --lane integration"`
   (`package.json:23`), and the only lane that unions all three is `all`, which
   is exposed solely through `test:coverage`.

   The string `test:integration` does not appear anywhere in the plan. The
   `Final Program Verification` block runs `npm test`, `npm run test:slow`,
   `npm run lint`, `npm run format:check`, `npm audit --omit=dev`,
   `npm pack --dry-run`, and `git diff --check`. Therefore the release gate for
   this entire program executes the unit lane and the slow lane and skips the
   integration lane entirely.

   That lane is not incidental to this plan. By my count the plan places twelve
   new suites in it: `integration/kernel/evidence-append-recovery.test.mjs`,
   `integration/kernel/retention.test.mjs`,
   `integration/kernel/bootstrap.test.mjs`,
   `integration/kernel/runtime-admission.test.mjs`,
   `integration/kernel/governed-action-flow.test.mjs`,
   `integration/kernel/recovery.test.mjs`,
   `integration/conformance/local-git-adapter.test.mjs`,
   `integration/conformance/github-adapter.test.mjs`,
   `integration/conformance/github-quota.test.mjs`,
   `integration/transports/cli-kernel-parity.test.mjs`,
   `integration/transports/mcp-tools.test.mjs` and `mcp-resources.test.mjs`,
   `integration/transports/cli-help.test.mjs`,
   `integration/setup/guided-setup.test.mjs`,
   `configuration-activation.test.mjs`, and `staleness-recovery.test.mjs`, and
   `integration/host-bridges/mcp-bootstrap.test.mjs`. The traceability table
   names integration-lane suites as required verification for criteria 1, 2, 3,
   4, 5, 6, 7, 8a, 8b, 8c, 8d, 9, 10, 12, 15, 16, 17, 19, 21, and the
   quota/retention envelope row — that is, for almost every criterion in the
   specification.

   Each individual task does run its own new integration files by explicit
   `node --test <path>`, so the gap is not "these tests are never written or
   never run once." The gap is regression coverage at every gate after the one
   that introduced them: nothing in Gate C, D, or E, and nothing in the final
   release gate, re-executes the Gate B integration suites. Given that the plan
   is explicitly built around late-phase changes to early-phase contracts
   (Task 14 extends Task 7's admission contract, Task 16 extends Task 4's ABI
   and Task 7's loader, Task 20 rewires the guards Task 9 preserved), this is
   precisely the program where an unrun integration lane will hide a break.

   It also silently drops existing coverage. `scripts/tests/integration/` is
   populated today — for example
   `scripts/tests/integration/package/install-manifest.test.mjs`, which is
   direct coverage of the install-manifest contract that Tasks 7 and 14 both
   modify.

2. **`bin/cli.mjs` — the published `ai-task-manager` bin and the sole
   production writer of `.ai-task-manager/install-manifest.json` — is named by
   no task, while two tasks change the contract it writes.**

   `package.json:16` registers `"ai-task-manager": "bin/cli.mjs"`. That file is
   2073 lines and implements `install`, `uninstall`, `init`, `statusline`, and
   `version`. It imports `INSTALL_MANIFEST_PATH`, `createInstallContract`,
   `createInstallManifest`, and `normalizeInstallIntent` from
   `scripts/package/install-contract.mjs` (`bin/cli.mjs:56-61`) and
   `writeInstallManifest` from `scripts/package/install-manifest-store.mjs`
   (`bin/cli.mjs:62`), and it calls the publisher at `bin/cli.mjs:1589`. A
   repo-wide search for `writeInstallManifest` returns exactly one production
   call site: that one. `INSTALL_MANIFEST_PATH` is
   `'.ai-task-manager/install-manifest.json'`
   (`scripts/package/install-contract.mjs:9`), and `bin/cli.mjs` is also the
   current writer of `.ai-task-manager/` templates, configs, preferences, and
   memory seeds (`bin/cli.mjs:1365`, `1399`, `1504`, `1520`).

   Against that, Task 7 says "Extend: `scripts/package/install-contract.mjs`
   and `install-manifest-store.mjs` with the initial versioned
   runtime/admission contract", and Task 14 says "Extend:
   `scripts/package/install-contract.mjs`, `install-observer.mjs`, and
   `doctor.mjs`" and, under `Generate:`, lists
   `install-manifest.json` alongside `project.json`, `adapters.lock.json`, and
   `capabilities.lock.json`. So Task 14 declares it will generate a file whose
   only existing producer it does not mention, using a contract Task 7 has
   already versioned underneath that producer.

   The plan is meticulous about this everywhere else — Task 9 names
   `bin/aitm.mjs` and `bin/aitm-registry.mjs` explicitly, Task 12 names
   `bin/aitm-mcp.mjs`, Task 16 names `bin/aitm-adapter-conformance.mjs`. The
   omission of the one bin that already owns the setup surface reads as an
   oversight rather than a decision, and it leaves a real ambiguity a child
   plan cannot resolve on its own: does `src/setup/` replace `bin/cli.mjs`'s
   installer, does `bin/cli.mjs` become a thin transport over it, or do both
   write `.ai-task-manager/` concurrently? The third answer would stand the
   plan's own "exactly one writable binding" principle on its head at the
   configuration layer.

3. **Task 9's request-key rule and its "preserve existing CLI behavior" exit
   gate are in tension for unattended callers, and no task owns the
   reconciliation.**

   A Global Constraint states "Every mutating request carries a caller-held
   request key." Task 9 operationalizes it: "Require stable caller keys for
   unattended CLI and compatibility aliases; reject missing keys before
   effects. Interactive key generation displays the key before submission."
   The interactive half is settled — the kernel generates and shows the key.
   The unattended half is not. Every current scripted invocation and every
   agent-driven `/task` verb call is unattended and supplies no key, so
   "reject missing keys before effects" makes them fail.

   The same task's final step is "Prove existing CLI tests pass without MCP and
   without a privileged GitHub route into policy or evidence", and the last
   Global Constraint is "preserve the existing CLI behavior until the
   applicable phase exit gate passes." Both cannot hold simultaneously unless
   the plan says what happens to a key-less unattended invocation during
   migration — derived stable key, deprecation window with a warning, or hard
   refusal with a migration step. Task 10 previews the problem ("preview
   unattended callers needing keys") but previewing is not deciding, and Task
   13's skill edits are scoped to discover-first guidance, not to threading
   keys through `skill/adapters/*/SKILL.md` and the installed bootstrap
   templates. As written, the work of migrating unattended callers is
   identified but unowned.

4. **Nine of the twenty tasks create new test files without running any lint
   gate, and three of this repo's lint gates are fail-closed on new test
   files.**

   `npm run lint` (`package.json:51`) is a composite of eleven sub-gates. Three
   of them reject new test files outright:

   - `lint:story-tags` → `scripts/tests/tools/audit-story-tags.mjs`, which
     fails when any discovered test lacks a provenance header.
     `hasPermittedStoryTag` (`scripts/task-tracker/lib/story-tag-header.mjs:34`)
     requires `// @story #N` or `// @chore` as line 1, or as line 2 directly
     after a shebang. Every test file the plan creates will fail this until
     tagged with its allocated child issue number.
   - `lint:test-layout` → rejects any test outside
     `scripts/tests/<lane>/<subsystem>/`.
   - `lint:line-cap` → `scripts/tests/tools/audit-line-cap.mjs`, hard limit 800
     code lines per test file, soft advisory at 400. Several planned suites
     (the Task 7 recovery and admission suites, the Task 16 independent-plugin
     suite, the Task 9 conformance suite) enumerate enough adversarial cases to
     approach that.

   `npm run lint` and `npm run format:check` appear only in Tasks 2, 13, and 20
   and in the final block. Tasks 4, 5, 6, 7, 8, 9, 10, 14, 15, and 16 — which
   together create the large majority of the new files — run neither. The plan
   already encodes the correct intent in a Global Constraint ("New package
   tests use only `scripts/tests/unit/`, `integration/`, or `slow/` lanes with
   a subsystem directory and the allocated child story tag"); the verification
   blocks just do not enforce it, so the failure surfaces at a later task's
   gate as someone else's problem.

## Required changes

1. Add `npm run test:integration` to the `Final Program Verification` block
   (Finding 1). Alternatively, if the intent is a single full-union run, say so
   explicitly and use the `all` lane — but note that `--lane all` is documented
   in `scripts/run-tests.mjs:22` as an "INTERNAL union for the divergence
   guard" and is currently reachable only via `test:coverage`, so
   `npm run test:integration` is the lower-risk edit. Additionally, add
   `npm run test:integration` to the verification block of each gate-closing
   task that must not regress an earlier phase's integration suites — at
   minimum Task 10 (closes Gate B), Task 13 (closes Gate C), Task 16 (closes
   Gate D), and Task 20 (closes Gate E).

2. Name `bin/cli.mjs` in the `Files and Interfaces` section of Task 14, and
   state its disposition in one sentence — replaced by `src/setup/`, retained
   as a transport over the new setup services, or retained unchanged with
   `src/setup/` writing a disjoint file set (Finding 2). If Task 7's
   install-contract versioning changes anything `bin/cli.mjs` writes today, add
   `bin/cli.mjs` to Task 7's file list as well, and add
   `scripts/tests/integration/package/install-manifest.test.mjs` to the suites
   Task 7 and Task 14 must keep green.

3. Resolve the unattended request-key rule in Task 9 (Finding 3). Add one step
   that states the compatibility behavior for a key-less unattended invocation
   during migration, and assign ownership of updating the unattended callers —
   `skill/adapters/*/SKILL.md`, `skill/shared/router.md`, and the installed
   bootstrap templates already listed in Task 13 — to a named task.

4. Add `npm run lint` and `npm run format:check` to the verification blocks of
   every task that creates test files: Tasks 4, 5, 6, 7, 8, 9, 10, 14, 15, and
   16 (Finding 4). Tasks 1, 3, 11, 12, and 17–19 should be reviewed for the
   same reason; Task 11 in particular creates two new suites and runs no lint.

## Optional suggestions

1. Task 4 modifies `package.json`'s `files` allowlist to include the production
   `src/` closure, which is necessary — the current allowlist
   (`package.json:54-76`) ships `bin/`, `scripts/`, `config/`, `skill/`,
   `hooks/`, `statusline/`, and `templates/`, and has no `src/` entry.
   Consider also naming `.c8rc.json` there. Its `"src": ["scripts"]` with
   `"all": true` scopes coverage to `scripts/` only, so once production code
   moves to `src/` the entire kernel becomes invisible to
   `npm run test:coverage` while `all: true` keeps reporting the vacated
   `scripts/` modules at 0%. There is no coverage threshold or CI gate today,
   so this is not a release blocker — it is a one-line edit that avoids a
   silently meaningless coverage report for the rest of the program.

2. Consider adding a short note to Task 1 or the Global Constraints recording
   that `npm test` is the *unit* lane, not the full suite. Several task
   verification blocks pair an explicit `node --test <integration path>` with
   `npm test`, which reads as "targeted plus everything" but is actually
   "targeted plus unit." Making the lane semantics explicit once in this file
   would stop each of twenty child plans from re-deriving it, and would stop a
   child author from treating a green `npm test` as a full regression pass.

3. The reach-lint prose disagrees with its implementation, as recorded in the
   summary: both `scripts/maintenance/lint-test-coverage-reach.mjs` and its
   detector describe the rule as "must exercise code under `scripts/`", while
   `MJS_LITERAL_RE` accepts any non-test `.mjs` path literal. The plan is not
   affected, but since this program is the first thing to put production code
   outside `scripts/`, a child plan in Phase 1 could cheaply correct those two
   comments while it is in the area.

4. Task 3's `Files and Interfaces` creates `scripts/benchmarks/`, which does not
   exist yet. That is fine, but note the directory is not in the `files`
   allowlist and is not excluded from it either — `scripts/` is shipped
   wholesale with only `scripts/tests/**`, `scripts/maintenance/**`, and
   `**/*.test.mjs` excluded, so a new `scripts/benchmarks/` tree would be
   published to npm. Task 4 is already editing the allowlist; adding a
   `!scripts/benchmarks/**` exclusion there would keep the package lean.

## Decision

revisions-requested
