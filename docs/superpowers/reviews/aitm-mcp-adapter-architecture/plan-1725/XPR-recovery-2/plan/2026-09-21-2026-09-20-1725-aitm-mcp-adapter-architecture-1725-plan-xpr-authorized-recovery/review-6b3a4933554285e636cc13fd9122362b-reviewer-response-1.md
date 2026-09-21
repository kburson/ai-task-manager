<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-6b3a4933554285e636cc13fd9122362b"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md"
artifact_commit: "7f0f3193f2b66ed5d8e71a01961e300445efe047"
artifact_blob: "fe041541ac96ced0d9efb2ef8c1328192e59000b"
artifact_digest: "sha256:085fe0853bba0b768743d1a755e660da1aae5bed2df433cda594a2acb05249a4"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:fa6e722768770df083577a8f479f19eba98629e6a80a66a1b518833a80cecd95"
  identity_source: "declared"
started_at: "2026-09-21T10:11:04.769Z"
submitted_at: "2026-09-21T14:26:46.856Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md`
at artifact commit `7f0f3193f2b66ed5d8e71a01961e300445efe047`
(digest `sha256:085fe0853bba0b768743d1a755e660da1aae5bed2df433cda594a2acb05249a4`),
together with the latest author response,
`XPR-recovery-1/.../review-4d4e16e8bd7e905c119172c9a95f4079-author-response-1.md`,
which dispositions the seven required changes and five optional suggestions
recorded in the preserved original reviewer response
(`XPR/.../review-d5c4bf26202b8069b2dbde11e442be27-reviewer-response-1.md`).

This is a recovery round. The prior round's reviewer turn 2 was never written —
`XPR-recovery-1/.../reviewer-response-2.md` still carries the unedited template
body and a null `submitted_at`. So no reviewer has yet verified the author's
turn-1 dispositions. That verification is the first half of this review; the
second half is an independent pass over the revised artifact.

### Part 1 — verification of the author's dispositions

I confirmed each disposition against the artifact rather than against the
response prose. All seven required changes are present:

- **RC1 (integration lane).** `npm run test:integration` now appears in the
  `Final Program Verification` block and in the verification blocks of the four
  gate-closing tasks: Task 10 (closes Gate B), Task 13 (Gate C), Task 16
  (Gate D), Task 20 (Gate E). The author correctly chose `test:integration`
  over the internal `all` lane.
- **RC2 (`bin/cli.mjs`).** Task 7 now carries `Adapt: bin/cli.mjs, the existing
  install-manifest producer, to the versioned contract without a second
  independent writer`, and Task 14 names it with an explicit disposition —
  retained as a compatibility transport over the shared `src/setup/` services,
  with only the shared service publishing manifests. Both tasks name and run
  `install-manifest.test.mjs`, `install-health.test.mjs`, and
  `doctor-cli.test.mjs`. This resolves the "two concurrent writers of
  `.ai-task-manager/`" ambiguity in the direction consistent with the plan's own
  one-writable-binding principle.
- **RC3 (per-child quality gates).** `npm run lint` and `npm run format:check`
  are now present in Tasks 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  and 20 — every in-repository code-producing task. The Global Constraints carry
  the lane restriction, story tag, 800-line hard cap, and 400-line review target.
- **RC4 (ADR 0001 mapping).** Task 4 owns the production amendment; Task 1 owns
  the narrower `src/feasibility/` mapping ahead of Task 2, which closes the
  ordering gap the author identified. The scope clarification is correct: `src/`
  is part of the same npm deliverable, so ADR 0001 §2's separately-published
  clause is not what is triggered; §2's source-relative taxonomy is.
- **RC5 (fixture packaging).** Task 16 now distinguishes the public runtime
  fixtures under `src/adapter-sdk/fixtures/` from the local-only consumer
  fixture under `scripts/tests/fixtures/adapters/reference/`, states the latter
  is never in the core tarball, and preserves the path-based prohibition in
  `package-boundary.test.mjs` rather than weakening it.
