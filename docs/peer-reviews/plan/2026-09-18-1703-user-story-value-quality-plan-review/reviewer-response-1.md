---
schema: 'manual-peer-review.response/v1'
review_id: 'plan-review-1703-user-story-value-quality'
role: 'reviewer'
turn: 1
orchestration: 'manual (ai-peer-review package uninstalled on trunk; no tool-certified authority assurance)'
authority_assurance: 'unavailable'
artifact_path: 'docs/superpowers/plans/2026-09-18-1703-user-story-value-quality.md'
artifact_state: 'untracked working-tree file'
artifact_digest: 'sha256:f66e7ce33a9f447fc5c065b43996b12727c5f9a579541a3e4c0109b9c2c04719'
spec_path: 'docs/superpowers/specs/2026-09-18-1703-user-story-value-quality-design.md'
spec_digest: 'sha256:10a055950643330cc9609dc387efe0e03e416c6a7320f0208f1a87a9755a930a'
repo_head_at_review: 'cbd39fd3bc36e8d2937c7a0785c12086e043c443'
plan_claimed_baseline: '846d459fd2e8d9e9eb2df94d58a886b6a294f5ae'
agent:
  host: 'claude-code'
  provider: 'anthropic'
  model_id: 'claude-opus-5'
  model_display: 'Claude Opus 5'
findings_required: ['R1-F001', 'R1-F002', 'R1-F003', 'R1-F004', 'R1-F005', 'R1-F006', 'R1-F007']
findings_optional: ['R1-S001', 'R1-S002', 'R1-S003', 'R1-S004', 'R1-S005', 'R1-S006']
---

# Reviewer Response 1 — User Story Value Quality Implementation Plan

Disposition: **changes requested**.

## Provenance and method

- Spec digest verified: `shasum -a 256` on the spec matches the plan's claimed
  `10a05595…930a` exactly.
- The plan's claimed baseline `846d459f` was correct at drafting time. Repo HEAD
  is now `cbd39fd3`; the only intervening commits are `9e7d54cf` / `cbd39fd3`
  (`[#1706]` peer-review package decoupling). Nothing in the plan's File and
  Interface Map was touched by them, so the baseline remains substantively valid.
  `docs/DESIGN.md` did change and is a Task 6 target — re-read before editing.
- The spec turn-3 reviewer record link at plan line 17 resolves correctly to
  `docs/peer-reviews/spec/2026-09-18-…-31d4012650c25762c273a86bc677151c/`.
- Every source file and every test file named in the plan exists. I verified all
  17 source paths and all 19 test paths by `ls`.
- I executed `extractPlanTasks` and `validateSplitTasks` against the plan file
  itself. Result: 6 tasks, all `kind: task`, every task carries a
  `#### Story Intent` block, every task yields ≥1 extracted verifier, and
  `validateSplitTasks` returns `{ok: true, errors: []}`. The plan is structurally
  splittable **today**, before any of its own changes land.
- I read `#1703`'s live body. Its root `## Verification Commands` list has
  exactly ten entries and the plan's `vc:1`…`vc:10` mapping in Task 6 Step 4 is
  **verbatim correct**.

## What I agree with, verified against source

These are non-trivial claims the plan makes about existing behavior. I checked
each one and they hold; I am recording them so they are not re-litigated.

