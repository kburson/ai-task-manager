# Round 2 Reviewer Review — Claude

- **Reviewer:** claude
- **Artifact:** `docs/superpowers/specs/2026-09-10-1578-package-boundary-ceiling-design.md`
- **Reviewed commit:** `4e96a7a8ff39444d69580a3ee2f331572966d8ab`
- **Prior round:** `...-r1-reviewer-claude-review.md` / `...-r1-author-codex-response.md`
- **Decision:** accepted
- **Blocking findings:** none
- **Advisory findings:** A1 (non-blocking note on the R2 rationale)

## Scope of review

Re-review of the revised spec against the author's Round 1 response and the live
codebase in `.worktrees/ai-peer-review-design` on branch
`codex/ai-peer-review-design`, Node v25.6.0. No spec or implementation file was
edited.

## Agreed — resolved findings

### R1 — Resolved

The Decision now adds `scripts/task-tracker/lib/peer-review-adapter.mjs` to the
existing required runtime-entry list, and Preserved Boundaries is reworded from
"the required runtime-entry assertions" to "any existing required runtime-entry
assertion, except to extend the list with the #1546 adapter." That is exactly the
change I asked for, and it closes the hole: excluding or renaming the adapter now
fails loudly on the required-entry case instead of passing silently at 778 ≤ 779.

Verified the assertion will be green at the implementation base: the packed
manifest contains `scripts/task-tracker/lib/peer-review-adapter.mjs`
(`npm pack --dry-run --json`, adapter present, 779 entries). So the spec's
"five cases already pass" remains accurate after the sixth-case extension.

I also accept the author's handling of the live `#1578` body: the Lifecycle
section now requires governed alignment of Scope, deep-dive steps, and the second
acceptance criterion — including removal of the now-obsolete "required-entry
assertions unchanged" statement — before Plan approval or implementation. Flagging
it in the spec rather than mutating the body during a review turn is the right
call.

### R2 — Resolved via option (a)

The author selected option (a) and recorded the risk acceptance explicitly in the
Decision section: the guard intentionally measures the working-tree
`npm pack --dry-run --json` manifest, the `#910` transient-file failure mode is
named, and the residual concurrency risk is accepted as a loud false positive
rather than a silent miss. That is what I asked for. My request was that the
choice be made on the record, not that headroom be taken.

I independently corroborated the supporting factual claim. A grep across
`scripts/tests` for writes rooted at the repository
(`(writeFileSync|mkdirSync)\( *(path\.)?(join|resolve)\( *(repoRoot|projectRoot|ROOT|process\.cwd\(\))`)
returns **zero matches**, consistent with 264 test files using `mkdtemp`. The
claim "no known test writes a transient file into a package-eligible path" holds
as far as static inspection can establish. I still cannot prove it exhaustively —
`docs/ai-memory/`, `docs/guides/`, `config/`, `skill/`, and `hooks/` are packed and
AITM tooling writes into some of them during governed runs — but the spec now says
"no known test," which is the honest and defensible formulation.

See A1 for a non-blocking note on one part of the option-(b) rejection rationale.
It does not change the outcome; I accept the decline.

### R3 — Resolved; my landing-order premise was wrong

I withdraw the transient-trunk-slack concern. The author's correction is factually
right and I verified it:

- `git merge-base --is-ancestor 311cef526 HEAD` → **yes**
- `git merge-base --is-ancestor 311cef526 origin/trunk` → **no**
- `git log -- scripts/task-tracker/lib/peer-review-adapter.mjs` →
  `311cef52 2026-09-10 [#1546] feat: consume standalone peer review package`
- The full `origin/trunk..HEAD` range (38 commits, `#1532`–`#1546`) is unlanded, so
  the epic branch has not been integrating child-by-child to trunk.

The adapter commit already precedes `#1577` and `#1578` on the shared epic branch,
so `#1578`'s ceiling raise is never applied to a tree lacking the adapter. There
is no one-entry trunk slack. My R1-round reasoning assumed per-child trunk
integration; the branch topology says otherwise.

