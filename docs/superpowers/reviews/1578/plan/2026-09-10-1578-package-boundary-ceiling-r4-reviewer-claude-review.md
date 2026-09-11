# Round 4 Reviewer Review — Claude (Plan, reopened)

- **Reviewer:** claude
- **Artifact:** `docs/superpowers/plans/2026-09-10-1578-package-boundary-ceiling.md`
- **Reviewed commit:** `fb3ccd6771e58765fa525173827b1d3a556d8a3c`
- **Previously accepted at:** `a6e23fbb78068bf8181c4e13f5560534fcee6a42`
- **Implementation commit under recovery:** `c7a4fe5a38d5a97809068cd1a6f183ed6d91e553`
- **Author handoff:** `...-r4-author-codex-reopen-handoff.md`
- **Decision:** changes requested
- **Blocking findings:** R1, R2, R3
- **Advisory findings:** A1

## Scope of review

Re-review of the amended plan against the current repository rules and the live
execution state. Reopening from terminal agreement was the right call — execution
falsified assumptions that neither of us tested in rounds 1-3, and my r2
acceptance covered a plan whose workflow scaffolding was wrong. I hold no
position that the earlier acceptance protects.

No plan or implementation file was edited. All findings below were executed, not
inferred.

## Verified correct

1. **The execution ledger is accurate.** `git diff-tree --no-commit-id
   --name-only -r c7a4fe5a` returns exactly
   `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` — the
   one-file boundary holds.
2. **The lint failure is exactly as reported.** `npm run lint` reproduces one
   issue across 478 files: `MD038/no-space-in-code` at
   `docs/superpowers/reviews/1578/plan/...-r2-reviewer-claude-review.md:81:31`,
   context `` `ok ` ``. Line and rule match the ledger precisely.
3. **Both defects exist.** #1579 ("Ratified plans can bypass governed
   issue-record policy") and #1580 ("Immutable reviewer response blocks Develop
   finalization on MD038") are OPEN.
4. **The Step 9 blocker probe works.** I ran the jq selector against #1580: it
   returns `Backlog`, so `test "$(...)" = Done` correctly fails today and will
   correctly pass when #1580 closes. The `projectItems` shape (`.title`,
   `.status.name`) is what `gh` actually emits.
5. **`plan-estimate --evidence-file` is real** and consumes
   `aitm.plan-estimation-input/v1` — matching the plan's JSON `schema` field
   exactly. `aitm issue-body --operation-file` is real and consumes
   `aitm.issue-body-operation/v1`.
6. **The `rm -f` → Node `unlinkSync` substitution preserves probe semantics**,
   and `.tmp/**` is carved out by `activity-guard.mjs:151-152`, so the relocated
   falsification probe is functional.
7. **Marking completed steps `[x]` with an explicit "must not be replayed"
   instruction is the right structure** for a recovery amendment.

## Blocking findings

### R1 — The issue-record diagnosis is half right: the mechanism was wrong, the location was not

**Location:** Architecture paragraph, Global Constraints bullet 8, File Structure,
gate Steps 2 and 4.

The amendment states that "Current AITM policy requires `npx aitm issue-body`
operation files under `.tmp/gh`" and encodes `.tmp/gh` as a Global Constraint.

The first half is correct and the fix is right: a one-off `.scratch/gh` script
calling `mutateIssueBody` directly bypasses the governed verb, and
`npx aitm issue-body --operation-file` is the canonical path. I accept that
entirely, and I should have caught it in round 1.

The second half is not supported by anything in the repository. Every authority I
can find puts issue-body operation files under **`.scratch/gh/`**:

- `CLAUDE.md:153` — "Disposable scratch and staging files go in `./.scratch/`
  ... under a purpose subfolder such as `gh/`, `plan/`, `heal/`, or `inspect/`."
- `CLAUDE.md:154` — `.tmp/` is for "machine-local runtime state and generated
  output", and explicitly: "do not ... confuse disposable `.scratch/` work with
  runtime `.tmp/` artifacts." The amendment does exactly what that sentence
  forbids.
