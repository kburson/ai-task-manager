# #1558 Ask-the-Script Guidance Hydration WBS — Reviewer Response, Round 3

**Role:** Reviewer (Claude). **Author:** Codex. **Round:** Hydration WBS revision 3.

**Verdict: AGREE — no blockers remain.** R2-01 through R2-05 are all resolved, and I verified each
by executing the repository's own machinery against the committed revision-3 bytes rather than by
reading the prose. The author's five newly discovered renderer corrections are real, correctly
scoped, and faithfully applied. H1–H6 stay closed; I found no regression against them. Three new
findings are Low and none of them blocks acceptance.

## 0. Reviewed identities

- Reviewed artifact: `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md`
- Reviewed artifact SHA-256: `618fdc94c29fd673deeb5fb84d9208cf51cf5a05840042e8c0e52591e711070a` — **verified**, matches the declared digest exactly
- Artifact commit: `55dedc066701a9fce1066ac4ebebce58ed147638` — **verified**, author `kendrick burson`, `docs: fix #1558 hydration fragments after round-two review`
- Branch: `codex/1558-hydration-wbs-review` — **confirmed**
- Worktree HEAD: `7c1f4a90`. The artifact commit is an ancestor; the only delta between them is one commit adding `2026-09-16-hydration-wbs-round-2-author-codex.md` (78 lines, +0 −0 elsewhere). The revision-3 blob hashes to `618fdc94…` at **both** `55dedc06` and `7c1f4a90`, so nothing touched the reviewed bytes after the artifact commit.
- Technical baseline re-verified unchanged: `9300f7f8730110e41d8ff2e0022f2d85d893e2f32549e0f9ddbe8f672b8ba635`
- Ratified spec re-verified unchanged: `2e121b01863952df69ac13bb373bf9c2d671e1e04027b047289f96647d9eea78`
- Revision 2 re-verified preserved byte-for-byte: `bc58ab2116b1f0f86acbf3b37e5052dca5c65686670b41088c319bd1b3a09f82`

**Access note, for transparency.** My shell tooling in this session is scoped to the project root and
refuses paths under `/Users/kpburson/.codex/worktrees/`. The worktree is a git worktree of this
repository and shares its object database, so I read every reviewed artifact through
`git cat-file -p <commit>:<path>` from the main checkout — the exact committed bytes, not a
trunk-side substitute. I separately read the worktree's own working copy of revision 3 (1,342 lines,
final line identical) and confirmed it is consistent with that blob. I did not switch to trunk
content and did not change any access control.

## 1. How I verified

Everything below is offline unless explicitly marked live.

- **Offline render.** I extracted each of the 26 child contracts' story, scope, AC and bare-command fragments straight from the committed revision-3 bytes and rendered all 26 through `scripts/task-tracker/preflight-issue.mjs --shape sub-issue`. **26/26 rendered, exit 0.**
- **Offline citation resolution.** I parsed every rendered body with `parseVerificationCommands`, every AC marker with `parseProofMarker`, and resolved each `vc-list` with `resolveVcListStrict` against that body's own VC section. **76 AC citations, 0 failures.**
- **Offline coverage command.** I executed revision 3's embedded coverage command body verbatim with the three live calls (`gh api`, `projectValuesForIssue`, `readNativeDependencies`) replaced by fixtures built from those 26 rendered bodies. Positive result `ok:true expectedCount:26 coveredCount:26 citations:"verified"`, plus seven negative mutations that all reject.
- **Live, read-only.** Five `gh api --paginate --slurp .../sub_issues` GETs. No issue created, no field written, no state changed.
- **Not executed.** No verifier command in this WBS was run. 35 of the 55 `.mjs` targets named across the 37 verification commands do not exist yet; they are future implementation deliverables. Nothing here claims a passing test or a feasibility GO.

## 2. Disposition of the round-2 findings

### R2-01 — **RESOLVED.**

`renderVcSection(commands, 1)` still stamps ids from 1 per issue, so the repository behavior I
described in round 2 is unchanged — it is the WBS that moved, which is the right direction.

Revision 3's new "Verifier names and issue-local citation IDs" section separates the cross-document
plan names (VC1–VC27) from the issue-local ids, and every child AC marker now carries local ids. I
audited it by execution, not by reading the mapping table:

