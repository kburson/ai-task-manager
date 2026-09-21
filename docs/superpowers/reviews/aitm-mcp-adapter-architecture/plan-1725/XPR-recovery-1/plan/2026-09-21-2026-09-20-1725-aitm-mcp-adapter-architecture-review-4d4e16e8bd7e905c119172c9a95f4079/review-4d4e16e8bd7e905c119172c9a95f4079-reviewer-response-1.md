<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-4d4e16e8bd7e905c119172c9a95f4079"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md"
artifact_commit: "a05579470712d256e0f7aecec0817037807d8517"
artifact_blob: "ec62580ea3faaf61cc71463b74092144cff6a505"
artifact_digest: "sha256:ebf579e3a1c3e93be3f1943476e29d0053b18cc8740db9eaf367409eb6b9955a"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:0e0f8389771c5123ad130dd7a15471450957c5c5c3759a9b415815f0a3ebaa1f"
  identity_source: "declared"
started_at: "2026-09-21T05:11:42.915Z"
submitted_at: "2026-09-21T05:16:48.419Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md`
(artifact blob `ec62580ea3faaf61cc71463b74092144cff6a505`) as an umbrella
hydration plan, against the governing specification
`docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md`,
against `docs/decisions/0001-test-tree-convention.md`, and against the current
repository state in this worktree.

Disclosure of method and its limits, so the record is honest about what this
turn is and is not:

- This is the `XPR-recovery-1` review of an artifact that was already reviewed
  under review `d5c4bf26202b8069b2dbde11e442be27`. The blob under review here is
  byte-identical to the blob that review recorded (`ec62580e…`), so the plan has
  not changed since. After forming my own findings 1, 4, and 5 below, I read
  that prior reviewer response — it is a tracked file in the worktree — to avoid
  reporting a recovery review as if it were first contact. Findings 2 and 3
  below independently restate defects that review also found; I verified each
  against the repository myself before restating it, and I say so per finding.
  Findings 1, 4, 5, and 6 include material that review did not raise.
- The Reviewer Git boundary forbids Git commands, so I could not verify the
  plan's `**Spec:**` pin to trunk commit `267b91b9218b59342a0d70e0859a0e38523a3923`,
  nor the frontmatter's `artifact_commit`. I verified the spec's *content* at its
  current path instead. The commit pin is unverified in this turn, not verified-good.
- I could not run `npm pack --dry-run` (Bash was declined for that command), so
  the packed-entry counts in finding 4 are read from the checked-in ceiling
  constant and its comment history, not measured live.

What I verified positively, and how:

- **Criterion coverage is complete and internally consistent.** The spec carries
  21 numbered criteria with 8 split into 8a–8d (spec lines 1704–1778). The plan's
  `Acceptance-to-Task Traceability` table enumerates rows 1–21 with 8a–8d split
  out plus a quota/retention envelope row. I took the union of the owning-task
  column: it is exactly Tasks 1–20, so no task is orphaned and no criterion is
  unowned. The plan's own first acceptance criterion is satisfied by the table it
  ships.
- **Phase and gate partitions are total and disjoint.** `Hydration and Execution
  Protocol` maps 1–3 → Phase 0, 4–10 → Phase 1, 11 → Phase 2, 12–13 → Phase 3,
  14–15 → Phase 4, 16 → Phase 5, 17–19 → Phase 6, 20 → Phase 7, matching the
  spec's `### Phase 0`–`### Phase 7` headings. Gates A–E partition 1–3 / 4–10 /
  11–13 / 14–16 / 17–20 with no overlap and no gap.
- **The SDK ordering hazard is resolved deliberately, not accidentally.** Task 16
  publishes the SDK in Phase 5, but Tasks 4, 8, and 9 need a shared ABI in Phase 1.
  Task 4 creates and ratifies it, Task 8 runs the built-in adapter through "the
  Task 4 shared ABI and conformance contract used by external adapters; there is
  no separate built-in contract", Task 16 extends rather than replaces it, and
  Task 2's prototype is explicitly fenced to "an isolated draft SDK contract
  fixture". No circularity.
- **Every existing path the plan says it will adapt exists on disk.** I checked
  `scripts/task-tracker/lib/evidence-v2/migration.mjs`,
  `scripts/task-tracker/lib/github-records/`,
  `scripts/task-tracker/lib/workflow-policy/`,
  `scripts/package/{install-contract,install-manifest-store,install-observer,doctor}.mjs`,
  their unit suites under `scripts/tests/unit/package/`,
  `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`,
  `bin/aitm.mjs`, `bin/aitm-registry.mjs`, and
  `docs/decisions/0002-github-native-authority-records.md`. `docs/decisions/`
  holds only 0001 and 0002, so Task 16's "next available number at delivery time"
  is unambiguous. `src/` does not exist yet, consistent with the plan creating it.