- `scripts/task-tracker/lib/scratch-dir.mjs` — "the canonical buckets are:
  `test`, `gh`, `plan`, `heal`, `inspect`", resolved under
  `<projectDir>/.scratch/<purpose>/`.
- `npx aitm issue-body --help` — its own worked example is
  `/task issue-body 667 --operation-file .scratch/gh/667-body-operation.json`.
- `scripts/tests/unit/task-tracker/verbs/issue-body.test.mjs:15` — the verb's
  unit test parses `.scratch/gh/op.json`.
- `scripts/task-tracker/activity-guard.mjs:145` — the carve-out comment names
  "`.scratch/gh/` (issue body scratch)" as its first example.

`.tmp/gh` is not *blocked* — `activity-guard.mjs:151-154` carves out both
`.tmp/**` and `.scratch/**`, so the executed run worked. It simply is not the
convention, and the plan asserts it as settled policy while citing nothing.

**In fairness, the repository is genuinely inconsistent here.** `docs/guides/workflow.md:72`,
`docs/guides/ai-value-framework.md:243-247`, and
`docs/guides/cloud-development-environments.md:47-50` all use `./.tmp/gh/` for
`create-issue` section files, which `CLAUDE.md` would place under `.scratch/plan/`.
So `.tmp/gh` has real precedent — for a different artifact class. That
inconsistency is worth fixing, but a recovery amendment for an unrelated defect is
the wrong place to pick a winner, and picking the side that contradicts the verb's
own documentation is the wrong winner.

**Requested change.** Change the Global Constraint and File Structure to
`.scratch/gh/`, matching the verb's documented example. Then add one line to
#1579's scope: the systemic work must reconcile the `.tmp/gh` vs `.scratch/gh`
split across `docs/guides/**` and `CLAUDE.md`, rather than leaving two conventions
and a plan-level constraint that cements the undocumented one. Getting this wrong
in #1579 propagates the error into framework policy, which is a much more
expensive place to be wrong than in one plan.

### R2 — Step 9 cannot reach promotion: #1578 has no commit trail

**Location:** Task 1 Step 9.

Step 9 ends by reporting `CODE_COMPLETE` and handing promotion to the
orchestrator. Promotion (develop → test) runs
`develop-exit-commit-trail-head` → `gateCommitTrailContainsHead`
(`scripts/task-tracker/lib/code-complete-gate.mjs:118`), which requires a
`### 🔗 Commits` comment on the issue.

I listed #1578's comments. They are: the timing log, four AITM transition
provenance comments, the refined-estimate comment, one `aitm-record` comment, and
`### 🔒 Native dependency #1580 added`. **There is no `### 🔗 Commits` comment.**

So the gate returns, before any HEAD or descendant logic executes:

```
develop-to-test-no-trail: no `### 🔗 Commits` comment found — run `/task commit-trace` first
```

Neither the original plan nor this amendment ever runs `commit-trace`. Task 1
Step 8 commits and Step 9 finalizes; the trail is simply never created. This is
not a consequence of the #1580 detour — it was missing from the plan I accepted in
round 2, and I did not catch it.

**Requested change.** Add `npx aitm commit-trace 1578` to Step 9 after the
blocker clears and before `CODE_COMPLETE` is reported, and state the expectation:
the `### 🔗 Commits` trail records `c7a4fe5a`. This also happens to be the
precondition that makes the descendant-SHA design in question 3 work at all — see
below.

### R3 — `npx aitm start 1578 --role agent`: `--role` does not exist

**Location:** Task 1 Step 9, second command.

`verbStart` (`scripts/task-tracker/verbs/start.mjs:7-18`) reads only
`ctx.rest[0]`, validates it as an issue number, and delegates to `verbResume`.
The documented usage is `/task start <N> [--confirm-relocation]`. There is no
`--role` handling anywhere in the verb.

The flag is therefore **silently ignored** rather than rejected — which is the
worse outcome. The step will appear to succeed while documenting a capability
that does not exist, and a future reader will reasonably conclude that roles are
being set on the binding.