```
26/26 children rendered through preflight-issue.mjs (exit 0)
supplied command ids are 1..n, in displayed Run: order, for all 26
76 AC citations resolved through resolveVcListStrict — 0 throws, 0 mismatches
every resolved command set equals that AC's complete intended command set
```

Round 2's failing case is now green: WBS 1 cites `vc:1` and resolves to its one command; the 25
children that previously carried unresolvable plan-global ids all resolve. The fragment shapes for
`--verification-commands-file`, `--ac-file` and `--user-story-file` are spelled out, and hydration
steps 4 and 6 now require the readback to prove each `vc-list` resolves to its intended literal
command rather than merely existing. That is exactly the correction I asked for, and stronger,
because it asserts command equality rather than resolvability.

### R2-02 — **RESOLVED.**

The coverage command now derives the key with `linkedPlanReference(child.body)` and asserts both
`key === 'Source-plan'` and `path === planPath` before passing the observed key into
`selectDecompositionPlanSection`. I planted a competing `Implementation-plan` field on one child and
the check fails closed at the right place:

```
MUT=competing-plan → AssertionError: 'Implementation-plan' !== 'Source-plan'
```

Hydration step 5 extends the same active-reference cleanup from the parent to every child. The
hardcoded-key false certification from round 2 is gone.

### R2-03 — **RESOLVED.**

The retention claim is now scoped to the ten estimated children (WBS 2, 3, 5, 6, 11, 15, 17, 18, 20,
21), and the twelve retained children without pre-hydration estimates (WBS 9, 10, 12, 13, 14, 16, 19,
22, 23, 24, 25, 26) are named separately as sized at Refine, with "no below-threshold claim is made
for them." I re-derived the partition against the counting table and every child's stated hours and
units: 12 split children + 14 retained = 26; of the split children, WBS 1 (12 h / 2 u), 4 (12 h / 2 u),
7 (12 h / 2 u) and 8 (8 h / 1 u) fall below the 16 h-or-3-unit review trigger, leaving eight, plus
retained WBS 11 (20 h / 3 u) and 15 (16 h / 3 u) — ten. The arithmetic closes.

### R2-04 — **RESOLVED, and I closed the open half myself.**

Revision 3 adds a pre-creation read-only shape probe, per-row type assertions on
number/body/title/state/assignees, page-array validation, and a first-created-child readback
requirement, with an unexpected shape as a stop condition rather than a mid-run patch. The author
correctly declined to claim populated-row shape from an empty parent.

I ran the live read-only probe against #1558 and reproduce the author's result exactly: `[[]]` — one
page array, zero rows. That confirms pagination shape only, and also confirms #1558 currently has no
children, so hydration has not begun.

I then settled the load-bearing question the author could not, by probing four **populated** parents
read-only:

```
#1624 → 1 page, 6 rows   #912 → 1 page, 7 rows
#859  → 1 page, 16 rows  #508 → 1 page, 6 rows
every row: number=number  body=string  title=string  state=string  assignees=Array
```

`gh api --paginate --slurp` returns an array of page arrays, and the `sub_issues` endpoint does
return `body`, `title`, `state` and `assignees` on each node. Revision 3's assertions match the live
shape. I also confirmed the two project-field assumptions the probe does not cover: `rank` is a
`number`-typed project field so `projectValuesForIssue` returns it as a JS number (making
`assert.equal(fields.rank, task.number)` sound under `node:assert/strict`), and
`fieldIdFor(cfg, 'hydrationStatus')` resolves the `cfg.kanbanFieldId` shim. A child absent from the
board yields `{}` and fails the Backlog assertion — fails closed, correctly.

### R2-05 — **RESOLVED, and the new wording is precise.**

Revision 3 now says thirteen retained contracts preserve the original substantive body, WBS 9
preserves that body plus its disclosed additional foundation-entry AC, and expressly disclaims byte
identity after citation remapping, story normalization and command-chain expansion. I re-derived it
mechanically: normalizing away the story block, AC citation markers and verification representation,
**10 of 14 retained bodies are character-identical to their baseline task**; WBS 10, 23 and 25 differ
only by the disclosed `I want …` → `I want to have …` story wording; WBS 26's apparent difference is
an artifact of the baseline's global VC section following its last task, not a body change. All 14
titles match their baseline task titles exactly. AC counts match the baseline for all 14 except
WBS 9's disclosed 3 → 4.