- **A lint gate I expected to break does not.** I expected `npm run lint:test-reach`
  to condemn every new kernel test, because `scripts/maintenance/lint-test-coverage-reach.mjs:4`
  and its detector both state the rule as "must exercise code under `scripts/`".
  The implementation is broader than its prose: `MJS_LITERAL_RE`
  (`scripts/maintenance/lint-test-coverage-reach-detector.mjs:43`) accepts any
  quoted non-test `.mjs` literal, so a `'../../../src/kernel/…mjs'` import counts
  as reach. The plan is safe. I record the negative check because the comments and
  the code disagree and the next reader may stop at the comments.

Assessment. The safety architecture of this plan is strong and I am not asking
for changes to it: Phase 0 as a hard approval gate with budgets agreed *before*
measurement (Task 1) and compared against *retained* thresholds (Task 3), serial
Gate B, the refusal to preassign child issue numbers, the repeated rule that a
skipped live suite never certifies, and Task 5's "never fabricate history or
replace a missing stream with a new genesis" are exactly proportionate to the
blast radius. My findings sit in one band: **this plan changes where production
code lives and what the package ships, and it does not update the three
repository contracts that govern those two things** — the lane the release gate
runs, the ADR that defines the test tree, and the packed-surface tripwire. For a
plan whose entire value proposition is gated, evidence-bearing delivery, a
program gate that can go green without running the lane that carries most of its
own new suites is a defect worth fixing before hydration.

Decision: revisions-requested. Every required change below is a local edit to
this file; none disturbs the task decomposition, the phase mapping, or the
traceability table.

## Findings

1. **The `Final Program Verification` block never runs the integration lane, and
   this contradicts ADR 0001 §6 as well as the plan's own traceability table.**

   `package.json:21` defines `"test": "node scripts/run-tests.mjs --lane fast"`.
   `scripts/run-tests-lanes.mjs:55` is explicit: "`fast` is unit-only. The
   integration lane is CI-only", and `laneFiles` (`:62-66`) returns
   `manifest.unit` for `fast`. `npm run test:slow` is the slow lane. The union is
   `--lane all`, reachable only through `test:coverage` and documented at
   `scripts/run-tests.mjs:22` as an "INTERNAL union for the divergence guard".
   `test:integration` exists (`package.json:23`) and the string does not appear
   anywhere in the plan.

   The `Final Program Verification` block runs `npm test`, `npm run test:slow`,
   `npm run lint`, `npm run format:check`, `npm audit --omit=dev`,
   `npm pack --dry-run`, and `git diff --check`. So the release gate for a 480-hour
   program executes the unit and slow lanes and skips integration entirely.

   That lane carries the bulk of this plan's new coverage — sixteen suites by my
   count, across `integration/kernel/` (evidence-append-recovery, retention,
   bootstrap, runtime-admission, governed-action-flow, recovery),
   `integration/conformance/` (local-git-adapter, github-adapter, github-quota),
   `integration/transports/` (cli-kernel-parity, cli-help, mcp-tools,
   mcp-resources), `integration/setup/` (guided-setup, configuration-activation,
   staleness-recovery), and `integration/host-bridges/mcp-bootstrap`. The
   traceability table names an integration suite as required verification for
   criteria 1, 2, 3, 4, 5, 6, 7, 8a, 8b, 8c, 8d, 9, 10, 12, 15, 16, 17, 19, 21,
   and the envelope row.

   Each task does run its own new integration files by explicit `node --test`, so
   the gap is not "never run once." The gap is regression coverage at every later
   gate. This plan is built around late phases editing early-phase contracts —
   Task 14 extends Task 7's admission contract, Task 16 extends Task 4's ABI and
   Task 7's loader, Task 20 rewires the guards Task 9 preserved — which is exactly
   the shape of program where an unrun integration lane hides a break.

   It also drops existing coverage of the modules these tasks edit:
   `scripts/tests/integration/package/install-manifest.test.mjs`,
   `install-health.test.mjs`, and `doctor-cli.test.mjs` all exist today and all
   cover surfaces Tasks 7 and 14 modify.

   Independent of the plan, ADR 0001 §6 already states the governing rule: "A new
   committed implementation always receives one complete unit, integration, and
   slow Test pass." The plan's final gate does not satisfy the repository's own
   accepted decision.

