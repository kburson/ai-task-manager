# Round 1 Reviewer Review — Claude

- **Reviewer:** claude
- **Artifact:** `docs/superpowers/specs/2026-09-10-1578-package-boundary-ceiling-design.md`
- **Reviewed commit:** `2856a85b823599b57e88602d6200d71974d80759`
- **Worktree:** `.worktrees/ai-peer-review-design` (branch `codex/ai-peer-review-design`)
- **Decision:** changes requested
- **Blocking findings:** R1, R2, R3
- **Advisory findings:** R4, R5, R6

## Scope of review

Independent design review of the spec against the live codebase. No edit was made
to the spec or to any implementation file. All measurements below were taken in
the worktree named above at the reviewed commit, on Node v25.6.0.

## Verification performed (what the spec gets right)

Every factual premise in the spec that I could falsify, I tried to falsify. All
held:

1. **The measured surface is 779.** `npm pack --dry-run --json` in this worktree
   returns exactly 779 entries.
2. **The failure shape is exactly as described.** `node --test
   scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` yields five
   passing cases and one failure:
   `packed entry count 779 exceeds ceiling 778`.
3. **`ENTRY_CEILING` is 778**, set by the `#1562` note at the tail of the comment
   block.
4. **The branch is fully synchronized with trunk.** `git rev-list --left-right
   --count origin/trunk...HEAD` is `0 38` — zero behind. So the 778 baseline is
   trunk's own surface, not a stale fork point. The spec's "synchronized branch
   surface was 778" is accurate.
5. **The adapter is the only branch-added packed entry.** The branch adds six
   files vs `origin/trunk`:
   - `scripts/task-tracker/lib/peer-review-adapter.mjs` — **packed**
   - `scripts/tests/integration/review/peer-review-migration-guard.test.mjs` — excluded (`!scripts/tests/**`, `!**/*.test.mjs`)
   - `scripts/tests/integration/review/peer-review-package-parity.test.mjs` — excluded
   - three files under `docs/superpowers/` — not in the `files` allowlist at all
   The +1 attribution to `#1546`'s adapter is therefore correct, not a coincidence
   of two offsetting changes.
6. **The Preserved Boundaries list is achievable.** Nothing in the diff the spec
   describes requires touching `package.json`, the allowlist, the exclusion
   guards, the `docs/introduction/` inventory, the README link guard, or the
   required-entry list.

The diagnosis is correct and the chosen remedy is the right family of remedy.
My objections are to what the spec leaves unguarded, not to the +1 itself.

## Blocking findings

### R1 — The ceiling raise is justified by an entry that nothing actually guards

**Severity: blocking (correctness of the guard, not of the number).**

The spec's own "Alternatives Considered → Exclude the peer-review adapter"
establishes that shipping `scripts/task-tracker/lib/peer-review-adapter.mjs` is a
**distribution contract**: excluding it "would make the package test green by
breaking the planned distribution contract." I agree. But the spec then places
"the required runtime-entry assertions" on the Preserved Boundaries list, which
means no assertion is added for the adapter.

The result is a guard that is one-directional in the wrong direction. After this
change:

- If someone later adds `!scripts/task-tracker/lib/peer-review-adapter.mjs` to the
  allowlist negations, or moves/renames the file, the packed count falls to 778.
- 778 ≤ 779, so the count case **passes**.
- The exclusion cases pass. The `docs/introduction/` case passes. The README case
  passes. The required-entry list does not mention the adapter, so that case
  passes.
- The entire package-boundary suite goes green while the exact contract the spec
  says is non-negotiable is silently broken.

I checked the one test that does reference the adapter,
`scripts/tests/integration/review/peer-review-package-parity.test.mjs`. Despite
the name, it does not assert packaging. It asserts `existsSync(adapterPath)` —
presence **on disk in the repo**, not presence **in the tarball**. A file can
exist on disk and be excluded from the package; that is precisely what
`!scripts/tests/**` does to 400+ files today. So the parity test does not close
this hole either.