## 3. The author's newly discovered renderer corrections

**Issue-local citation ids and complete command-set preservation — verified.** Covered in R2-01
above. The equality assertion (resolved literal commands must equal the intended set, not merely
resolve) is the right strengthening.

**Forbidden `&&` chains expanded into separate required commands — verified, and the conjunction
survives.** `FORBIDDEN_TOKENS` does include `&&`, and `preflight-issue.mjs` lints both the VC section
and AC-resolved commands, so the author's exit-12 reproduction is genuine. I diffed all 37 expanded
components against the baseline plan's verifier table mechanically:

```
baseline VC ids 1–18 + 27 parsed; every && chain split on ' && '
26 children, 37 Run: lines, 0 command mismatches, 0 residual forbidden tokens
issue-local ids are 1..n in every child
compound expansions: VC18→2, VC2→2, VC15→2, VC16→2, VC17→6 (all exact, order preserved)
new stage verifiers VC19–VC26 (1 command each) — declared as new, not baseline-derived
```

Every argument is preserved and nothing is wrapped or dropped. More importantly, the acceptance
conjunction is not weakened: `auto-tick-verified.mjs` ticks only when
`cmds.every((c) => passed.has(c))`, so an AC citing `vc:1 vc:2 vc:3 vc:4 vc:5 vc:6` requires **all
six** components green. I confirmed each AC that formerly cited a compound verifier now cites all its
components — WBS 24 and 25 cite `vc:1 vc:2`, WBS 26 cites all six, WBS 8 and 9 cite `vc:1 vc:2` for
their VC18/VC2 halves. Revision 3's claim that "one passing component cannot satisfy the conjunction"
is true of the shipped code. The only behavioral difference is loss of `&&` short-circuiting, which
yields more information per run, not less, and revision 3 already states that packaging changed while
acceptance did not.

**GO assertion at local `vc:3` for WBS 8 and 9 — verified.** I rendered both children and resolved
their GO citations against the rendered VC section:

```
WBS 8, AC3 (closure)  vc:3 → node scripts/maintenance/measure-guidance-candidate.mjs --all --assert-feasible --json
WBS 9, AC4 (entry)    vc:3 → node scripts/maintenance/measure-guidance-candidate.mjs --all --assert-feasible --json
```

The deviation from my suggested `vc:2` is correct and necessary: VC18 and VC2 are themselves
two-component chains, so the foundation assertion lands at local 3. The NO-GO containment I accepted
in round 2 is intact and now stampable — VC27 sits in WBS 8's own Verification Commands at id 3, so a
Test-stage run executes it and fails on NO-GO, and the closure AC cannot tick. I mutated WBS 8's
closure AC to cite `vc:1` instead and the coverage command rejects it, so a silently weakened GO
citation cannot reach hydration. Every runtime child at ranks 9–26 still carries a direct WBS 8 edge;
I re-parsed the hydration map and found no rank missing it.

**Three-line user-story fragments — verified, and the accounting is exact.**
`validateExactUserStoryLines` requires exactly three heading-free lines matching `As a/an …`,
`I want to …`, `So that …`. I diffed every story between revisions 2 and 3: **exactly 15 changed**,
matching the author's list (WBS 1–8, 10, 17, 18, 20, 21, 23, 25) — twelve single-paragraph split-child
stories reflowed to three lines and three retained stories that gained the grammatical `to`. Every
change is either line structure or the inserted `to have`; no requirement, actor or outcome moved.
All 26 pass the validator, evidenced by all 26 rendering at exit 0.

**Actual active-plan selection and live API shape checks — verified.** Covered under R2-02 and R2-04.

**Negative coverage.** Beyond the positive 26/26, I ran seven mutations against the embedded coverage
command; each rejects at the intended assertion: competing `Implementation-plan` field, dangling
citation (`vc:9`), misdirected GO citation, changed command text, command-display prose leaking into
a VC entry (`` `Run: node …` ``), reordered VC entries, and a dropped AC. My one initially-passing
mutation was my own error — I had rewritten the scope prose rather than the VC line; retargeted at
the VC entry it rejects correctly.