1. `user-story-author.mjs:24` imports `PLACEHOLDERS` from `user-story-guard.mjs`.
   The cycle risk in Task 1 Step 4 is real, and inverting ownership (canonical
   constants in author, guard's `PLACEHOLDERS` derived) is the right direction.
2. `buildPlanApprovedMarker(ts, {forecastRecordId, mode, trunkSha})` already has
   the `(ts, options)` shape the plan extends, and `marker-grammar.mjs` accepts
   kebab-case attribute names, so `story-digest` / `story-intent-digest` /
   `story-intent-source` serialize without grammar changes.
   `parsePlanApprovedMarker` already returns `null` for missing legacy
   attributes rather than synthesizing them.
3. `plan-approve.mjs:282` — the `mutateIssueBody` `mutate` callback **is**
   synchronous. Task 3 Step 2's instruction to preload contained file
   observations outside the closure is correct and necessary.
4. `plan-approve.mjs:220-239` — directory-backed approval does seal first and
   return `directory-approved` early, exactly as Decision 6 describes. (But see
   R1-F002 for why the prescribed remedy cannot work as written.)
5. `plan-approve.mjs:252` — `approvalComplete` exists and is the right insertion
   point for `storyBindingComplete`.
6. `plan-approve.mjs:318-330` — `persistedBody` is fetched but **never compared**
   against intended values. The plan's "exact persisted read-back" is genuinely
   new capability, correctly identified.
7. `extractPlanTasks` boundary is `SECTION_HEADING_RE = /^#{1,3}\s+/`, so a
   `#### Story Intent` block stays inside its task body. Task 4 Step 2's
   "parse intent within each task's actual structural boundary" works unmodified.
8. `markdownViews` is currently private and returns only
   `{structuralLines, commandLines}`; tasks carry no `sourceLine`. Task 1 Step 4
   is accurate.
9. `buildShapeFlags` (`create-issue.mjs:153-168`) unconditionally pushes
   `args['user-story-file']`, so an omitted flag would inject `undefined` into
   argv. Task 2 Step 3's warning and `storyArgs` snippet are exactly right.
10. Required-flag lists genuinely exist in two places — `create-issue.mjs:136`
    and `preflight-issue.mjs:380`. "Lists" plural is correct.
11. `states/refine.mjs` registers `userStoryWarnGuard` in `entryGuards` and
    `userStoryBlockGuard` in `exitGuards`; the other five guards the plan says to
    retain are all present.
12. Both `guardCtx` construction sites exist and both already carry `deps` and
    `projectDir` — `promote.mjs:407` and `move-state/guard-execution.mjs:197`.
13. `runSplitPlan` injects `deps.runCreator` (`verbs/split-plan.mjs:123`), and
    `buildSplitProposals` already validates every task before the fragment-write
    loop, with preflight fully separated from create. Task 4 Step 4's atomicity
    claims — including the honest disclaimer that GitHub provides no multi-issue
    transaction — are accurate.
14. `eight-state-flow.test.mjs:27-30` — `makeProject().move` only assigns
    `status`. Task 6 Step 1's premise is correct.
15. `planApprovedGuard` early-returns `{ok: true}` on both the `approval.plan`
    waiver and a disabled `analysisToDevelopment` gate. Decision 5's description
    is precise.
16. Decision 2 is correct and important: `split-plan.mjs` writes
    `source-plan-section` into **Story Origin** (line 64) *and*
    `Source-plan-section` into **Plan Metadata** (line 75). Restricting the
    authority read to Plan Metadata is the right call.
17. Decision 3 is correct: split children are written with `Source-plan`, and
    `PLAN_METADATA_KEYS` precedence is `['Implementation-plan','Source-plan','Plan']`.

---

## Required findings

### R1-F001 — The legacy-marker repair path has no branch to write bindings into; as written the plan produces a false `approved`

**Severity: high. Task 3 Step 4.**

The plan says "pass `...binding` into every Plan-state insert/upsert branch,
including non-adaptive legacy repair." There is no such branch. Trace
`plan-approve.mjs:282-316` for the exact case this feature is built to repair —
a Plan-state issue with a legacy `aitm-plan-approved` marker, not adaptive,
no `ready-for-plan` entry marker:

- `hasApproval` is true, so the `else if (!hasPlanApprovedMarker(n))` insert at
  line 303 does not fire.
- `adaptiveConfigured` is false, so the upsert at 294 does not fire.
- `requiresTrunkProvenance` is false (no R4P entry), so the upsert at 305 does
  not fire.
- **No branch executes. The marker is returned unchanged.**

Then at line 332-338: `hasApproval && !hasPlanEntry` may return
`re-stamped-entry`; otherwise `hasApproval && adaptiveConfigured` is false, and
control falls through to `return { status: 'approved', … }`.

So once `storyBindingComplete` is folded into `approvalComplete`, this issue
escapes the `already-approved` fast path, runs the mutation, writes **no story
bindings**, and reports `approved`. The Plan-exit guard then refuses with
`story-approval-binding-missing`, and `plan-approve` — the documented repair —
reports success every time it is run. That is an unbreakable loop for exactly
the population §13.3 promises to repair.

Required: add an explicit fourth branch (an unconditional Plan-state upsert
whenever the live binding differs from the parsed marker), and state in the plan
that `re-stamped-entry` and `approved` must not be returned when the persisted
marker still lacks complete bindings. The persisted read-back comparison you
already specify is what should catch this — make it explicit that it gates the
**status string**, not just the audit.

### R1-F002 — "Refuse before invoking the seal writer" is not achievable with the current contract-write surface, and it contradicts Task 6 Step 2

**Severity: high. Decision 6, Task 3 Step 4, Task 6 Step 2.**

Decision 6 and Task 3 Step 4 require a `story-approval-binding-unsupported`
refusal returned "before invoking the seal writer." Task 6 Step 2 requires a
test proving "rejected directory-backed approval makes no seal/projection/audit
write."

But directory-backed approval is only *discoverable* by calling
`writeDirectoryContractOperation({action: 'seal'})` and inspecting whether the
result is `directory-written`. There is no read-only probe. By the time you know
the issue is directory-backed, the seal has already been written. Running story
validation earlier (which the plan also says, and which I agree with) does not
help: an issue with a perfectly valid story would still get sealed and then hit
the unsupported refusal, leaving a seal behind.

Required: pick one and say so explicitly.
(a) Add a read-only detection capability to
`lib/github-records/contract-write.mjs` (e.g. an `action: 'inspect'` or a
`dryRun` option) and refuse on that, or
(b) drop the "no seal write" assertion from Task 6 Step 2 and specify the
observable contract as "the seal may occur, but no approval marker, no
projection, and no audit comment is written, and the CLI exits nonzero."

Either is defensible. What cannot stand is the current pair, which asks the
implementer to satisfy two mutually exclusive requirements.

### R1-F003 — Approval reads the plan from the working tree; split children pin `Source-plan-commit`. The plan never reconciles these, and the resolver contract has no commit parameter

**Severity: high. Decision 1, Task 3 Step 3, the `PlanObservation` contract.**

`verbs/split-plan.mjs:41-48` reads plan text via
`git show <planCommit>:<planPath>`, and `renderPlanMetadata` writes
`Source-plan-commit` into every child. The proposed
`resolveStoryIntentSource({body, projectDir, deps})` is described as a
"synchronous contained file-read adapter," and `PlanObservation` is
`{key, path, text, tasks}` — no commit field anywhere.

That means Plan approval and the Plan-exit guard bind intent from the **working
tree**, while the child records the intent it was *generated* from as a **pinned
commit**. Any working-tree edit to the plan — including the historical-plan
enrichment this feature mandates — silently changes what approval binds, with no
relationship to `Source-plan-commit`.

Decision 1 says fresh comparison "includes … source commit metadata," but no
contract in the plan carries it and no step describes reading it. Required:
either add the commit to `PlanObservation` and define whether resolution reads
the pinned commit or the working tree (and what happens when they disagree), or
state explicitly that `Source-plan-commit` is provenance-only, is deliberately
not consulted, and remove "source commit metadata" from Decision 1.

### R1-F004 — The provider-parity assertion in Task 5 Step 1 is a false green for two of the three providers, and the Claude adapter is missing from the file map

**Severity: high. Task 5 Step 1 and Task 5 Files.**

The proposed assertion is:

```js
assert.doesNotMatch(adapter, /Non-stub shapes require[^\n]*user-story\.md/i);
```

That phrasing exists in exactly one file. Verified:

- `skill/adapters/grok/SKILL.md:36` — "Non-stub shapes require the
  `./.scratch/plan/user-story.md` fragment…" → **matches**.
- `skill/adapters/claude/SKILL.md:45` — "required `./.scratch/plan/` fragments
  (including `user-story.md` for non-stub shapes)" → **does not match**.
- `skill/adapters/codex/SKILL.md:60` — "fragments (including `user-story.md` for
  non-stub shapes)" → **does not match**.