**Requested change.** Add `scripts/task-tracker/lib/peer-review-adapter.mjs` to
the `required` array in the existing
`package-boundary: runtime entry points are still shipped` case, and remove
"the required runtime-entry assertions" from Preserved Boundaries (or restate it
as "must not *weaken*").

This is not scope creep. The spec's comment block already says, in the `#1356`
note, that "path exclusions and required-entry assertions remain the controlling
guardrails; the count is a coarse tripwire, not an exact inventory." The spec is
currently spending the coarse tripwire to account for an entry and declining to
add it to the controlling guardrail. It is one line in an array that already
exists, in the same file the spec already modifies, and it makes the +1 verifiable
rather than merely asserted in a comment.

### R2 — "Adds no contingency headroom" recreates the flake that #910 was raised to fix, and the spec does not acknowledge it

**Severity: blocking (risk acceptance must be explicit, not silent).**

The Decision section states: "The change adds no contingency headroom." The file's
own history records what zero headroom did last time. From the `#910` note:

> The branch had crept to its ceiling (zero headroom), which made this count
> assertion intermittently fail under the concurrent full suite: a peer test
> transiently writing an untracked packed-path file pushed the momentary
> `npm pack` count past the limit.

I reproduced the mechanism in this worktree. `npm pack` inventories the **working
tree**, not the committed tree. I created one untracked file at
`scripts/task-tracker/lib/__probe_<pid>.mjs`, re-ran the dry run, and the count
went **779 → 780**; removing it returned it to 779. So a single transient
untracked file under any packed directory is sufficient to fail the count case,
and after this change the margin is exactly zero.

I want to be fair about the counter-argument, because it is a real one: `#1562`
already set an exact ceiling (777 → 778) on the current trunk, and that is the
immediate precedent the spec is following. Consistency with the most recent
decision is legitimate. The problem is that the spec asserts "no contingency
headroom" as a virtue without ever engaging the recorded evidence that exact
ceilings on this specific assertion have produced intermittent failures under the
concurrent full suite — which is exactly the lane
(`Test-stage fast, integration, slow`) the spec's own Verification section
requires to pass.

I am not asking for headroom. Headroom and exactness are both defensible, and the
choice is the author's. I am asking that the choice be **made on the record**.
Any one of these resolves the finding:

- **(a) Accept the risk explicitly.** State in the Decision section that the
  exact ceiling is retained per the `#1562` precedent, that the `#910`
  transient-untracked-file failure mode is understood and accepted, and why it is
  believed not to apply now (e.g. 264 test files use `mkdtemp` and I found no
  test writing into a packed path under the repo root — a grep for
  `writeFileSync(join(repoRoot` in `scripts/tests` returns nothing).
- **(b) Make the assertion tree-independent.** Filter the packed list against
  `git ls-files` before counting, so untracked transients cannot move the number.
  This makes the exact ceiling genuinely safe rather than safe-by-luck, and it is
  a strictly better guard than either exact-with-flake or loose-with-headroom.
- **(c) Take headroom** and say so.

My preference is (b), then (a). I would push back on (c) — the spec's reasoning
against broad headroom is sound and I do not want to relitigate it.

If (a) is chosen, note that the mitigating evidence I found is good but not
complete: `docs/ai-memory/`, `docs/guides/`, `config/`, `skill/`, and `hooks/` are
all packed directories, and AITM tooling writes into some of those during
governed runs. I did not exhaustively prove that nothing transiently writes there.

### R3 — Provenance reasoning omits the actual owner, #1546, and the landing order creates the very slack the spec forbids

**Severity: blocking (needs one paragraph, not a redesign).**

"Alternatives Considered → Attribute the adjustment to #1577" is correct and I
agree with it: `#1577` changes Node test lifecycle ownership and packs nothing.
But the spec considers only `#1577` and a new blocker. It never considers the
entry's actual origin — **`#1546`**, which introduces
`scripts/task-tracker/lib/peer-review-adapter.mjs`. That is the natural owner of a
ceiling raise caused by that adapter, and its absence from the alternatives makes
the provenance argument incomplete.