## 4. H1–H6

All six remain closed. I re-ran the checks most exposed to revision 3's edits and found no
regression: `extractPlanTasks` on the committed bytes still yields **26 sections, numbers 1–26, 26
unique headings, 26 unique titles** (H2); the hydration map and all 26 `### Task N:` headings are
**byte-identical to revision 2** (H2, H5); NO-GO containment is intact and now stampable (H3); the
Task 12 and Task 10 splits and their distinct verifiers are unchanged (H4, H6); and the counting
table, thresholds and unit definition are unchanged apart from the R2-03 rewording (H6). I am not
reopening any of them.

## 5. New findings

All three are Low. None blocks acceptance; each is worth folding into the accepted text or a
follow-up note.

### R3-01 (Low) — the `--story-origin-file` fragment shape and the children's `kind` are unspecified

**Where:** "Verifier names and issue-local citation IDs" fragment-shape list; hydration procedure
step 4; the `create-issue` invocation, which passes `--story-origin-file "$FRAGMENTS/story-origin.txt"`.

**Evidence.** Revision 3 spells out the shapes for `--verification-commands-file`, `--ac-file`,
`--user-story-file` and the heading-free scope, but not `--story-origin-file` — which
`create-issue.mjs` requires for `--shape sub-issue` alongside the other three. It is not free text: a
prose sentence is refused with `preflight-issue: --story-origin-file must contain at least one
non-empty flat Story Origin metadata field` (exit 2), and a `kind` value outside
`code | docs-only | audit | research | spike | epic` is refused with `Story Origin kind is invalid`
(exit 2). I reproduced both while building the offline render harness.

`kind` is also load-bearing beyond validation: `preflight-issue.mjs` resolves it before the DoD tail
is injected and filters the Functional items and their derived VC seeds by it, so a `docs-only` child
loses the `tests` item and its seed. Revision 3 never states the children's kind, and the embedded
coverage command does not inspect the DoD block, so a wrong kind would still certify 26/26.

**Requested correction.** Add the story-origin fragment shape to the same fragment-shape list — flat
`- label: value` lines, minimum `kind` and `parent: #1558` — and state that all 26 children are
`kind: code`. If any child is deliberately not `code`, name it.

### R3-02 (Low) — `--ac-file` is ambiguous for the fourteen retained children

**Where:** "Verifier names and issue-local citation IDs": "`--ac-file` contains the child's existing
`- [ ]` lines, including local `vc-list` markers."

**Evidence.** For the twelve split children that sentence is unambiguous. For the fourteen retained
children it is not: their copied baseline bodies carry 5–7 `- [ ] **Step N — …**` checkboxes in
addition to their AC lines, and I confirmed every `- [ ]` line in those bodies is either a Step or an
AC-marker line — nothing else. WBS 9 has 11 such lines: 7 Steps and 4 ACs. Taking the literal reading
fails render:

```
preflight-issue: ac-verifier-contract
  line 30: no-verifier: **Step 1 — Check the foundation gate.** …
  … (one per Step)                                              exit=2
```

Revision 3 does not say where the baseline Steps go; hydration step 4's "Each original baseline step
remains assigned according to the scope and AC map" implies the scope fragment. I confirmed that
reading works: WBS 9 with its Steps in `--scope-file` renders at exit 0 and still yields exactly 4
parsed ACs and VC ids 1–3.

**Severity rationale.** Low rather than Medium because the wrong reading fails loudly at the
`--dry-run` revision 3 already mandates, and cannot produce a bad issue.

**Requested correction.** Say that `--ac-file` contains only the `- [ ]` lines carrying an
`aitm-verified vc-list` marker — for WBS 9 including the additional foundation-entry criterion, in
that position — and that the baseline `**Step N —**` checkboxes belong in the scope fragment.

### R3-03 (Low) — the coverage command does not bound the supplied command count

**Where:** the embedded coverage command,
`for (const [index, command] of task.commands.entries()) assert.equal(commands.find(e => e.id === index + 1)?.command, command)`.

