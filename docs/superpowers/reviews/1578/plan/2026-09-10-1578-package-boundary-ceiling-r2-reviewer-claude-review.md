# Round 2 Reviewer Review — Claude (Plan)

- **Reviewer:** claude
- **Artifact:** `docs/superpowers/plans/2026-09-10-1578-package-boundary-ceiling.md`
- **Reviewed commit:** `a6e23fbb78068bf8181c4e13f5560534fcee6a42`
- **Prior round:** `...-r1-reviewer-claude-review.md` / `...-r1-author-codex-response.md`
- **Decision:** accepted
- **Blocking findings:** none
- **Advisory findings:** A2 (portability note on `rg`)

## Scope of review

Re-review of the revised plan against the Round 1 response, the live `#1578`
body, and the codebase, in `.worktrees/ai-peer-review-design` on Node v25.6.0. No
plan or implementation file was edited. As in Round 1 I executed the plan's
claims rather than reading them.

## Agreed — resolved findings

### F1 — Resolved, and improved beyond what I asked for

The expectation is now `ok`, which matches the documented contract. More
importantly, the author did not simply reword the expectation: they identified
that my suggested fix was itself unsound. I asked for `no-op` to be documented as
the idempotent-rerun signal, but under the original `replaceExactlyOnce` a rerun
would have thrown `expected one match, found 0` — the script was not idempotent,
so documenting a rerun status would have described behavior that could not occur.

`replaceOrConfirm` fixes the underlying property instead: it accepts either
`old=1,new=0` (apply) or `old=0,new=1` (already applied), and throws on any other
combination, so the guard against partial or ambiguous state is preserved. That
is a strictly better resolution than the one I proposed, and the author is right
to have corrected me.

I verified the `no-op` claim is real rather than assumed. `versionedWriteBody`
short-circuits at `scripts/task-tracker/lib/versioned-issue-write.mjs:365-367`:

```js
if (stripVersion(ourLocal) === ourBase) {
  return { status: 'no-op', attempts, version: remoteVersion, body: remote };
}
```

An unchanged mutate on the first attempt returns `no-op` without pushing a
version-bump edit. So Step 3's two-run sequence genuinely demonstrates
`ok` then `no-op`.

### F2 — Resolved

The `deep-dive-steps` transformation now consumes the existing step 6 and emits
it as step 7, and the read-back expectation says seven steps.

I re-ran the exact-match check against the live body with the extended four-line
literal: **one match**. So `replaceOrConfirm`'s `old=1,new=0` branch is satisfied
and the renumbering collision is gone.

### F3 — Resolved, and my restoration assertion was wrong

The falsification probe is present as Task 1 Step 5 and does what R1 asked: it
moves the adapter into ignored scratch, requires a nonzero focused run, requires
the count case to pass at 778 under the new 779 ceiling, requires the
required-entry case to fail naming the adapter, and restores under a trap.

**I concede the correction.** My Round 1 wording asked for `git status --short`
to print nothing after restoration. That is wrong: at Step 5 the package-boundary
test is intentionally modified, so a clean whole tree is unachievable and the
assertion would have been unsatisfiable — the same defect class as F2, which I had
just raised. The author's substitution is the correct one: prove
`git diff --quiet -- "$adapter_path"` (the moved file is byte-identical),
prove both probe files are absent, and require `git status --short` to name only
the intended test modification. Scoped restoration evidence, not whole-tree.

I verified the probe is executable as written, because three things in it could
plausibly have failed and none do:

1. **Reporter format.** `rg -F '✔ ...'` / `'✖ ...'` depends on `node --test`
   emitting spec-style marks. Node's default reporter is documented as `spec` on
   a TTY and `tap` otherwise, and the probe redirects to a file — non-TTY, which
   under the documented rule would produce `ok 1 -` / `not ok 6 -` and match
   nothing. I tested it: redirecting to a file on Node v25.6.0 still yields
   `✔`/`✖` (5 `✔` lines, 0 `ok ` lines). The patterns match.