So the loop over `['claude','codex','grok']` passes for claude and codex whether
or not their contradictory mandates are fixed. A parity test that cannot fail on
two of three providers is worse than no test, because Task 5 Step 4 cites it as
the evidence that "no provider receives a … divergent rubric."

Compounding this: Task 5's **Files** list names only
`skill/adapters/codex/SKILL.md` and `skill/adapters/grok/SKILL.md` under
"Modify contradictory references." `skill/adapters/claude/SKILL.md:45` carries
the same mandate and is not listed. (Spec §12 has the same omission; I am
raising it here because the plan is what will be executed.)

Required: add `skill/adapters/claude/SKILL.md` to the Files list, and replace
the regex with one anchored on the *semantic* claim rather than grok's sentence.
A negative assertion over required-fragment lists — e.g. asserting that no
adapter or shared rule asserts `user-story.md` is required — plus a positive
assertion that each adapter reaches `rules/user-story-quality.md`, is what
actually enforces §12.

### R1-F005 — `templates/plan-file.md` is the scaffold for every new implementation plan and contains neither Story Intent nor task structure; it is absent from the plan entirely

**Severity: high. File and Interface Map, Task 2 Files.**

`templates/plan-file.md` is four sections — Scope, Context, Acceptance Criteria,
Plan Metadata. It has no `## Story Intent`, no `### Task N:` headings, and no
`#### Story Intent`. Every plan scaffolded from it after this change ships will
be unsplittable, with the operator discovering that only at `split-plan` time.