2. **`bin/cli.mjs` — the published `ai-task-manager` bin and the only production
   writer of `.ai-task-manager/install-manifest.json` — is named by no task,
   while two tasks change the contract it writes.** (Independently verified here;
   also raised by review `d5c4bf26`.)

   `package.json:16` registers `"ai-task-manager": "bin/cli.mjs"`. A repo-wide
   search for `writeInstallManifest` outside `scripts/tests/` returns its
   definition (`scripts/package/install-manifest-store.mjs:7`) and exactly one
   production call site: `bin/cli.mjs:1589`. `bin/cli.mjs` also imports
   `INSTALL_MANIFEST_PATH` (`:57`, used at `:1286`), which resolves to
   `.ai-task-manager/install-manifest.json` (`scripts/package/install-contract.mjs:9`).

   Against that, Task 7 extends `install-contract.mjs` and
   `install-manifest-store.mjs` "with the initial versioned runtime/admission
   contract", and Task 14 extends `install-contract.mjs`, `install-observer.mjs`,
   and `doctor.mjs` and lists `install-manifest.json` under `Generate:`. Task 14
   therefore declares it will generate a file whose sole existing producer it
   never mentions, on a contract Task 7 has already re-versioned underneath that
   producer.

   The plan is meticulous elsewhere — Task 9 names `bin/aitm.mjs` and
   `bin/aitm-registry.mjs`, Task 12 names `bin/aitm-mcp.mjs`, Task 16 names
   `bin/aitm-adapter-conformance.mjs`. The omission of the one bin that already
   owns the setup surface reads as oversight, and it leaves an ambiguity a child
   plan cannot resolve alone: does `src/setup/` replace the `bin/cli.mjs`
   installer, does `bin/cli.mjs` become a thin transport over it, or do both write
   `.ai-task-manager/`? The third answer inverts this plan's own "exactly one
   writable binding" principle at the configuration layer.