- **RC6 (public CLI refusal).** Task 9 now requires
  `cli-kernel-parity.test.mjs` to assert zero provider effects and zero protocol
  writes on refusal of `orchestrator-only` primitives, forged action names, and
  direct evidence-append requests. Traceability row 5 names that suite.
- **RC7 (packed-surface ceiling).** Task 4 now carries the per-child allowance
  obligation, the before/after inventory requirement, the allocated-issue-ID
  record, the prohibition on blanket headroom, and the instruction to remeasure
  per child rather than treating 798 as permanent.

I independently re-derived the ceiling arithmetic from
`scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`:
`ENTRY_CEILING = 788` (line 141) plus the seven named allowances at lines
224–236 (`1 + 2 + 2 + 2 + 1 + 1 + 1 = 9`) gives an effective ceiling of exactly
**798** (lines 237–245). That matches the author's reported figure and confirms
the plan's "798 against an effective ceiling of 798" statement is arithmetically
sound. I could not re-run `npm pack --dry-run --json` in this session to confirm
the *current* entry count is likewise 798 — the command was refused by the
session's permission mode — so I accept the author's measurement on that half.
Finding 3 below does not depend on the exact count; it holds under any count at
or near the ceiling.

All five optional suggestions are incorporated: `.c8rc.json` in Task 4,
unit-only `npm test` semantics in the Global Constraints, `scripts/benchmarks/**`
exclusion in Task 4's package edit, the spec-filename provenance note in the
`Spec` header, and both reach-lint source files named for description alignment.
I confirmed `docs/decisions/0001-test-tree-convention.md` §6 (lines 205–207)
does say what the new Global Constraint attributes to it — "committed
implementation always receives one complete unit, integration, and slow Test
pass. Develop finalization owns full lint and format; Test owns the complete
lanes; Review validates Test evidence without repeating either set." The
constraint is a faithful citation, not a restatement.

The author's self-correction on the unattended request-key gap (preserved
Finding 3 of the original review) is also present and is better than what was
asked for: Task 9 owns caller/key plumbing in `skill/adapters/*/SKILL.md`,
`skill/shared/router.md`, installed bootstrap templates, and inventoried
automation entry points; states the pre-cutover legacy route keeps existing
behavior while the activated kernel deliberately refuses a key-less unattended
call; forbids weakening the refusal to make old key-less tests green; and Task
10 blocks activation until identified unattended writers are migrated or
verifiably stopped, with "preview alone cannot satisfy this gate." That last
clause closes exactly the previewing-is-not-deciding objection.

### Part 2 — independent pass on the revised artifact

Four new findings, all of which survived verification against the repository and
the governing specification. Three are in the same band as the prior round —
verification blocks that do not execute what the plan's own prose obligates —
and one is a sequencing defect in the delivery gates that the specification does
not require and that the plan's estimate explicitly excludes.

The architecture itself continues to hold up. I re-checked the SDK ordering
resolution (Task 4 creates and ratifies the ABI; Task 8 runs the built-in
adapter through the same contract; Task 16 extends and publishes it; Task 2's
prototype is explicitly fenced from establishing the production ABI) and found
no circularity. The Phase 0 discipline — budgets agreed before measurement,
compared against retained thresholds, with "any budget revision returns for
explicit feasibility review" — remains the right shape for work of this blast
radius. My findings do not touch the decomposition, the phase mapping, or the
traceability table.

Decision: revisions-requested. Findings 1–4 below are required. Each is a local
edit; none requires re-deriving the task breakdown.

## Findings

