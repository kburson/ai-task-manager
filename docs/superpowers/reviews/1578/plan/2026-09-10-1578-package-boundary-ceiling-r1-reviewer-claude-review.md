# Round 1 Reviewer Review — Claude (Plan)

- **Reviewer:** claude
- **Artifact:** `docs/superpowers/plans/2026-09-10-1578-package-boundary-ceiling.md`
- **Reviewed commit:** `5cebee71f01e07301275a5711ec2eb397ae48ab2`
- **Governing spec:** `...-1578-package-boundary-ceiling-design.md` accepted at `4e96a7a8`
- **Worktree:** `.worktrees/ai-peer-review-design` (branch `codex/ai-peer-review-design`), Node v25.6.0
- **Decision:** changes requested
- **Blocking findings:** F1, F2, F3
- **Advisory findings:** F4, F5, A1

## Scope of review

Independent review of the implementation plan against the ratified spec, the live
`#1578` issue body, and the codebase. No plan, spec, or implementation file was
edited. Every executable claim in the plan was run or statically verified.

## Verified correct

I ran the plan's own commands rather than reading them. The following all hold,
and several are the kind of thing that is usually wrong in a plan of this shape:

1. **All five `expected` strings in the alignment script match the live body
   exactly once.** I fetched `#1578` (`gh issue view 1578 --json body`) and ran a
   matcher over the five literals. Result: `scope: 1`, `fix-direction: 1`,
   `deep-dive-file: 1`, `deep-dive-steps: 1`, `acceptance-criterion: 1`. The
   `replaceExactlyOnce` guard will pass for all five. This is the highest-risk
   part of the plan and it is correct.
2. **The heredoc Node snippet works verbatim.** I was ready to flag
   `require('node:child_process')` in a `"type": "module"` repo. It is fine —
   `node -` treats stdin as CommonJS regardless of the nearest `package.json`
   type. I ran the Task 1 Step 1 block unmodified and got exactly
   `{"count":779,"adapter":true}`. Note also that `npm pack` runs the `prepare`
   script (`ensure-self-link.mjs`), whose output goes to **stderr**, so
   `JSON.parse` on stdout is not corrupted. Both hazards are real and both are
   already handled.
3. **`verify-develop.mjs` supports both invoked modes.** `parseArgs`
   (`scripts/task-tracker/verify-develop.mjs:378-386`) accepts `--mode` and
   `--issue`; `runDevelopVerification` validates `['iteration','final']` at
   line 175 and requires `--issue` in final mode (`issue-required`, line 274).
   The project CLAUDE.md documents only the bare invocation, so I checked rather
   than assumed. I ran `--mode iteration` at the base: exit 0,
   `verify-develop: iteration checks passed`.
4. **All three governed verbs exist:** `verbs/plan-approve.mjs`,
   `verbs/promote.mjs`, `verbs/status.mjs`. Using `promote` rather than a bare
   action verb is the correct call.
5. **Repository slug is right.** `origin` is
   `git@github.com:kburson/ai-task-manager.git`, matching the `repo` argument.
6. **The scratch import path resolves.** From `.scratch/gh/`,
   `../../scripts/task-tracker/lib/issue-body-mutate.mjs` lands on the repo-root
   module. `replacements.reduce(replaceExactlyOnce, base)` is also correct —
   `reduce`'s extra `index`/`array` arguments are harmlessly ignored by the
   two-parameter function.
7. **The implementation base is as the plan asserts.** Tree clean; packed
   manifest 779 with the adapter present; `git merge-base --is-ancestor
   311cef526 HEAD` exits 0.
8. **Cited line numbers are usable** (see A1).

The plan correctly routes the body write through `mutateIssueBody`, carries no
full-body snapshot, and keeps the tracked diff to a single file. Those are the
right decisions.

## Blocking findings

### F1 — The alignment script's success signal does not exist

**Location:** Pre-Implementation Gate, Step 2 (script) and Step 3 (expectation).

The script logs `result.status` and Step 3 states: "Expected: the script reports
`updated` with a new integer body version."

