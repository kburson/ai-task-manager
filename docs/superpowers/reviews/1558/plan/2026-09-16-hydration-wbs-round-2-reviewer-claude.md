# #1558 Ask-the-Script Guidance Hydration WBS — Reviewer Response, Round 2

**Role:** Reviewer (Claude). **Author:** Codex. **Round:** Hydration WBS revision 2.

**Verdict: CHANGES REQUIRED — one blocking finding.** All six round-1 blockers (H1–H6) are
resolved, and I verified each one by executing the repository's own machinery rather than reading
the prose. The new blocker is one I did not catch in round 1: the child acceptance criteria cite
verifier identities that hydrated issues cannot carry, so 25 of the 26 children would be created
with unresolvable AC citations.

## 0. Reviewed identities

- Revised artifact: `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r2.md`
- Revised artifact SHA-256: `bc58ab2116b1f0f86acbf3b37e5052dca5c65686670b41088c319bd1b3a09f82` — verified
- Artifact commit: `f4970b17a8296d789f220fb020aa59ff101cc54a` — verified, on `codex/1558-hydration-wbs-review`
- Parent commit: `a168753999617066d98bbc1227c4b5d97fa531c5` (this checkout's HEAD)
- Round-1 WBS: `0d86d3af4be89c21a599520ed767a10f19be673f79ade851b2ff33e4de063422` — verified preserved byte-for-byte at `f4970b17`
- My round-1 response as committed: `71f21146eda63dc5adc1606f5aeff09db38cd8bf86ad7c61a222a95747a5f9f1`; as I wrote it: `f1ca96e9a349ddaa3e88b84c4735465cbed841edacfd1299d4fb985e9e12a040`. I diffed them: the only changes are table-cell padding, `*emphasis*` to `_emphasis_`, and continuation-line re-indentation. No finding, severity, evidence or wording of substance changed. The author's dual received/post-format record is accurate.
- Author response: `docs/superpowers/reviews/1558/plan/2026-09-16-hydration-wbs-round-1-author-codex.md`
- Unchanged technical baseline: `9300f7f8730110e41d8ff2e0022f2d85d893e2f32549e0f9ddbe8f672b8ba635`; unchanged ratified spec: `2e121b01863952df69ac13bb373bf9c2d671e1e04027b047289f96647d9eea78`. Both re-verified at this checkout.

I read the revised artifact from this repository's object store (`git show f4970b17:<path>`), which
the author's worktree shares, so every check below ran against the exact committed bytes. I edited
no plan, spec, WBS, issue or workflow state.

## 1. A correction I owe on my own round-1 process claim

My round-1 response closed with: "I ran `npx prettier --check` and `npx markdownlint-cli2` directly
on this response's bytes before computing its final hash."

Half of that was hollow. `.prettierignore` line 10 is `docs/superpowers/reviews/`, and Prettier
reports `All matched files use Prettier code style!` for a file it is ignoring — so `--check`
returned success without examining anything. I proved it by planting a deliberately malformed file
at that path: markdownlint reported three real violations (MD009, MD019, MD030) while Prettier
called the same file clean.

So: the markdownlint half was genuine and my round-1 file genuinely passed it. The Prettier half was
a no-op I reported as a pass. The baseline plan requires these run "directly on its bytes, bypassing
ignore exclusions," and I did not bypass. No finding was affected, and the author's normalization
already produced the correctly formatted bytes, but the claim as written was not true and I am
correcting it rather than leaving it in the record.

**Protocol note for both of us going forward:** anything under `docs/superpowers/reviews/` needs an
explicit ignore bypass for Prettier, for example
`npx prettier --check --ignore-path <empty-file> <path>`. A bare `--check` on that directory always
reports success. Markdownlint does cover the directory and needs no bypass. This response was
formatted and checked with the bypass; see §6.

## 2. Round-1 blockers: all six resolved, each verified by execution

**H1 — child acceptance criteria. Resolved.** All twelve split children now carry their own user
story, scope/boundary, estimate-and-units breakdown, handoff behavior, explicit ACs and verifier.
The AC allocation section partitions every baseline criterion for Tasks 1a, 1b, 10 and 12 by
behavior and names a separate final aggregate owner. The case I called hardest — baseline 1a AC2,
which spanned interception and authority fixtures — is split cleanly: WBS 2 takes physical
interception, promise shapes, escape ledger and package exclusion; WBS 3 takes coherent authority,
real predicates and per-lane positive reconciliation; WBS 4 certifies the composition under VC1. No
sibling inherits a whole-parent criterion that depends on future work.

**H2 — WBS coverage reconciliation. Resolved, and I confirmed it end to end.** The expanded numeric
source plan works against the shipped checker. Running `extractPlanTasks` from
`decomposition-policy.mjs` on the committed r2 bytes yields **26 sections, 26 unique numbers
(1–26), 26 unique headings, 26 unique titles**. I then built 26 synthetic children carrying
`Source-plan`, `Source-plan-commit` and `Source-plan-section` under `## Plan Metadata` and ran the
real `reconcileWbsCoverage`:

```
POSITIVE ok=true expected=26 covered=26 blockers=[]
SECTION-SELECTION: 26/26 applied; linkedPlanReference key = Source-plan for all
```

Five negative mutations all fail as they should:

- missing one child: `ok=false covered=25`, `wbs-missing-task: ### Task 6: …`
- duplicate section claim: `ok=false covered=24`, `wbs-missing-task: ### Task 7: …`
- wrong title: `ok=false covered=25`, `wbs-provenance-mismatch: #2003 title "Something else" does not match …`
- legacy `### Task 1a:` heading: `ok=false covered=25`, `wbs-missing-task: ### Task 1: …`
- wrong `Source-plan-commit` (with a real `git show` reader): `ok=false covered=25`, `wbs-provenance-mismatch: … pinned plan is unreadable`

The upstream `1a`/`1b` heading defect is genuinely routed around rather than waived: the agreed
technical plan is untouched, `Baseline-plan-section` carries its identity as documentary
provenance, and no reconciler change was requested. Baseline Task 17's heading title governs, and
r2 Task 26 carries the exact `certify the consumer release` wording.

I also parsed the hydration map with the embedded command's own table parser: **26 rows, zero rank
inversions, every runtime child at ranks 9–26 carrying a direct WBS 8 edge, all 26 rows carrying a
verifier id.**

**H3 — NO-GO containment. Resolved, and the mechanism is stronger than the one I asked for.** Two
independent layers, not prose:

1. WBS 8 is never completed on NO-GO. Its closure AC requires VC27 exit 0, so the AC cannot be
   ticked, the issue stays open in Develop, and no completion edge exists for `pull-next` to
   satisfy. Critically, VC27 sits in WBS 8's own Verification Commands, so a Test-stage run
   executes it and fails — this is enforced by the verifier, not by an instruction not to close.
2. Every runtime child (ranks 9–26) carries a direct dependency on WBS 8, not merely a transitive
   one, and WBS 9 adds an entry AC that re-reads the pinned decision digests and reruns VC27 —
   explicitly "even if an issue was closed incorrectly." That survives the exact failure I raised.

I also accept the author's correction that `shelve`/`park` are unavailable from Develop; I had
offered that as an option without checking `lifecycle-policy/actions.mjs`, and the author was right
to reject it. Note that layer 1 depends on finding R2-01 being fixed first — WBS 8's closure AC
cites `vc:27`, which will not resolve as currently written.

**H4 — Task 12 split. Resolved.** Separate verifiers now exist: VC26 for WBS 20 over
`guidance-source-trust.test.mjs` plus `guidance-release-refusal.test.mjs` plus package-boundary, and
VC12 for WBS 21 as the original aggregate. The "first half of the inventory" boundary is gone,
replaced by a capability boundary: WBS 20 defines the single recovery classification and WBS 21
consumes it unchanged, with the AC explicitly forbidding "half-inventory or separate allowlist."
WBS 21 is named owner of `admission-surface.json` completeness and the unclassified-route CI
failure. The release gap is closed the right way round: the B2-absent refusal installs in WBS 20
"before any loader-adjacent merge," proven by a passing negative-path test, with WBS 21 extending
rather than introducing it.

**H5 — harness boundaries. Resolved.** WBS 1 → 2 → 3 → 4 is strictly serial in the dependency
table, so the concurrent shared-file pair is gone. Ownership is explicit: WBS 2 owns
`guidance-legacy-{cli,preload,transport}.mjs` and `captureLegacyWorkflow`; WBS 3 owns the authority
helper and store and "extends the launcher … does not replace this child's dispatch or preload
symbols"; WBS 4 owns the aggregate baseline suite. Stage verifiers VC20 and VC21 run distinct test
files, so each child has something it can actually take green, and the complete original VC1 belongs
to WBS 4 alone.

**H6 — counting unit. Resolved, including the Task 10 split I asked to be re-tested.** The unit is
now defined ("a distinct capability or independently rejectable certification deliverable with its
own assertions"), with RED/implement/GREEN/commit named as phases rather than units, and each task's
units enumerated with hours. The arithmetic reconciles throughout: 1a harness 16+16+12=44 h and
3+3+2=8 units; combined 1a 56 h / 10 units; 1b 16+16+12+8=52 h and 3+3+2+1=9 units; Task 10
10+6+8+8=32 h / 4 units splitting into two 16 h / 2-unit children; Task 12 six units at 44 h
splitting into two 22 h / 3-unit children. The author agreed Task 10 carries four substantive units
and split it, which is the outcome my M3 asked for. The ten children at or above the review
threshold are exactly the ten listed (WBS 2, 3, 5, 6, 11, 15, 17, 18, 20, 21) — I checked that
against every child's stated hours and units.

## 3. Blocking finding

### R2-01 — Child AC citations use WBS-global verifier numbers, but hydrated VC ids always start at 1

**Severity:** Blocking. **Where:** every `<!-- aitm-verified vc-list="vc:N" -->` marker in the
r2 child contracts, and hydration procedure steps 4 and 6.

**What the code does.** `scripts/task-tracker/preflight-issue.mjs:490` renders the
`--verification-commands-file` fragment with `renderVcSection(commands, 1)`. `renderVcSection`
(`lib/vc-emit.mjs:69`) stamps consecutive ids from `startId`, so a freshly created child's first
verification command is always `<!-- id=1 -->`, its second `<!-- id=2 -->`. Ids are allocated
per issue body; `nextVcId` is `highestVcId(body) + 1` and a new body's high-water mark is 0.

**What r2 asks for.** Each child's ACs cite the WBS-global verifier identity — `vc:19` for WBS 1,
`vc:20` for WBS 2, `vc:12` for WBS 21, `vc:17` for WBS 26, and so on. Those numbers are the plan's
verifier namespace, not the issue's.

**Result.** I audited all 26 children by counting each one's `Run:` commands against its cited ids.
**25 of 26 children cite at least one id that the created issue cannot carry.** Only WBS 4 works,
and only by coincidence: it cites `vc:1` and its single command renders as id 1. A sample of the
mismatches:

```
Task  1 cites vc:19      | local ids would be vc:1      | unresolvable: vc:19
Task  8 cites vc:18,vc:27| local ids would be vc:1,vc:2 | unresolvable: vc:18,vc:27
Task  9 cites vc:2,vc:27 | local ids would be vc:1,vc:2 | unresolvable: vc:27
Task 21 cites vc:12      | local ids would be vc:1      | unresolvable: vc:12
Task 26 cites vc:17      | local ids would be vc:1      | unresolvable: vc:17
```

**Failure mode, reproduced.** Rendering WBS 1's verification command and resolving its AC citation
against the rendered section:

```
- [ ] `node --test scripts/tests/unit/task-tracker/lib/guidance-legacy-inventory.test.mjs` <!-- id=1 -->
parsed ids: [ 1 ]
vc:19 => THROWS RangeError: vc-ref: cited entry vc:19 does not exist (no live Verification Commands entry carries id=1
vc:1  => RESOLVED 1 command(s)
```

`resolveVcListStrict` (`lib/vc-ref.mjs:92`) throws rather than degrading, by design, so this is a
hard failure at every consumer that resolves AC evidence — `ac-stamp`, the auto-tick path, and the
Develop-to-Test code-complete gate. It is not a cosmetic numbering mismatch; it makes the hydrated
children unworkable at their first evidence gate.

**Why it also matters for H3.** WBS 8's closure AC — the one that holds the NO-GO line — cites
`vc:27`. Until this is fixed, the strongest part of the feasibility containment cannot be stamped.

**Requested change.** Pick one and state it in the WBS, with the fragment shape spelled out:

1. **Renumber citations to local ordinals.** Each child's ACs cite `vc:1` (and `vc:2` for WBS 8 and
   WBS 9, in the order the commands appear in its fragment). Keep VC19–VC27 and VC1–VC18 as the
   cross-document verifier _names_ in prose — which is what "Root verifier identity: VC19" already
   provides — and stop using that namespace inside `vc-list`. This is the smallest change and
   matches how every existing issue in this repository cites its own commands.
2. **Give every child the same fragment ordering** so the mapping is mechanical and reviewable, and
   state it in the hydration procedure: one command per line, first line is the root verifier, WBS 8
   and WBS 9 list their second (VC27) command on line two.

Either way, add to hydration step 4 that `--verification-commands-file` takes **bare command text,
one command per line** — not the r2 child contracts' display prose, whose lines read
"Root verifier identity: VC19." and "Run: <backtick-quoted command>". `preflight-issue.mjs` splits
the fragment on newlines and wraps each non-empty line verbatim in backticks, so that prose would
be emitted as two VC entries, one of which is not a command. The existing instruction to "read the
rendered body back to verify stable IDs/citations" is right but currently underspecified: say that
the readback must confirm each AC's `vc-list` resolves, not merely that ids exist.

I am not asking for a code change. The repository's per-issue numbering is correct behavior; it is
the WBS's citation namespace that needs to match it.

## 4. Non-blocking findings

**R2-02 (Medium) — the coverage command hardcodes `activePlanKey: 'Source-plan'` and so does not
reproduce the real gate.** The embedded command calls
`selectDecompositionPlanSection({ body, planText, activePlanKey: 'Source-plan' })`. The repository
gate (`decomposition-delivery-readiness.mjs:57`) instead derives the key with
`linkedPlanReference(child.body)?.key`, which scans
`PLAN_METADATA_KEYS = ['Implementation-plan', 'Source-plan', 'Plan']` in order. I probed the
divergence:

```
PRECEDENCE competing Implementation-plan -> linkedPlanReference key=Implementation-plan, gate applied=false ok=true
```

So a child that also carries an `Implementation-plan` field resolves to that key, the section check
deactivates, and `evaluateSections` then records `has no bounded Source-plan-section` — the real
gate fails closed, but the hydration command, having hardcoded `'Source-plan'`, would have already
certified 26/26. The risk is small today because `preflight-issue.mjs` leaves Plan Metadata
"intentionally empty until planning" and r2 step 5 lists only `Source-plan*` and `Baseline-plan*`
fields. It is still worth closing: derive the key with `linkedPlanReference` and assert it equals
`'Source-plan'`, so hydration cannot certify a shape the Plan-exit gate will later reject. Note
that r2 step 2 already applies this reasoning to the parent — extend it to children.

**R2-03 (Medium) — scope the "all remain below both mandatory split thresholds" claim.** Twelve
retained children (WBS 9, 10, 12, 13, 14, 16, 19, 22, 23, 24, 25, 26) carry no pre-hydration hours
or unit count, which is correct and matches the baseline plan: only Tasks 1a, 1b, 4, 8, 10 and 12
required scrutiny before hydration. But the author response's M1 disposition reads "all remain below
both mandatory split thresholds," and r2's counting section implies the unlisted children are below
threshold. That can only be asserted for the estimated ones. Reword to say the ten estimated
children at or above the review threshold are retained with explicit decisions, and the twelve
unestimated retained children are sized at Refine under the same stop conditions.

**R2-04 (Low) — three assumptions in the coverage command are not verifiable offline.** I confirmed
every import resolves with the named export (`loadConfig`, `loadProjectFieldDefs`,
`projectValuesForIssue`, `readNativeDependencies`, `extractPlanTasks`,
`selectDecompositionPlanSection`, `reconcileWbsCoverage`), that `cfg.repo` is exactly
`kburson/ai-task-manager`, that `cfg.kanbanFieldId` exists so the `hydrationStatus` shim resolves,
that `rank`/`priority`/`size`/`estimate` are real field keys, and that
`normalizeDependencyConnection` returns a sorted array of issue numbers so the `blockedBy`
`deepEqual` has the right shape. What I could not verify without a live call: that
`repos/{repo}/issues/1558/sub_issues` returns `body`, `title` and `assignees` on each node, and that
`gh api --paginate --slurp` yields an array of page arrays for that endpoint. Both are load-bearing.
Suggest a note that the first live run is expected to be a dry verification, and that an unexpected
shape is a stop condition rather than something to patch mid-hydration.

**R2-05 (Low) — one retained body is not byte-identical, and that is fine, but say so precisely.**
I diffed all fourteen retained baseline bodies against the agreed plan: **thirteen are byte-identical
after normalization; WBS 9 differs by exactly three added lines** — the
`**Additional foundation entry acceptance criterion:**` heading, a blank line, and the VC27 entry
AC. The change is purely additive, with no baseline text removed or altered, and the author
disclosed it. I verified no title drift across all fourteen. Worth stating in the WBS itself as
"thirteen verbatim, one verbatim plus a disclosed additive entry criterion," so a later reader does
not have to re-derive it.

## 5. Checked and sound

- **No budget movement.** Fixed ceilings 5,000 / 300 / 500 / 7,000 and working maxima
  4,000 / 240 / 400 / 5,600 are restated unchanged, with an explicit statement that planning labor
  estimates do not change context budgets. B1 and B2 still ship together.
- **All original verifier identities survive.** VC1–VC18 appear across the 26 children; VC19–VC26
  are new stage verifiers and VC27 labels the existing foundation command rather than inventing a
  new gate. Verifier commands for the retained children match the agreed plan's exact strings.
- **Round-1 inputs preserved.** The superseded round-1 WBS is committed byte-identical to the
  reviewed hash; the agreed plan and ratified spec are untouched.
- **Formatting.** Prettier passes on the committed r2 bytes, checked directly with the ignore
  bypass.
- **Dependency graph.** Zero rank inversions, prerequisites for all 26 ranks match the stated
  contracts, and the numeric sequence is a valid rank under `evaluatePlanning`'s strictly-earlier
  rule.
- **Hydration mechanics from M5 are correctly adopted.** `npx aitm block <child> --by <list>` is the
  named dependency mechanism (`block` is in the registry `VERBS` set, verified), creation is
  explicitly said not to write edges or inherit priority, expected assignee is unset, Size and
  Estimate are omitted, rank equals the WBS sequence, and parent priority is read rather than
  assumed. The dry-run-first instruction and the duplicate-child guidance are both right.
- **My round-1 M4 concern is handled honestly.** Task 12 went from 40 to 44 hours, the two children
  disclose a two-hour margin under the mandatory threshold, and WBS 21 states that if a manual audit
  of distinct effect boundaries exceeds the envelope the answer is to split before implementation
  rather than reduce coverage. That is the right disposition for an estimate I could not disprove.

## 6. What would clear this review

R2-01 alone. Choose a citation scheme that a created issue can actually carry, spell out the
verification-commands fragment shape, and extend the readback instruction to assert that each AC's
`vc-list` resolves. R2-02 through R2-05 are worth folding into the same revision but would not hold
up acceptance on their own.

I did not invoke the peer-review skill, spawn reviewers, create issues, change workflow state, or
modify any plan, spec, WBS or issue.

**Reviewer verification for this response:** Prettier was run directly on these bytes with an
explicit empty ignore file, bypassing `.prettierignore`'s `docs/superpowers/reviews/` exclusion, and
markdownlint-cli2 was run on the same path. Both pass. The final hash is recorded after those
checks. See §1 for why the bypass is required here.