1. **Gate E blocks the core Full-Auto cutover (Task 20) behind three external
   provider projects (Tasks 17–19) that the plan's own scope and estimate
   exclude. The governing specification does not impose that dependency.**

   The plan states `**Gate E — provider and assurance rollout:** Tasks 17–20
   complete before MCP replaces the legacy Full-Auto entry path.` The
   `Hydration and Execution Protocol` reinforces the ordering: phase mapping
   assigns Tasks 17–19 to Phase 6 and Task 20 to Phase 7, and later-phase
   children "remain blocked on the preceding delivery gate."

   Read together, core MCP Full-Auto cannot activate until the GitLab,
   Bitbucket, and Jira adapters have each been separately specified, built,
   conformance-certified, live-certified, and published. Those are three
   independently governed projects in three separate repositories. The plan's
   own `Plan Metadata` says the 480-hour estimate is "across the core program,
   **excluding** separately funded GitLab, Bitbucket, and Jira plugin
   implementation," and a Global Constraint says those adapters "are separately
   published projects. Their implementation is not folded into the core
   package." So the plan simultaneously excludes this work from its scope and
   funding and makes its final core capability hostage to it.

   Nothing in Task 20 needs those adapters. Its `Files and Interfaces` are
   `src/host-bridges/mutation-policy.mjs`, `assurance.mjs`, host-specific bridge
   modules, the adapted bash/source-edit/provider guards, and
   `scripts/tests/slow/host-bridges/assurance.test.mjs` — all core. Its steps
   classify strict/guarded/behavioral assurance, generate policies from
   *selected* adapter manifests, and refuse Full-Auto under behavioral
   assurance. A GitHub-only installation exercises every one of those paths.
   Traceability rows 12, 18, and 21 pair Task 20 exclusively with core suites;
   no row requires an external provider suite to certify Task 20.

   The specification does not create this dependency either. Spec lines
   1641–1643 say "Only after this exit gate does the MCP path replace the legacy
   Full-Auto entry path," where "this exit gate" is Phase 7's own. The spec's
   Phase 6 section (lines 1626–1630) describes the provider plugins as
   independently released against the shared conformance suite and states no
   prerequisite relationship to Phase 7. The blocking relation is introduced by
   the plan's gate grouping, not inherited from the spec.

   The practical consequence is that the program's most safety-relevant
   capability — enforcing and truthfully reporting the actual mutation boundary
   under which unattended runs execute — is the one deliverable gated on
   third-party funding. If the external projects slip or are never funded, the
   plan as written says Full-Auto stays on the legacy entry path indefinitely,
   even though Task 16 has already published the SDK and Task 20's work is
   complete and certified.

2. **Tasks 12 and 15 add shipped runtime files but run neither `npm test` nor
   the package-boundary gate, contradicting the obligation Task 4 places on
   them by name.**

   Task 4's new allowance step says: "Every later child adding shipped files,
   including Tasks 5–16 and 20, inherits this obligation and runs the
   package-boundary gate." The gate is
   `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` — a unit-lane
   test, reachable through `npm test` (`package.json:21`,
   `"test": "node scripts/run-tests.mjs --lane fast"`) or by explicit
   `node --test`.

   Task 12's verification block runs `node --test` on three transport suites,
   `npm audit --omit=dev`, `npm pack --dry-run`, `npm run lint`, and
   `npm run format:check`. It runs neither `npm test` nor the package-boundary
   file directly. Task 15's block runs `node --test` on two suites,
   `npm pack --dry-run`, `npm run lint`, and `npm run format:check` — same
   omission.

   `npm pack --dry-run` is not a substitute. It prints the tarball contents; it
   asserts nothing. The ceiling assertion, the no-packed-tests assertion, the
   excluded-directories assertion, and the exact-`docs/introduction/` assertion
   all live inside the test file, not in the pack output.

   Both tasks do add shipped surface. Task 12 creates `bin/aitm-mcp.mjs` and
   registers the `aitm-mcp` bin; `bin/` ships wholesale (`package.json:58`). It
   also creates `src/transports/mcp/server.mjs`, `tools.mjs`, `resources.mjs`,
   and `structured-result.mjs`, which are inside the production `src/` closure
   Task 4 adds to the allowlist. Task 15 creates
   `src/host-bridges/learning-projection.mjs` and extends
   `src/host-bridges/registration.mjs`. With zero measured headroom at the
   ceiling, each of these children trips the gate — and neither will observe it.
   The failure surfaces at the next task that does run `npm test`, as someone
   else's problem, which is the exact pattern the prior round's Finding 4
   identified.

   Task 12 is the more consequential of the two, because it is also the task
   that modifies `package.json` and `package-lock.json` for the pinned MCP
   runtime dependency. A task that edits the package manifest and adds a bin is
   precisely the one that should run the package-boundary guard.

   For contrast, every other shipped-surface task in the Task 4 list does run
   `npm test`: Tasks 5, 6, 7, 8, 9, 10, 11, 13, 14, 16, and 20. Tasks 12 and 15
   are the only two exceptions, which reads as an oversight rather than a
   decision.