More concretely, there is a sequencing consequence the spec does not address. The
Lifecycle section says `#1578` must reach Done before `#1577` retries, and that
`#1577` then unblocks `#1546`. Read literally, `#1578`'s ceiling raise lands on
trunk **before** `#1546`'s adapter does. At that point trunk's measured surface is
778 against a ceiling of 779 — one entry of unaccounted, unreviewed slack, sitting
on trunk for the duration. That is exactly what the Decision section forbids
("Future package growth must still fail the count guard and receive its own
explicit review") and what "Add broad ceiling headroom" was rejected for. The
principle and the sequence contradict each other.

I do not think this is fatal, and I am not asking for the blocker to be
restructured. It is a bounded, temporary, one-entry gap. But the spec should:

1. add `#1546` to Alternatives Considered and say why a separate blocker beats
   folding the raise into `#1546` (I expect the honest answer is that `#1577`'s
   Test gate is blocked *now* and cannot wait on `#1546`'s lifecycle — that is a
   good reason and it should be written down); and
2. state the landing order plainly and acknowledge the transient one-entry slack
   on trunk between `#1578` landing and `#1546` landing, so a future reader does
   not mistake it for the drift this guard is meant to catch.

R1 also materially shrinks this concern: if the adapter joins the required-entry
list, then the moment `#1578` lands without `#1546`, the required-entry case fails
loudly rather than the count case sitting quietly one short. That interaction is
worth deciding deliberately — it may argue for landing R1's assertion *with*
`#1546` rather than with `#1578`. I flag it rather than prescribe it.

## Advisory findings

### R4 — Name the measurement method; the number is tree-dependent

The Verification section says "Node v25.6.0 must reproduce five passing cases and
one count failure reporting 779 entries against ceiling 778." Given R2's finding
that the count reflects the working tree, "779" is only reproducible under stated
conditions. Recommend the spec name them: `npm pack --dry-run --json` at the
implementation base, **clean working tree** (`git status --porcelain` empty), no
untracked files under packed directories. Without the cleanliness precondition,
a reviewer who reproduces 780 cannot tell whether the spec is wrong or their tree
is dirty.

### R5 — `@story` tag: state whether #1546 belongs there too

The spec adds `#1578` to the file's `@story` attribution. The current line is
`// @story #551 #1279 #1497 #1501`. Note that `#1562` raised the ceiling to 778
without adding itself to that line, so the tag list is already not an exhaustive
history of ceiling changes — the prose comment block is. That makes adding
`#1578` a slight departure from the immediately preceding precedent. I have no
objection to adding it (more attribution is better than less), but since the
ceiling entry is `#1546`'s adapter, the spec should say whether `#1546` is also
expected on that line, so the implementer is not left guessing. Either answer is
fine; silence is what I am objecting to.

### R6 — Forward note: epic Task 15 will revisit this exact number

`docs/superpowers/plans/2026-09-07-ai-peer-review-extraction.md:2450` assigns
"AITM package-boundary migration and legacy guard" to Task 15 of the epic. When
the peer-review code is extracted, the adapter's packed status — and therefore
this exact ceiling — changes again. No action for `#1578`. Recording it so the
779 is not later read as a stable floor, and so Task 15's author knows an exact
(not headroom-padded) ceiling is what they will inherit.

## Summary of what I agree with

- The root cause: missing accounting for one approved runtime entry, not a leak.
- The remedy family: raise the ceiling by exactly one.
- The rejection of "exclude the adapter."
- The rejection of "add broad headroom."
- The rejection of attributing to `#1577`.
- The Preserved Boundaries list, with the single exception argued in R1.
- The Verification section's structure, with the precondition added in R4.

## What I need to accept

- **R1:** adapter added to the required-entry assertion, and Preserved Boundaries
  reworded accordingly.
- **R2:** an explicit, recorded decision on zero headroom — (a), (b), or (c).
- **R3:** `#1546` added to Alternatives Considered, plus a stated landing order
  and acknowledgment of the transient one-entry trunk slack.

R4, R5 and R6 are advisory and do not gate acceptance.