3. **Ten tasks create new test files and run no lint gate, and this repository's
   lint composite is fail-closed on new test files.** (Independently verified
   here; also raised by review `d5c4bf26`.)

   `npm run lint` (`package.json:51`) chains eleven sub-gates. Three reject new
   test files outright:

   - `lint:story-tags` — `hasPermittedStoryTag`
     (`scripts/task-tracker/lib/story-tag-header.mjs:34-44`) requires `// @story #N`
     or `// @chore` as line 1, or line 2 directly after a shebang, with only a
     bounded cspell preamble allowed to follow. Every file the plan creates fails
     until tagged with its allocated child issue number.
   - `lint:test-layout` — `scripts/tests/tools/audit-test-layout.mjs:20-23` rejects
     any test outside `scripts/tests/<lane>/<subsystem>/`.
   - `lint:line-cap` — ADR 0001 §4 sets a hard 800 code-line cap and a 400-line
     soft target. Several planned suites (Task 7's recovery and admission suites,
     Task 9's conformance suite, Task 16's independent-plugin suite) enumerate
     enough adversarial cases to reach that.

   `npm run lint` and `npm run format:check` appear only in Tasks 2, 13, and 20
   and the final block. Tasks 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, and 16 — which
   create the large majority of new files — run neither, so a violation surfaces
   at a later task's gate as someone else's problem. The plan already carries the
   right intent in a Global Constraint ("New package tests use only
   `scripts/tests/unit/`, `integration/`, or `slow/` lanes with a subsystem
   directory and the allocated child story tag"); only the verification blocks
   fail to enforce it.

4. **Moving production code to `src/` requires an amendment to ADR 0001, which
   the plan does not schedule — and ADR 0001 says so itself.**

   ADR 0001 §2 defines the canonical test path as
   `scripts/tests/<lane>/<source-relative-subtree>/` and fixes the mapping: "for a
   test named `<module>.test.mjs`, its subsystem subdirectory is the directory of
   the source `<module>.mjs` **relative to `scripts/`**", then enumerates the
   permitted subsystem set (`lib/`, `verbs/`, `gh/`, `states/`, `hooks/`,
   `maintenance/`, `tools/`, `migrate/lib/`, plus the `core`/`meta`/`fixtures`
   buckets). The plan introduces `kernel/`, `adapter-sdk/`, `transports/`,
   `conformance/`, `setup/`, `host-bridges/`, `feasibility/`, and `package/`
   subsystems that mirror `src/`, for which that mapping rule is undefined.

   ADR 0001 §1 anticipates exactly this move and forecloses doing it silently:
   "There is one npm deliverable and therefore no provider or domain-root
   exception. If a subtree becomes a separately published package later, its test
   boundary requires **a new decision rather than an implicit directory
   exception**." Task 16 creates a replacement ADR for 0002 only; no task in the
   plan amends or supersedes 0001.

   This is not a style objection. `parseCanonicalTestPath` enforces the shape only
   structurally, so the planned paths will pass `lint:test-layout` today — which
   is precisely why the documented convention will drift out of agreement with
   the enforced one across a 20-task program unless the plan schedules the
   amendment. The repository's own decision record is the thing that tells the
   twenty child authors where their tests go.

5. **Task 16's reference fixture lives in a directory that ADR 0001 declares
   unpublishable, and the existing package-boundary guard rejects it by path,
   not just by extension.**

   Task 16 creates "the independently installable reference fixture at
   `scripts/tests/fixtures/adapters/reference/`, including `package.json`,
   `aitm-adapter.json`, and the tracked runtime `dist/adapter.mjs`", extends
   "`package.json` exports, bins, and packed-file contract for the conformance
   runner **and its runtime fixtures**", and extends `kernel-consumer.test.mjs`
   to "prove all required fixtures are shipped".

   ADR 0001 §2 classifies `scripts/tests/{fixtures,helpers,tools}/` as
   "Package-level test support … **never test lanes or npm package content**",
   and its Consequences repeat that those directories are "excluded from the
   published npm package with an explicit `!scripts/tests/**` rule". The guard is
   real and stricter than the extension filter:
   `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs:158-166` fails
   on any packed path matching `/(^|\/)tests?\//`, so a shipped
   `scripts/tests/fixtures/adapters/reference/dist/adapter.mjs` fails that
   assertion even though it is not a `*.test.mjs`.

   The plan does distinguish "This consumer fixture is distinct from the public
   runner fixtures under `src/adapter-sdk/fixtures/`", which supports the reading
   that only the `src/` fixtures ship. But "prove all required fixtures are
   shipped" sits in the same task as the `scripts/tests/fixtures/` consumer
   fixture, and a child author can land on either reading. One of them fails a
   guard on contact.

6. **The plan's own acceptance criterion asserts orchestrator-only rejection by
   "all public dispatchers", but only the MCP dispatcher has a named verification.**

   The plan's `Acceptance Criteria` reads: "Every agent-callable registry action
   has a tested MCP route, and **every orchestrator-only primitive is rejected by
   all public dispatchers**." This is deliberately stronger than spec criterion 5,
   which scopes the prohibition to the MCP routes ("orchestrator-only actions
   cannot use those routes").

   Task 4 classifies each operation as portable, namespaced extension, or
   `orchestrator-only`. Task 11 makes `orchestrator-only` a closed availability
   status. Task 12 rejects them at MCP. Task 5 keeps evidence append "unavailable
   through generic public invocation". No task step requires the CLI transport —
   which Task 9 makes a public dispatcher over the same services — to refuse an
   orchestrator-only action, and traceability row 5 names only
   `unit/kernel/action-inventory`, `unit/kernel/discovery`,
   `integration/transports/mcp-tools`, and `slow/transports/cli-mcp-parity`. The
   CLI-side refusal is plausible-by-construction from the shared dispatcher, but
   plausible-by-construction is the thing this plan otherwise refuses to accept
   as evidence.

## Required changes

1. Add `npm run test:integration` to the `Final Program Verification` block, and
   to the verification block of each gate-closing task that must not regress an
   earlier phase's integration suites — at minimum Task 10 (closes Gate B),
   Task 13 (Gate C), Task 16 (Gate D), and Task 20 (Gate E). If the intent is one
   full-union run, say so explicitly, but prefer `test:integration` over
   `--lane all`: `all` is documented as an internal divergence-guard union and is
   exposed today only through `test:coverage`. Reference ADR 0001 §6 in the edit
   so the obligation is traceable (Finding 1).

2. Name `bin/cli.mjs` in Task 14's `Files and Interfaces` and state its
   disposition in one sentence — replaced by `src/setup/`, retained as a transport
   over the new setup services, or retained with `src/setup/` writing a disjoint
   file set. If Task 7's install-contract versioning changes anything
   `bin/cli.mjs` writes today, add `bin/cli.mjs` to Task 7's file list too, and
   name `scripts/tests/integration/package/install-manifest.test.mjs` (and
   `install-health.test.mjs`) as suites Tasks 7 and 14 must keep green
   (Finding 2).

3. Add `npm run lint` and `npm run format:check` to the verification blocks of
   every task that creates test files: Tasks 4, 5, 6, 7, 8, 9, 10, 11, 14, 15,
   and 16 (Finding 3).

4. Schedule the ADR 0001 amendment. Add it to Task 4 (the task that first creates
   `src/` and first edits the packaging contract) as a named deliverable under
   `Files and Interfaces`, covering: the source-relative mapping for `src/`
   modules, the permitted subsystem set for each lane, and whether `scripts/`
   remains a source root. ADR 0001 §1 requires "a new decision rather than an
   implicit directory exception"; this plan is the thing that triggers it
   (Finding 4).

5. Resolve the Task 16 fixture-shipping ambiguity in one sentence: either state
   that the `scripts/tests/fixtures/adapters/reference/` consumer fixture is
   local-only and never packed (and that "required fixtures are shipped" refers
   solely to `src/adapter-sdk/fixtures/`), or relocate the reference fixture
   outside `scripts/tests/` and amend ADR 0001's support-directory rule alongside
   change 4. Either way, name
   `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` in Task 16's
   file list — its `/(^|\/)tests?\//` assertion is the gate that decides this
   (Finding 5).

6. Give the "rejected by all public dispatchers" claim a named owner and a named
   suite: add a step to Task 9 or Task 11 requiring the CLI dispatcher to refuse
   `orchestrator-only` actions, and add `integration/transports/cli-kernel-parity.test.mjs`
   (or a named CLI-help/discovery suite) to traceability row 5. Alternatively,
   weaken the plan's acceptance criterion to match spec criterion 5's MCP scope —
   but do not leave the stronger claim unverified (Finding 6).

7. Account for the packed-surface ceiling. `package-boundary.test.mjs:141`
   pins `ENTRY_CEILING = 788`, plus seven named per-issue allowances totalling 10
   (`:224-245`), for an effective ceiling of 798 — and its comment history shows
   every prior raise was an explicit, justified, per-issue review decision. Task 4
   adds "the production `src/` closure" to the `files` allowlist, and Tasks 5–16
   add to it continuously; the packed surface will cross that tripwire mid-program.
   Task 4 already says it extends `package-boundary.test.mjs`, so state there how
   the program budgets the ceiling: a single reviewed program-level allowance, or
   a per-task allowance in the established style. Leaving it implicit will surface
   as an unexplained red test in whichever child happens to cross the line. (I
   could not measure the current packed count in this session — see the summary's
   method note.)

## Optional suggestions

1. Name `.c8rc.json` in Task 4 alongside the `files` allowlist edit. Its
   `"src": ["scripts"]` with `"all": true` scopes coverage to `scripts/`, so once
   production code moves to `src/` the entire kernel is invisible to
   `npm run test:coverage` while `all: true` keeps reporting the vacated
   `scripts/` modules at 0%. There is no coverage threshold or CI gate today, so
   this is not a blocker — it is a one-line edit that keeps the coverage report
   meaningful for the remaining nineteen tasks.

2. Record once, in `Global Constraints`, that `npm test` is the *unit* lane and
   not the full suite. Several task blocks pair an explicit
   `node --test <integration path>` with `npm test`, which reads as "targeted plus
   everything" and is actually "targeted plus unit." Stating it once here stops
   twenty child authors from re-deriving it, and stops one of them from treating a
   green `npm test` as a full regression pass.

3. Task 3 creates `scripts/benchmarks/`, which does not exist yet. The `files`
   allowlist ships `scripts/` wholesale with only `scripts/tests/**`,
   `scripts/maintenance/**`, and `**/*.test.mjs` excluded, so the new benchmark
   tree would publish to npm and consume ceiling headroom (Finding 7's budget).
   Task 4 is already editing the allowlist; a `!scripts/benchmarks/**` exclusion
   belongs in the same edit.

4. Consider aligning the spec filename with the plan's own child-naming rule. The
   plan requires each child to use `YYYY-MM-DD-<child-id>-…`, and recent specs in
   this repository follow it (`2026-09-19-1720-plan-transition-authority-design.md`,
   `2026-09-18-1689-aitm-doctor-bootstrap-health-design.md`), but the governing
   spec is `2026-09-20-aitm-mcp-adapter-architecture-design.md` with no `1725`.
   Renaming is out of this plan's scope; a one-line note recording the exception
   would stop a child author from reading it as the pattern to copy.

5. `scripts/maintenance/lint-test-coverage-reach.mjs:4` and its detector both
   describe the reach rule as "must exercise code under `scripts/`", while the
   implementation accepts any non-test `.mjs` literal. The plan is unaffected (see
   the summary), but this program is the first thing to put production code
   outside `scripts/`, so a Phase 1 child could correct those two comments while
   it is in the area.

## Decision

revisions-requested