3. **Task 3 creates a shipped `scripts/benchmarks/` tree one task before Task 4
   adds the exclusion, and Task 3 is outside the inheritance list that would
   require it to measure the impact.**

   Task 3's `Files and Interfaces` creates
   `scripts/benchmarks/mcp-architecture-operating-envelope.mjs`. The `files`
   allowlist ships `scripts/` wholesale (`package.json:62`) with only three
   negations — `!scripts/tests/**`, `!scripts/maintenance/**`, and
   `!**/*.test.mjs` (`package.json:63-65`). A new `scripts/benchmarks/` tree
   matches none of them, so it is packed.

   The exclusion the author added in response to optional suggestion 3 lives in
   Task 4: "Modify: `package.json` public exports and `files` allowlist;
   include the production `src/` closure and exclude test-only material,
   `scripts/benchmarks/**`, and `src/feasibility/**`." Task 4 runs after Task 3.
   Between them, the benchmark file is shipped surface against a ceiling the
   author measured at zero headroom.

   Task 3's verification block is `node --test` on the certification suite, the
   benchmark's own `--verify-report` invocation, `npm run lint`, and
   `npm run format:check`. No `npm test`, so no package-boundary run. And
   Task 4's inheritance clause names "Tasks 5–16 and 20" — Task 3 is not in that
   set, so no obligation reaches it from either direction.

   The publication risk here is nil, since no release occurs mid-program. The
   real cost is the handoff: Task 3 delivers green, Task 4 inherits a ceiling
   failure it did not cause and must diagnose before it can start its own
   package work. That is avoidable for the price of moving one negation earlier.

   Note this interacts with Finding 2 — Task 2 has the same shape but is
   genuinely safe, because `src/feasibility/` is excluded by the same Task 4
   edit and Task 2 ships nothing under `scripts/`. The asymmetry is only that
   Task 3 writes into an already-shipped directory.

4. **ADR 0001 §5 still says unit and integration form the fast lane. The author
   identified this as stale and stated Task 4 could correct it, but the artifact
   does not say so — the commitment lives only in the review response.**

   `docs/decisions/0001-test-tree-convention.md:191-192` reads "Unit and
   integration tests form the fast lane. Slow tests run separately with
   `npm run test:slow`." The executable behavior disagrees: `package.json:21`
   maps `npm test` to `--lane fast`, and `scripts/run-tests.mjs:19` documents
   `--lane fast (default) — unit only`. The integration lane has its own script
   (`package.json:23`).

   The author's response is explicit about this: "This intentionally does not
   adopt the stale sentence in ADR 0001 §5 that says unit and integration form
   the fast lane. The current runner and scripts are the executable evidence;
   Task 4's source/test decision work can align the surrounding decision text
   without changing lane semantics." I agree with that reasoning entirely. The
   problem is that Task 4's ADR step in the artifact says nothing about it. Its
   text is scoped to source-relative mappings, feature buckets, preserved
   `scripts/` mappings, support exclusions, fail-closed discovery, and
   cross-root ownership. A child author executing Task 4 has no instruction to
   touch §5.

   A disposition that exists only in a review response has no durable force.
   Twenty child plans will be written against the plan and the ADR, not against
   this review thread. The plan's Global Constraints now state the correct
   unit-only semantics, so a child reading the plan gets the right answer and a
   child reading ADR 0001 §5 gets the wrong one — and §5 is the document that
   governs the test tree. Task 4 is already opening that exact file under
   review, so the correction costs one clause and zero additional review surface.