The plan's Files rows cover `templates/` for the four **issue-body** templates
only. Required: add `templates/plan-file.md` (root `## Story Intent` block plus
a worked `### Task 1:` / `#### Story Intent` / `**Verification Commands:**`
skeleton) to Task 5 or Task 6, whichever owns authoring guidance, and add an
assertion that the scaffold it produces passes the new task-intent contract.

### R1-F006 — Template edits must go through `npm run sync:templates`, and the mirror has a byte-identity guard the plan does not account for

**Severity: medium. Task 2 Step 2 / Files.**

Task 2 says to modify the four `templates/*.md` files "and their tracked
installed counterparts" under `.ai-task-manager/templates/`. The repo already
has `scripts/sync-templates.mjs` (`npm run sync:templates`) for exactly this,
and its header documents that a byte-identity guard in `templates.test.mjs`
fails when the mirror goes stale. Hand-editing eight files is how that guard
gets tripped.

Required: change the instruction to "edit `templates/`, then run
`npm run sync:templates`," and add the templates byte-identity test to Task 2's
Verification Commands.

Also, for accuracy: only three of the four templates carry the
"Complete three-line Connextra User Story (verbatim)" parameter doc line
(`epic-body.md:17`, `solo-issue-body.md:16`, `sub-issue-body.md:16`).
`defect-body.md` has `{{user_story}}` at line 11 with no such doc line, so
Task 2 Step 3's rewording applies to three files, not four.

### R1-F007 — Task 6's guard-parity fixture work is aimed at fixtures that do not exercise the story guards; the transition that matters has no fixture edit and no new assertion

**Severity: medium. Task 6 Files and Task 6 Step 1.**

Task 6 lists six guard-parity fixtures as "affected" and Step 1 says to "replace
former story-based early refusal fixtures with another still-valid early-stage
refusal." I checked all twelve fixture files: **none contains a `## User Story`
section, story prose, or a story-based expected refusal string.** There are no
story-based early refusal fixtures to replace.

The mechanics, verified:

- `userStoryBlockGuard` self-scopes to `toState === 'ready-for-plan'`. The
  `refine-to-plan/` fixture directory is consumed by the
  `guard-parity: refine→ready-for-plan` describes, so it *is* the right
  directory — but its accept-path test calls only `planRefinementEstimate` and
  `gateRefineToPlan` (the library baseline) and never `runGuards`, which is why
  `accept.json` passes today with no User Story at all.
- The `via-registry` refuse test asserts only that every **library** blocker
  appears among the registry reasons — a one-directional superset check. The
  block guard's refusal is currently an unasserted extra. Removing the guard
  therefore breaks nothing and, equally, is proven by nothing.
- `userStoryWarnGuard` returns `{ok: true}` unconditionally and writes to
  stderr, so it can never appear in a refusal fixture.

Net effect: the six listed fixtures likely need **zero** edits, and Task 2
Step 1's requirement to "assert no Refine-entry warning and no Refine-exit
refusal for absent/blank/template prose" needs a **new positive assertion** in
`guard-parity-early-stages.test.mjs` — including a `runGuards('refine',
'ready-for-plan', …)` call on a story-less body — not a fixture swap.