`mutateIssueBody` never returns `updated`. It is a pass-through to
`versionedWriteBody`, and its own header documents the contract at
`scripts/task-tracker/lib/issue-body-mutate.mjs:34-35`:

> Returns the same shape as `versionedWriteBody`:
> `{ status: 'ok' | 'no-op', attempts, version, body }`

So a successful write prints `1578-align: ok version=<n>`. An agent following the
plan literally sees `ok`, does not see the documented `updated`, and must decide
on its own whether the gate passed — on a step that mutates governed GitHub
authority. That is exactly where a plan should not require improvisation.

**Requested change.** State the expectation as `ok` with a new integer version,
and say explicitly what `no-op` means here: the body already matched, which
after a successful first run is the idempotent-rerun signal rather than a
failure. Both statuses are worth naming, since Step 3 may legitimately be re-run.

### F2 — The deep-dive renumbering collides with the existing step 6

**Location:** Pre-Implementation Gate, Step 2, `deep-dive-steps` replacement; and
the Step 3 read-back expectation.

The live `#1578` deep dive has **six** numbered steps, at body lines 64-69:

```
1. Preserve the current focused 5/6 result as RED at the dispatched HEAD.
2. Add #1578 to the test file's existing `@story` line ...
3. Extend the ceiling history ...
4. Change only `ENTRY_CEILING` from 778 to 779. ...
5. Re-run the focused package-boundary file ...
6. Run the governed Develop iteration verifier, commit only the guard file under
   #1578, finalize Develop at exact SHA, then use the normal sandbox Test and
   independent review gates.
```

The replacement consumes steps 3-5 and emits steps 3-6, inserting the adapter
assertion as the new step 4. It does **not** touch the existing step 6, which
remains in the body immediately after the new step 6. The post-mutation body
therefore reads `... 4. 5. 6. 6.` — seven items with a duplicated ordinal and a
now-misnumbered tail.

Consequently Step 3's expectation — "the deep-dive sequence has six steps
including the adapter assertion" — is unsatisfiable: it will have seven items, and
the read-back check as written cannot pass. A verification step that cannot pass
is worse than no verification step, because the natural recovery is to wave it
through.

Markdown renderers renumber ordered lists on display, so this may look fine in
the GitHub UI while the raw body — which is what the mutator, the gates, and the
next `expected` literal all operate on — is corrupted. That is the harder failure
mode to notice.

**Requested change.** Extend both `expected` and `replacement` to include the
existing step 6, renumbering it to 7 in the replacement, and restate the Step 3
expectation as seven steps. Since `replaceExactlyOnce` demands exactly one match,
the extended `expected` must be byte-exact against body lines 66-69; the current
three-line literal already matches once, so appending the fourth line is a safe
extension.

### F3 — Nothing proves the new required-entry assertion actually bites

**Location:** Task 1, Steps 2-5.

The RED/GREEN evidence covers only the count case: Step 2 reproduces
`packed entry count 779 exceeds ceiling 778`, Step 4 shows six green. But the
required-entry addition — the whole substance of spec finding R1 — passes at the
base **and** passes after the change, because the adapter is already packed. It
never goes red. The plan therefore ships an assertion whose effectiveness is
asserted, not demonstrated.

This matters more than it usually would. R1 exists because the count case alone
fails open: remove the adapter and the surface drops to 778, which is `<= 779`,
so the guard goes green while the distribution contract breaks. I verified that
this is exactly what happens — I moved the adapter aside and re-measured:

```
count without adapter: 778
```

779 → 778 with the adapter gone. Under the new ceiling that is a silent pass. The
only thing standing between that and a real regression is the new required-entry
assertion, and the plan never tests it.

**Requested change.** Add a falsification step between Step 4 and Step 5:

1. move `scripts/task-tracker/lib/peer-review-adapter.mjs` aside (outside the
   package-eligible tree — `.scratch/` is gitignored and works);
2. run the focused test and require that
   `package-boundary: runtime entry points are still shipped` **fails** naming
   the adapter, while the count case **passes** at 778 — proving both that the
   new assertion bites and that the count case alone would not have caught it;
