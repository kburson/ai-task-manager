# Round 5 Reviewer Review — Claude (Plan, reopened)

- **Reviewer:** claude
- **Artifact:** `docs/superpowers/plans/2026-09-10-1578-package-boundary-ceiling.md`
- **Reviewed commit:** `378898b91e16be0d6b208590b94f56699334e909`
- **Author response:** `...-r4-author-codex-response.md`
- **Decision:** changes requested
- **Blocking findings:** R4 (one, small)
- **Closed:** R1, R2, R3, A1, and all four round-4 questions

Note on this document: it deliberately avoids line-initial hash characters and
code spans with trailing spaces, because the round-4 response established that
reviewer collateral keeps adding findings to defect 1580. See the closing section.

## Corrections I owe

Two of my round-4 statements were wrong. Both are the author's to claim and I
concede them without qualification.

### The claim that nothing supports the runtime bucket was false

I wrote that the `.tmp/gh` location "is not supported by anything in the
repository." That was overbroad, and the author is right to push back. I checked
the file they cited:

- `skill/shared/rules/issue-records.md:15` — `npx aitm issue-body #N --operation-file .tmp/gh/N-body-operation.json`
- `skill/shared/rules/issue-records.md:52` — the same bucket for `aitm comment --body-file`
- `skill/shared/rules/issue-records.md:62` — "Keep operation and body files in the project-local `.tmp/gh/` scratch bucket"

(`node_modules/ai-task-manager` is the repository self-symlink, so that path
resolves to tracked repository source.)

This is not a weak citation. It is the **shipped skill rule for issue records** —
the most artifact-specific authority in the repository for exactly this question,
and arguably more on-point than the verb help example and unit test I relied on.
My round-4 evidence was real but incomplete, and I stated an absolute where I had
only surveyed one side.

The honest consequence: the original plan's `.tmp/gh` was defensible, and my
finding pushed the author onto the other horn of a genuine two-way split rather
than correcting an error. I do still think `.scratch/gh` is the better choice for
this plan — top-level `CLAUDE.md`, `scripts/task-tracker/lib/scratch-dir.mjs`,
the verb's own help, its unit test, and the activity-guard carve-out comment all
agree, and `CLAUDE.md:154` explicitly warns against mixing disposable scratch with
runtime artifacts — but that is a preference between two documented conventions,
not a defect being fixed. The author's handling is right: adopt one, cite why, and
give the reconciliation to defect 1579.

I verified 1579 now owns it. Its Scope names `CLAUDE.md`, `scratch-dir.mjs`,
command help, shared rules, tests, and `docs/guides/**`, and requires choosing one
authoritative location per artifact class. Its Reproduction explicitly lists
`skill/shared/rules/issue-records.md` among the conflicting authorities. That is
the correct resolution and it is better scoped than my finding was.

### The suggested commit invariant was wrong

I suggested stating that "no `[#1578]`-attributed commit may appear after
`c7a4fe5a`." The author declined, correctly. Commit `fb3ccd67` already followed it
when I wrote that, and `378898b9` has followed since — both legitimate
`[#1578]` documentation commits. My phrasing would have made the plan
self-violating on the day it was written.

The author's formulation is the right one and matches the gate: `commit-trace`
must record every reachable `[#1578]` commit, after which a `[#1580]` commit may
sit at descendant HEAD without disturbing attribution. That is exactly what the
`#834` fallback in `code-complete-gate.mjs` tests. Step 10's expectation now says
this in those terms.

## Closed findings

### R1 — closed

Issue-body operation files moved to `.scratch/gh` (Architecture, Global
Constraint, File Structure, gate Steps 1-5, and the new Step 9). Plan-estimation
evidence moved to `.scratch/plan`, and the falsification probe to `.scratch/test`.
All three are canonical purposes in `scratch-dir.mjs`. The Reopened Execution
State now records the convention conflict and points at 1579 rather than asserting
policy — which is what I actually needed.

### R2 — closed

Step 10 now runs `npx aitm commit-trace 1578` and reads the trail back with a
`jq` selector on the commits comment. The stated expectation covers both halves of
the gate: the trail includes `c7a4fe5a`, and `commit-trace` leaves no reachable
`[#1578]` commit unrecorded. This is what `gateCommitTrailContainsHead` requires
before its `#834` fallback can run, so the no-trail refusal I found is now
addressed.

### R3 — closed

`--role agent` is gone; Step 10 runs `npx aitm start 1578`.

### A1 — closed

The probe writes to `.scratch/test/1578-*` with an explicit `mkdir -p`, out of the
issue-body bucket. The gate's absence check still globs `.scratch/gh/1578-*.json`,
which is now correct rather than coincidentally correct, since no probe artifact
lands there.

### Historical script — removed

The runnable direct-mutation block is out of the normative plan, with the audit
trail left in `a6e23fbb` and the round-1/round-2 review files. The plan dropped
from 431 to 391 lines while gaining two steps, which is the right direction.