Required: correct the Task 6 Files list and rewrite Step 1's fixture sentence to
describe the assertion that must be added.

---

## Optional suggestions

### R1-S001 — Reuse `validateGovernedLinkedPlan`'s read instead of adding a second one; the current design has a TOCTOU window

`validateGovernedLinkedPlan` (`lib/governed-plan-policy.mjs:49-99`) already does
precisely what `story-intent-source.mjs` would do: `linkedPlanReference(body)` →
`resolvePlanPath` (containment, symlink, readability) → `readFileSync`. It is
synchronous and it already runs at `plan-approve.mjs:113`, before everything
else. It simply discards `content`.

As specified, `plan-approve` will read the same plan file twice, and the story
intent it binds comes from a read that is **not** the read that passed governed
plan policy. A file edited between those two reads yields an approval whose
digest attests to content that never passed policy — directly at odds with §9.4.

Suggest: extend the (frozen) result of `validateGovernedLinkedPlan` additively
with `{key, path, content}`, and build the `PlanObservation` from it. One read,
one containment implementation, no window. Its `status: 'not-applicable'` return
is also a clean signal for the deep-dive branch.

### R1-S002 — `extractPlanTasks().heading` is derived from the **masked** structural line, so inline code in a task title is replaced by spaces

`stripLineMarkdown` substitutes offset-preserving spaces for inline-code spans,
and `extractPlanTasks` takes `title` from `structuralLines[index]`. A heading
`### Task 3: Fix \`foo\` handling` yields `heading` of
`### Task 3: Fix       handling` — interior spaces preserved, backticked text
gone.

Round-tripping is self-consistent (split writes `task.heading`; the resolver
matches `task.heading`), so generated children work. The breakage is for the
**operator repair path** in Task 6 Step 3: a human copying a heading out of the
plan will author a selector that can never match. Decision 4's "print bounded
normalized candidates" mitigates it; I suggest the guide say explicitly that the
selector must be copied from the diagnostic's candidate list, never from the
plan source. Worth also noting that "normalized" here does not collapse interior
whitespace, so the term invites the wrong assumption.

### R1-S003 — The new Plan-exit guard needs `toState !== 'develop'` scoping stated, not just tested

Task 3 Step 6 says to register `storyApprovalBindingGuard` in Plan exit and
"never in Develop entry," and the test matrix says to verify Plan→Refine does not
run the gate. But Plan's `exitGuards` fire on *every* departure from Plan,
including a demote to Refine. `planApprovedGuard` handles this with an explicit
`if (ctx?.toState && ctx.toState !== 'develop') return { ok: true }` as its first
line. Suggest stating that requirement in the implementation step rather than
leaving it to be inferred from a test row — a demote blocked by a content gate is
a nasty failure mode.

### R1-S004 — Task 3 Step 7 adds a board-state read and a `projectDir` dependency to a verb that has neither

`runUserStory` (`verbs/user-story.mjs:72-89`) does exactly one thing: call
`mutateIssueBody` with `setUserStory`. It takes no `projectDir`, reads no board
state, and its no-op return carries no body. To "resolve/report the active intent
source during Plan" it must additionally learn the state, obtain `projectDir`,
and fetch a body — none of which it does today, and one of which is a new network
call on a verb that currently makes one.

Suggest the plan name those additions explicitly, and say whether the report is
best-effort (never failing the write) — Step 7's "does not … prevent an otherwise
valid story-repair write" implies yes, which is the right call, but the
dependency growth should be budgeted rather than discovered.

### R1-S005 — Several headline deliverables have no root VC that runs them, and the coverage table implies otherwise

I verified `#1703`'s root VC list against the plan's Task 6 Step 4 mapping: it is
verbatim correct. But `vc:2` is only
`plan-approve.test.mjs` + `coverage-plan-approve.test.mjs`, and `vc:3` is only
`split-plan.test.mjs`. The plan's own new tests —
`markers.test.mjs`, `story-intent-source.test.mjs`,
`story-approval-binding-guard.test.mjs`, `plan-approval-story-audit.test.mjs`,
`plan-approve-collapse.test.mjs`, `decomposition-plan-exit-gate.test.mjs` —
appear in no root VC and are reached only transitively through `vc:6`/`vc:7`.