3. restore the file and require `git status --short` to print nothing before
   continuing.

I ran the measurement half of this and the tree returned clean, so the step is
cheap and safe. This is not gold-plating: it is the difference between "we added
a line to an array" and "we demonstrated the failure mode R1 identified is now
caught."

## Advisory findings

### F4 — Gate Step 4's cleanup check verifies nothing

Step 4 deletes `.scratch/gh/1578-align-body.mjs`, runs `git status --short`, and
expects "the temporary script is absent and Git reports no change."

`.scratch/` is gitignored — `git check-ignore -v .scratch/gh/x.mjs` reports
`.gitignore:7:.scratch/*`. `git status --short` cannot show that file whether it
was deleted or left in place, so the command proves nothing about absence. The
second half of the expectation (no tracked change from the body alignment) is
real and worth keeping; the first half is a false positive by construction.

In a repo whose standing rule is never to fabricate evidence for a gate, a check
that always passes is worth correcting on principle even though the underlying
action is harmless. Recommend `test ! -e .scratch/gh/1578-align-body.mjs` (or
`ls .scratch/gh/`) for the absence claim, keeping `git status --short` for the
tracked-tree claim.

### F5 — Global Constraints contradict themselves on the required-entry list

Bullet 3 says "Do not change ... existing package-boundary assertions." Bullet 4
says "Add only `scripts/task-tracker/lib/peer-review-adapter.mjs` to the required
runtime-entry list." Adding to the array *is* a change to an existing assertion,
so the two bullets conflict on a literal reading.

The accepted spec already has the precise formulation, adopted in its Preserved
Boundaries after review round 1: any existing required runtime-entry assertion
must not be weakened or removed, but the list may be extended with the `#1546`
adapter. Recommend importing that wording so the constraint list cannot be read
as forbidding the plan's own Task 1.

### A1 — Line references are usable; one is slightly off (no change required)

- `:1` — exact (`// @story #551 #1279 #1497 #1501`).
- `:116-121` — the `#1562` note occupies 116-119 and `ENTRY_CEILING` is at 120.
  Correct, with one trailing blank line included.
- `:204-218` — the required-entry test spans 202-219 and its array literal spans
  204-215. The cited range covers the array; it starts inside the test rather
  than at its declaration. Harmless.

No action needed. Recorded so a later reader does not mistake the small offsets
for drift.

## Summary of what I agree with

- The task decomposition: one authority gate, one implementation task, no new
  test file.
- Routing the body write through `mutateIssueBody` with exact-once replacements
  and no full-body snapshot.
- The RED-before-GREEN ordering for the count case.
- The clean-base preconditions and the exact-SHA finalization.
- The constraint that `#1578` never integrates independently of `#1546`.
- Leaving promotion, Test, review, delivery, and close to the orchestrator.

## What I need to accept

- **F1:** correct the expected status to `ok`, and state what `no-op` means.
- **F2:** extend the `deep-dive-steps` replacement to absorb and renumber the
  existing step 6, and restate the read-back expectation as seven steps.
- **F3:** add a falsification step proving the required-entry assertion fails when
  the adapter is absent while the count case passes at 778.

F4, F5 and A1 are advisory and do not gate acceptance.

## Verification performed

- Ran the Task 1 Step 1 heredoc verbatim: `{"count":779,"adapter":true}`.
- Fetched the live `#1578` body and matched all five `expected` literals: one
  match each.
- Enumerated the live deep-dive steps: six, numbered 1-6 at body lines 64-69.
- Read `mutateIssueBody`'s signature and documented return contract.
- Read `verify-develop.mjs` `parseArgs` / mode validation; ran `--mode iteration`
  at the base (exit 0).
- Confirmed `plan-approve`, `promote`, `status` verbs exist.
- Confirmed `origin` slug matches the `repo` argument.
- Measured the packed surface with the adapter removed: 778. Restored; tree clean.
- Confirmed `.scratch/*` is gitignored at `.gitignore:7`.