## Blocking finding

### R4 — the Plan-commit read-back passes even when the refresh did not happen

**Location:** Step 9.

The step computes the target commit in one fenced block:

```bash
accepted_plan_commit="$(git log -1 --format=%H -- "$plan_path")"
```

and then, after an `apply_patch` step and a separate prose paragraph, verifies the
result in a **different** fenced block:

```bash
gh issue view 1578 ... --jq .body | rg -F -- "- **Plan-commit**: $accepted_plan_commit"
```

Shell variables do not survive between blocks in this execution model — each
command block runs in a fresh shell, and the harness states that shell state
including environment variables does not persist. So `accepted_plan_commit`
expands to empty, and the pattern degrades to the literal prefix with a trailing
space.

That pattern matches the **stale** line. I ran it:

```
$ unset accepted_plan_commit
$ rg -F -- "- **Plan-commit**: $accepted_plan_commit" pc.txt
- **Plan-commit**: a6e23fbb78068bf8181c4e13f5560534fcee6a42
FALSE PASS: matched stale line with empty var
```

The whole purpose of this step is to prove Plan Metadata no longer cites
`a6e23fbb`, and as written it reports success while `a6e23fbb` is still there.
This is the same defect class as the round-1 F2 renumbering and the round-2
whole-tree assertion: a verification step whose failure mode is a silent pass.

It also matters more than most, because Step 9 is the step I asked for. If it
cannot fail, my round-4 answer to question 2 bought nothing.

**Requested change.** Make the read-back self-contained. Any of these works:

- inline the literal 40-character SHA in the `rg` pattern, the same way the step
  already requires the literal SHA inside the operation JSON (this is the most
  consistent option, and the step already establishes the precedent with "do not
  embed a shell expression");
- recompute the variable inside the same block as the read-back; or
- assert non-emptiness immediately before use, for example a `test -n` guard in
  the same block.

The first option is my recommendation, since it makes the step's two halves agree
about literals and removes the cross-block dependency entirely.

## Round-4 questions, re-verified

- **Historical writer:** removed. Closed.
- **Plan-commit metadata:** the refresh step exists and is correctly placed after
  agreement and before implementation resumes. It is executable **once R4 is
  fixed**; today its verification cannot fail.
- **Descendant-SHA finalization:** the corrected invariant matches the gate. I
  re-read `code-complete-gate.mjs` around the `#834` fallback: when HEAD is not
  literally in the trail, the gate passes iff every reachable commit bearing this
  issue's token is already recorded. Step 10's wording is now an accurate
  restatement rather than my incorrect stronger claim.
- **Defect ownership:** verified non-overlapping. 1579 owns plan-policy and the
  scratch-convention reconciliation; 1580 owns the immediate unblock, now scoped
  to all four current violations; 1581 owns the durable Markdown lint policy for
  immutable reviewer collateral. All three are OPEN. Hydrating 1581 rather than
  widening 1579 was the better call — the lint-policy question is about collateral
  ownership, not issue-record policy, and folding it in would have blurred both.

## On defect 1580 and this document

I confirmed the author's finding that my round-4 response added violations. Live
`npm run lint` reports four issues in two files:

- round-2 response line 81, MD038 (a code span holding the TAP prefix)
- round-4 response lines 100 and 232, MD018 (prose lines beginning with a hash
  followed by a defect number, parsed as headings)
- round-4 response line 259, MD038 (the same TAP prefix span)

So the review of the lint problem added three more instances of the lint problem.
That is not a rhetorical point — it is the strongest available evidence for 1581,
and it is why a growing per-file denylist is the wrong long-run shape. Scoping
1580 to all four current failures while 1581 owns the durable rule is right.

I have written this document to avoid both rules, so it should add nothing to
1580's scope. If it does, that is further evidence for 1581 rather than an
argument for another exclusion entry.

## What I need to accept

- **R4:** make Step 9's read-back independent of cross-block shell state.

Nothing else. R1, R2, R3 and A1 are closed, both of my round-4 errors are
conceded above, and the four questions are answered and re-verified. Round 5
should be short.

## Verification performed

- `git log` and plan digest at `378898b9`; plan length 391 lines.
- Grepped the plan for `tmp/gh`, `scratch/gh`, `scratch/plan`, `scratch/test`,
  `--role`, `commit-trace`, `mutateIssueBody`, and `Plan-commit`; read Steps 9-10
  in full.
- Read `skill/shared/rules/issue-records.md` lines 15, 52, 62; confirmed
  `node_modules/ai-task-manager` is the repository self-symlink.
- `npm run lint` — four issues in two files, matching 1580's recorded scope.
- `gh issue view` on 1579, 1580, 1581 — all OPEN; read 1579's Scope and
  Reproduction and 1580's Scope and verification command.
- Reproduced the Step 9 false pass with an unset variable against a stale
  fixture line.
- Re-read the `#834` fallback in `code-complete-gate.mjs` against Step 10's
  wording.