**Requested change.** Drop `--role agent`. If a role concept is actually needed
here, name the verb that provides it; if not, `npx aitm start 1578` is the
correct command.

## Answers to the four review questions

### Is retaining the obsolete writer safe, or should it be removed?

**Remove it,** or reduce it to a citation. Three reasons:

1. It is ~90 lines of complete, runnable JavaScript in a fenced ```js block,
   inside a document whose header instructs agentic workers to execute the plan
   task-by-task. The "**Do not create or execute it.**" label is prose sitting in
   front of a working script. This repository already knows this failure mode
   from the other direction — an illustrative `- [ ]` line in a deep dive becomes
   a real checkbox, and an example `##` heading swallows a section. Executable
   examples that must not execute are a standing hazard here.
2. The audit value is already preserved twice over, immutably: the script is in
   git history at `a6e23fbb`, and it is quoted verbatim in the round-1 and
   round-2 review record in this directory. Keeping a third copy in the live
   normative plan buys nothing.
3. It is now the single largest block in the amendment, which pushes the actual
   recovery instructions below a wall of superseded code.

Recommend replacing the whole block with one sentence citing `a6e23fbb` and the
r1/r2 review files. If the author still wants it inline, it should be visibly
non-runnable — an indented text block rather than a ```js fence.

### May the original accepted Plan commit remain in live Plan Metadata during review?

**Yes during review; no once this amendment is accepted.** Nothing enforces it
either way: `plan-exit-plan-metadata-guard.mjs:14-19` requires only that at least
one substantive `Plan Metadata` field is not a provenance key
(`STORY_ORIGIN_PROVENANCE_KEYS` in `story-origin.mjs:13` — `kind`,
`discovered-during`, `related`, `blocks`, `parent`, ...). `plan-commit` is not a
provenance key and its *value* is never validated, so `a6e23fbb` passes the gate
regardless.

Right now `a6e23fbb` is *accurate*: it is the commit that was approved. It
becomes *wrong* the moment this amendment is accepted, because the durable record
would then cite a plan text that no longer governs the work — and the whole point
of that field is post-hoc provenance.

**Requested addition.** One explicit step, after acceptance and before
implementation resumes: update `Plan-commit` to the accepted amendment commit via
a single `aitm issue-body` operation. Since no guard will catch this, the plan is
the only place it can be caught.

### Does descendant-SHA finalization preserve #1578 attribution and provenance?

**Yes — and the specific risk you were guarding against is already solved
upstream.** I went looking for a blocker here and did not find the one I expected.

`gateCommitTrailContainsHead` has a `#834` carve-out
(`code-complete-gate.mjs:196-230`) written for exactly this scenario. Its comment:

> HEAD is not literally in the trail. On a shared trunk this is the norm, not a
> defect: a *sibling* issue's commit (or an unattributed commit) can become HEAD
> while THIS issue added no new commit in its resumed Develop visit.

When HEAD is not in the trail, the gate passes **iff** every commit reachable from
HEAD bearing this issue's `[#1578]` token is already recorded in the trail. A
`[#1580]` remediation commit becoming HEAD is precisely that case. Combined with
the repository's message-based attribution contract (`[#N]` token grep, not
SHA-reachability), `c7a4fe5a` retains its #1578 provenance no matter what sits on
top of it.

So the descendant-SHA design is sound and I withdraw any objection to it. The one
caveat is R2: that fallback only executes **after** a trail exists, and #1578 has
none. Fix R2 and this question resolves cleanly.

One wording note: Step 9's expectation says finalization "exits 0 at the current
clean descendant SHA." Worth stating explicitly that the descendant is expected to
be a `[#1580]`-attributed commit and that no `[#1578]`-attributed commit may
appear after `c7a4fe5a` — that is the actual invariant the #834 fallback depends
on, and it is currently implicit.

### Does the #1579/#1580 split correctly separate systemic from immediate work?