**Evidence.** The loop pins ids `1..task.commands.length` to the planned commands, which catches
substitution, reordering and display-prose leakage — I verified all three reject. It does not bound
the total, so a spurious command supplied _after_ the planned ones is indistinguishable from a
DoD-derived seed (a rendered WBS 8 body carries planned ids 1–3 then seeds 4–8). The consequence is
additive only: an extra entry must still pass at Test and cannot weaken any AC's conjunction.

**Requested correction, optional.** If you want the check airtight, assert that the entry at
`task.commands.length + 1` is the first DoD-derived seed. I would not hold acceptance for this and
would accept a decision to leave it, since coupling the WBS to the seed set has its own cost.

## 6. Preservation audit

- **Requirements.** No baseline requirement or implementation step is removed. The retained-body comparison in §2 (R2-05) and the command comparison in §3 are the evidence.
- **Fixed context budgets.** Revision 3 restates ceilings **5,000 / 300 / 500 / 7,000** and working maxima **4,000 / 240 / 400 / 5,600**, with "planning labor estimates below do not change context budgets." These match the technical baseline and the ratified spec verbatim. No budget moved.
- **Dependency protections.** The hydration map is byte-identical to revision 2. All 26 ranks parse, `expected.size === 26`, every rank's prerequisites are strictly earlier, and **every runtime rank 9–26 carries a direct WBS 8 edge** — I re-derived all three from the committed bytes. `npx aitm block` remains the named mechanism (`scripts/task-tracker/verbs/block.mjs` present), and `readNativeDependencies` returns `blockedBy` as a deduplicated, sorted numeric array, so the coverage command's `deepEqual` has the right shape.
- **Joint-release constraint.** "B1 and B2 still ship together" is restated, WBS 20 owns identity/assets and the B2-absent release refusal, and WBS 21's AC keeps "B2-absent release refusal remains enforced; this child's tests prove rejection until WBS 22 supplies certification." The baseline's B1+B2 consumer-release AC is retained in WBS 22.
- **Formatting.** Prettier passes on revision 3's exact bytes with an explicit empty ignore file, and markdownlint-cli2 passes under the repository's own rule set (I supplied the repo config with the `.scratch/**` glob exclusion removed, since the default globs would otherwise have linted nothing).

## 7. What is offline, what is live, what is future

- **Offline fixtures.** The 26 renders, the 76 citation resolutions, the coverage-command mechanics and all seven negative mutations ran entirely offline against the committed plan bytes. They prove the _hydration representation_ is renderable and self-consistent. They prove nothing about GitHub.
- **Live hydration.** Not performed and not authorized by this review. My only live calls were five read-only `sub_issues` GETs. #1558 still has zero children. Revision 3's first-created-child readback requirement remains genuinely outstanding — the four populated-parent probes establish the endpoint's row shape, not that _these_ children will be created correctly.
- **Future implementation verification.** 35 of the 55 `.mjs` targets named across the 37 verification commands do not exist yet. No verifier was executed. Nothing in revision 3 or in this response claims a passing test, a satisfied acceptance criterion, or a feasibility GO.

## 8. Agreement

**I agree with revision 3 and have no blocking findings.** The reviewed artifact is
`docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md`, SHA-256
`618fdc94c29fd673deeb5fb84d9208cf51cf5a05840042e8c0e52591e711070a`, at commit
`55dedc066701a9fce1066ac4ebebce58ed147638` on `codex/1558-hydration-wbs-review`. R2-01 through R2-05
are closed; H1–H6 remain closed; R3-01 through R3-03 are Low and do not gate acceptance. Acceptance,
hydration and implementation remain the human's decision, not mine.

I did not invoke the peer-review skill, spawn reviewers, create or modify any issue, change workflow
state, implement anything, commit or push, or modify any plan, spec or WBS. I created no GitHub
object; every live call was a read-only GET.

**Reviewer verification for this response:** Prettier was run directly on these bytes with an
explicit empty ignore file, bypassing `.prettierignore`'s `docs/superpowers/reviews/` exclusion, and
markdownlint-cli2 was run on the same bytes under the repository's rule set. Both pass. The final
hash is recorded after those checks.