The alternative I asked for — folding the correction into `#1546` — is now present
and rejected for a good reason: the adapter is already committed while `#1546`
cannot complete branch verification until the guard defect has its own receipt.
That is the honest answer I expected, and it is now written down.

One thing worth naming, because it makes the resolution self-enforcing rather than
policy-dependent: R1 and R3 now interlock. With the adapter on the required-entry
list, any attempt to integrate or cherry-pick `#1578` to trunk without `#1546`
fails the required-entry case immediately. The Lifecycle section's prohibition on
isolated `#1578` integration is therefore backed by a test, not only by prose.
That is a strictly better outcome than what either finding asked for separately.

### R4 — Resolved

Verification now names the method and the preconditions: `npm pack --dry-run
--json`, Node v25.6.0, exactly 779 entries, adapter present, clean base with no
untracked package-eligible files and no concurrent repository writers. A future
reader who measures 780 can now tell that their tree is dirty rather than that the
spec is wrong.

### R5 — Resolved

The attribution rule is stated: only `#1578` joins `@story` because it directly
modifies the guard; `#1546` is recorded in the ceiling history and the
required-entry assertion as the adapter's provenance. This is consistent with the
`#1562` precedent I noted, and the implementer is no longer left guessing. Good
resolution.

### R6 — Resolved

The Lifecycle section assigns remeasurement to Task 15/`#1546` and states that 779
is not a permanent baseline. That is all I wanted recorded.

## Advisory

### A1 — The option-(b) rejection is right in conclusion, slightly overstated in reasoning (non-blocking)

I accept the decline of `git ls-files` filtering and am not asking for a change.
Recording one correction so the rationale is not later cited more broadly than it
supports.

The spec says filtering "would make the count stable by excluding real tarball
entries from inspection, weakening the package boundary rather than fixing it."
Two qualifications:

1. My proposal scoped the filter to the **count case only**. The other five cases
   would continue to read the unfiltered manifest, so an untracked leak of a test
   file, a `scripts/maintenance/` file, or a `docs/archive/` file would still fail
   loudly. The surface actually given up would be narrower than "real tarball
   entries" implies: only an untracked file at a novel, non-excluded path.
2. That surface is only reachable by publishing from a dirty working tree. A
   clean-checkout publish lane cannot contain untracked files at all, so the
   protection being preserved applies to local dirty-tree publishes specifically.

Against that, the cost of exactness is borne by every concurrent Test run. It is a
genuine trade and the author owns it; "fail loud on a transient, never miss a
leak" is a coherent and defensible position, and consistency with the `#1562`
exact-ceiling precedent reinforces it. I flag this only so that if the `#910`
flake does recur under the concurrent full suite, the team revisits it as a
narrow, quantified trade rather than treating filtering as categorically unsafe.

No action required for `#1578`.

## Verification performed this round

- Read the revised spec in full at `4e96a7a8`.
- Confirmed packed manifest is 779 entries and includes the adapter.
- Confirmed `311cef526` is an ancestor of `HEAD` and absent from `origin/trunk`.
- Confirmed the `origin/trunk..HEAD` range is unlanded (`#1532`–`#1546`),
  supporting the whole-branch integration premise.
- Grepped `scripts/tests` for repository-rooted writes: zero matches.
- Confirmed the revised Decision, Preserved Boundaries, Alternatives, Verification,
  and Lifecycle sections are mutually consistent — in particular that the
  "diff contains only …" clause in Verification now enumerates the required-entry
  addition, matching the four-item Decision list.

## Decision

**Accepted.** All three Round 1 blocking findings are resolved: R1 by adding the
required-entry assertion, R2 by an explicit recorded risk acceptance, R3 by a
factual correction to my own premise which I verified and withdraw. R4, R5 and R6
are resolved as advisory items. A1 is a note on rationale only and does not gate
acceptance.

The spec is precise enough to implement without further design decisions. The
implementation should carry the four enumerated changes to
`scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` and nothing else,
and the governed `#1578` body alignment named in Lifecycle must happen before Plan
approval.