**The axis is right; the coverage has a hole.** Splitting systemic plan-policy
prevention (#1579) from the immediate blocker (#1580) is correct, and adding
#1580 as a native blocker rather than working around the lint failure is the right
discipline.

But #1580 as scoped is the **fourth** instance of one class.
`.markdownlint-cli2.jsonc` already carries three per-file exclusions for exactly
this:

```
"docs/superpowers/reviews/1381/plan/...-r3-reviewer-claude-review.md",
"docs/superpowers/reviews/1219/plan/...-r7-reviewer-claude-review.md",
"docs/superpowers/reviews/1219/spec/...-r5-reviewer-claude-review.md",
```

Adding a fourth hand-maintained entry means the denylist grows once per peer
review that happens to contain a code span with a trailing space, a bare URL, or
any other rule that ordinary prose trips. The systemic problem — immutable,
byte-preserved reviewer collateral is linted as though it were authored repository
content — is owned by neither defect, since #1579 is scoped to issue-record
policy.

**Recommend** either widening #1579 to cover it, or filing a third defect for a
directory-level rule (for example, ignoring
`docs/superpowers/reviews/**/*-reviewer-*.md`, or relaxing the specific rules that
collide with quoted tool output). #1580 should then be explicitly the one-off
unblock, with the durable fix referenced.

For the record: the MD038 is in my own round-2 response. The `` `ok ` `` span
deliberately carries the trailing space because it quotes the TAP prefix `ok ` I
was distinguishing from `✔`. It is content, not sloppiness — and the
byte-preservation convention for reviewer collateral is exactly what makes it
unfixable in place. That is the argument for a durable rule rather than a fourth
exclusion.

## Advisory

### A1 — The falsification probe now shares the issue-body operation bucket

Task 1 Step 5 writes `.tmp/gh/1578-peer-review-adapter.falsification.mjs` and
`.tmp/gh/1578-required-entry-falsification.txt`, while File Structure defines
`.tmp/gh/1578-*.json` as "canonical issue-body operation files." Two unrelated
artifact classes now share one bucket.

Related: gate Step 4's absence check globs `1578-*.json`, so it structurally
cannot observe the probe's `.mjs`/`.txt` files. That is fine today and brittle if
the probe ever emits JSON. A distinct purpose bucket for the probe removes both
concerns. Non-blocking, and it interacts with R1 — settle the location question
first.

## What I need to accept

- **R1:** use `.scratch/gh/` for issue-body operation files, and note the
  `.tmp/gh` vs `.scratch/gh` reconciliation in #1579's scope.
- **R2:** add `commit-trace` to Step 9 so a `### 🔗 Commits` trail exists before
  promotion.
- **R3:** drop the non-existent `--role agent` flag.

A1 is advisory. The four questions are answered above; the recommendations under
questions 1, 2 and 4 (remove the historical script, add a Plan-commit refresh
step, widen the systemic lint scope) are ones I would like to see adopted but am
not treating as acceptance gates.

## Verification performed

- `git diff-tree` on `c7a4fe5a`; `git log --oneline -6`; confirmed clean worktree.
- `npm run lint` (478 files, one MD038 at the reported line/column).
- `gh issue view` on 1578 (comment inventory), 1579, 1580 (state, project item),
  and the Step 9 jq selector executed verbatim.
- Read `code-complete-gate.mjs:118-230` (`gateCommitTrailContainsHead`, #834
  fallback) and `develop-exit-commit-trail-head-guard.mjs`.
- Read `plan-exit-plan-metadata-guard.mjs` and `story-origin.mjs`
  (`STORY_ORIGIN_PROVENANCE_KEYS`).
- Read `verbs/start.mjs` in full (19 lines) and `aitm start`/`issue-body`/
  `plan-estimate` help output.
- Read `activity-guard.mjs:128-155` carve-outs, `scratch-dir.mjs` header,
  `.markdownlint-cli2.jsonc`, and grepped `.tmp/gh` vs `.scratch/gh` across
  `scripts/` and `docs/guides/`.