Yet the coverage table cites `vc:2` as evidence for AC3 ("marker codec, fresh-base
races, bypass matrix") and `vc:3` for AC4. Since AC ticking is evidence-gated off
`vc-list`, that citation will not demonstrate what it claims. Suggest either
widening `vc:2`/`vc:3` on the issue before Develop starts, or changing those
coverage-table cells to `vc:6`/`vc:7`. Task 6 Step 4's disclaimer ("do not claim
those replace any root command") is honest and should stay either way.

### R1-S006 — Two independent selector interpretations, and two independent Markdown-masking implementations, will drift

Two overlaps worth a sentence each in the plan:

1. `selectDecompositionPlanSection` (`decomposition-policy.mjs:341-392`) already
   implements duplicate-detection, blank-detection, exact-heading match and
   ambiguity refusal for `Source-plan-section` — but only when
   `activePlanKey === 'Source-plan'`; otherwise it silently returns the whole
   plan. Decision 3 changes that same coexistence case to a **refusal** in the
   new resolver. Two readers of one field with opposite behavior is a drift
   source. Say whether `selectDecompositionPlanSection` is expected to adopt the
   refusal too, or why divergence is intended.
2. `markers.mjs` already owns `stripFencedCodeBlocks` and
   `maskFencedCodeBlocksPreservingOffsets`; `decomposition-policy.mjs` owns
   `markdownViews`. The plan extracts the latter into
   `plan-markdown-views.mjs` without mentioning the former. Relatedly,
   `user-story-guard.firstH2Heading` and `issue-body-verifier`'s `firstH2` both
   use **raw, unmasked** regexes, while §7.1 specifies the new evaluator operates
   on masked structural lines. They agree today because both are raw; after this
   change a body with a fenced `## …` ahead of User Story could be accepted by one
   and refused by the other. Worth one line stating whether §503 position
   validation moves to the masked view in all three places or stays raw in all
   three.

---

## Corpus provenance — read this before starting Task 1

Task 1 Step 1 is conditional: preserve the repaired prose from "the completed
2026-09-18 audit" *when a retained snapshot or audit record proves it*, otherwise
report missing provenance. I searched the repository: `docs/audits/` contains only
`2026-09-15-done-delivery-14-day-survey.md`, and there is no artifact anywhere in
`docs/` or `.scratch/` recording that audit. **The conditional is already
resolved — the fallback is the actual path.**

That is workable and honest: if the 2026-09-18 audit wrote repairs into the live
issue bodies, then `repairedStory` can be captured live with
`repairedSource: 'live-body'` and a current `capturedAt`, exactly as the schema
allows and as the plan already insists. But the plan should say so up front rather
than branching, because Plan Review Checklist item 2 ("confirm corpus provenance
can be recovered") reads as an open question when it is not. The ID arithmetic
checks out: 4 + 18 + 2 = 24.

---

## What I did not review

- I did not attempt to validate the 24 issues' live bodies; that is a network
  audit belonging to Task 1 execution, not to plan review.
- I did not run the repository's test suites. No claim in this response depends
  on a test outcome; every claim is from reading source or from the one
  `extractPlanTasks` / `validateSplitTasks` execution reported above.
- `authority_assurance` is **unavailable**. This review was orchestrated by hand
  because the `ai-peer-review` package was removed from this worktree by
  `9e7d54cf`/`cbd39fd3`; there is no tool-certified evidence binding this
  response to the artifact digest beyond the digests recorded in the frontmatter,
  which I computed locally.

## Bottom line

The plan is unusually strong on the things plans normally get wrong: it read the
real code, its file map is accurate, its six implementation decisions address
genuine ambiguities, and its atomicity and sequencing claims hold up under
inspection. Task 4 in particular I would approve nearly as-is.

The blockers are concentrated in Task 3 and Task 5. R1-F001 makes the documented
legacy repair path silently non-functional. R1-F002 asks for two things that
cannot both be true. R1-F003 leaves the single most important question — which
bytes does approval actually bind — unanswered. R1-F004 ships a parity test that
cannot fail for two of three providers. R1-F005 would leave every newly
scaffolded plan unsplittable.

Address those five and the medium findings, and I expect to accept on the next
turn.