## Required changes

1. Resolve the Gate E coupling (Finding 1). Either split Gate E so that Task 20
   is gated on Gates A–D and its own certification rather than on Tasks 17–19 —
   e.g. "Gate E — assurance rollout: Task 20 completes before MCP replaces the
   legacy Full-Auto entry path; Tasks 17–19 are independently governed external
   deliveries gated on Gate D and not on each other" — or, if the dependency is
   deliberate, state the reason explicitly and reconcile it with the
   `Plan Metadata` estimate exclusion and the Global Constraint that those
   adapters are not folded into the core package. Whichever way it resolves,
   also make the `Hydration and Execution Protocol` phase-blocking sentence
   ("Later phase children ... remain blocked on the preceding delivery gate")
   consistent with the chosen answer, since that sentence is what makes Phase 7
   wait on Phase 6.

2. Add `npm test` to the verification blocks of Task 12 and Task 15
   (Finding 2). If the intent is the narrower check, add
   `node --test scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`
   instead — but `npm test` is the lower-risk edit and matches the eleven other
   shipped-surface tasks. Task 12 in particular should also be listed among the
   tasks that record a before/after pack inventory, since it adds a bin and
   edits `package.json` and `package-lock.json`.

3. Move the `!scripts/benchmarks/**` exclusion from Task 4 into Task 3, so the
   directory is excluded in the same child that creates it (Finding 3).
   Alternatively, extend Task 4's inheritance clause to read "Tasks 3 and 5–16
   and 20" and add `npm test` to Task 3's verification block. The first option
   is cleaner: it keeps each child responsible for its own package surface and
   removes a cross-task ordering dependency rather than documenting one.

4. Add the ADR 0001 §5 lane-semantics correction to Task 4's ADR amendment step
   (Finding 4). One clause is sufficient — for example, appending to the
   existing step: "and correct §5's stale 'unit and integration tests form the
   fast lane' sentence to match the executable lane selector, without changing
   lane semantics." This is the disposition the author already chose; it just
   needs to live in the artifact.

## Optional suggestions

1. Task 1 produces two new Markdown documents and an ADR amendment, and its
   verification block runs an `rg` inventory plus `npm test`. Neither detects a
   Markdown lint failure, a spell-check failure, a broken doc anchor, or
   unformatted Markdown in the documents it delivers — `lint:md`, `lint:spell`,
   `lint:doc-anchors`, and `format:check` all apply to new Markdown
   (`package.json:38,41,42,50`). The Global Constraint requiring lint and format
   is scoped to "every in-repository **implementation** child," which arguably
   exempts a specification child. Consider adding `npm run lint` and
   `npm run format:check` to Task 1 anyway, or widening that constraint to cover
   document-producing children. The same reasoning applies to the `npm test` in
   Task 1's block, which exercises nothing Task 1 changes and could be dropped
   in favor of the lint gates.

2. Task 20's verification block orders its commands `npm test`,
   `npm run test:slow`, `npm run lint`, `npm run format:check`,
   `npm run test:integration` — integration trails after the lint gates, unlike
   Tasks 10, 13, and 16, which group the three lanes together. Purely cosmetic,
   but a child author copying this block as a template will propagate the odd
   ordering.

3. The plan records "Baseline currently has 798 entries against an effective
   ceiling of 798, measured during XPR." Consider also recording *where* that
   measurement is retained, or the exact command used
   (`npm pack --dry-run --json` parsed with the repository's
   `parseNpmPackReport`). A bare number in a plan ages badly; a named command
   lets each child reproduce it, which is what Task 4's "remeasure at each
   child" instruction actually requires.

4. Consider whether Tasks 17–19's verification blocks should name a
   package-boundary-equivalent gate. The Global Constraints delegate quality
   gates to those external plans, which is right, but the three blocks currently
   show `npm pack --dry-run` without any assertion over its output — the same
   non-assertion noted in Finding 2. A one-line note that external plans must
   define an assertion over their packed surface, not merely print it, would
   close the pattern consistently.

## Decision

revisions-requested