2. **The assertion message text.** I simulated the failing required-entry case in
   a scratch test and confirmed the reporter renders
   `AssertionError [ERR_ASSERTION]: required runtime file missing from package: scripts/task-tracker/lib/peer-review-adapter.mjs`,
   so the third `rg -F` pattern matches. The `✖ package-boundary: runtime entry
   points are still shipped` line appears twice (inline and in the failing-tests
   summary); `rg` exits 0 either way.
3. **The 778 measurement.** Independently confirmed in Round 1 by moving the
   adapter aside: the packed surface is exactly 778 without it. `.scratch/` is not
   in the `files` allowlist, so parking the adapter there removes it from the
   manifest rather than relocating it inside the package.

The probe therefore proves both halves of the R1 argument in one run: the new
assertion bites, *and* the count case alone would have passed silently.

### F4 — Resolved

`test ! -e .scratch/gh/1578-align-body.mjs` is now the absence proof, with
`git status --short` retained only as tracked-tree evidence. Confirmed `.scratch/*`
is gitignored at `.gitignore:7`, which is why the original check could not work.

### F5 — Resolved

The third Global Constraint now reads "...or any existing package-boundary
assertion except to extend the required runtime-entry list with
`scripts/task-tracker/lib/peer-review-adapter.mjs`." The self-contradiction is
gone and the wording matches the accepted spec's Preserved Boundaries.

### A1 — Agreed, no change

Concur that the cited ranges are usable and non-normative.

## Advisory

### A2 — `rg` is an external dependency of the falsification step (non-blocking)

Task 1 Step 5 uses `rg -F` for its three output assertions. `rg` is present on
this machine (`/opt/homebrew/bin/rg`) so the step runs here, and I am not asking
for a change to gate acceptance.

The note is portability. Ripgrep is not part of the plan's stated tech stack
(Node.js 25, ESM, `node:test`, npm pack, AITM workflows), and it is not a POSIX
tool. Under the step's `set -e`, a sandbox without `rg` aborts the probe with
`command not found` — which reads as a failed falsification rather than a missing
tool, and the natural recovery is to assume the assertion is broken. Substituting
`grep -F` would behave identically here, has the same `-F` semantics and the same
exit codes, and removes the dependency.

Worth a one-word change if the implementation may run anywhere other than this
machine; otherwise ignore it.

## Verification performed this round

- Re-matched the extended `deep-dive-steps` literal against the live `#1578`
  body: exactly one match.
- Read `versionedWriteBody`'s first-attempt no-op short-circuit (lines 359-367)
  confirming `ok` → `no-op` across two runs.
- Redirected `node --test` output to a file and confirmed spec-style `✔`/`✖`
  marks persist on Node v25.6.0 (non-TTY).
- Simulated the failing required-entry assertion and confirmed the exact
  `required runtime file missing from package: ...` rendering.
- Confirmed `rg` resolves on this machine.
- Confirmed `.scratch/*` is gitignored, so the probe paths are neither tracked
  nor package-eligible.
- Re-read the revised Global Constraints, gate Steps 2-4, and Task 1 Steps 4-6
  for internal consistency: the "four ratified edits" language in Step 6 matches
  the four-item edit list in Step 3, and the renumbered Task 1 steps are sequential.

## Decision

**Accepted.** All three Round 1 blocking findings are resolved: F1 by making the
script genuinely idempotent rather than merely redocumenting it, F2 by absorbing
and renumbering the existing step 6, F3 by a trap-protected falsification probe
with correctly scoped restoration evidence. F4 and F5 are resolved as advisory
items, and on F3's restoration assertion the author corrected me and was right.
A2 is a portability note that does not gate acceptance.

The plan is precise enough to execute without improvisation. Every command I ran
from it behaved as the plan predicts.
