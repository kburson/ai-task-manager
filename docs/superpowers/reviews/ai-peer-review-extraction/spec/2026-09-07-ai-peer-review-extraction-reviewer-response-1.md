# Reviewer Response — AI Peer Review Extraction Design (Round 1)

- **Artifact:** `docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
- **Artifact commit:** `1da87a78` (worktree `ai-peer-review-design`)
- **Reviewer:** Anthropic Claude Opus 5 (`claude-opus-5`), Claude Code
- **Author:** Codex
- **Round:** 1
- **Decision:** `revisions-requested`

## Summary

The design is strong on the parts it covers: the role split, the commit-triad
integrity model, the no-commit test mode, and the offline help contract are all
well specified and internally coherent. The no-commit section in particular is
the most rigorous part of the document — its transition invariants are precise
and testable.

My concerns are of three kinds:

1. **A licensing contradiction that blocks the plan as written.** AITM is
   AGPL-3.0-or-later with a commercial dual-license; the spec proposes a
   history-preserving extraction published under Apache-2.0 and never addresses
   the relicensing.
2. **Silent capability loss.** The spec is framed as an extraction, but at least
   five behaviors that exist and are tested in `scripts/review/**` are dropped
   without appearing in Non-goals. Turn budgets are the most consequential.
3. **Scope framing.** A large fraction of the work is greenfield, not
   extraction — most visibly the MCP handoff server, which has no precedent
   anywhere in the repository and which Goal 7 and AC 9 depend on entirely.

I also found two internal contradictions (dirty-worktree handling, artifact-kind
derivation) and one direct conflict with the documented, tested host convention
for the reviews root.

## Findings

### F1 — Blocking: Apache-2.0 publication contradicts the AGPL source and the commercial license

**Severity:** blocking.

`package.json` declares `"license": "AGPL-3.0-or-later"`, and `NOTICE` states:

> "This software is available under a dual-license model … A separate commercial
> license, for parties who wish to use this software in a closed-source or
> otherwise AGPL-incompatible product or service."

The spec's "License, Publication, and Provenance" section says only:

> "Before extraction, confirm that retained source is owned by contributors who
> can license it and preserve required notices for any third-party material."

That sentence does not name the actual problem. The retained source is *already
licensed*, to the public, under AGPL-3.0-or-later. Publishing the same code
under Apache-2.0 is a relicensing act, not a "confirm ownership" checklist item.

The good news, which the spec should state explicitly rather than leave implied:
`git log --format='%an <%ae>' -- scripts/review` returns exactly two identities
(`kendrick burson <kpburson@pm.me>`, `Kendrick Burson <spam.kpb@gmail.com>`),
and the whole repository has only those two. Sole copyright ownership means
relicensing is available to the holder. So this is fixable — but it must be
decided and written down, not skipped.

**Required:** add an explicit relicensing subsection covering:

- a statement that the copyright holder is relicensing the extracted subset
  under Apache-2.0, with the evidence (sole-authorship audit command and result);
- what happens to the **historical commits**. A `git filter-repo` extraction
  that "preserves history" will carry commit trees containing the AGPL `LICENSE`
  and `NOTICE` files. Recipients can reasonably read those historical trees as
  AGPL-licensed. Either strip/replace `LICENSE`/`NOTICE` across rewritten
  history, or state that historical trees remain dual-available and that only
  `HEAD` onward is Apache-2.0;
- the **business consequence**, which the spec currently does not acknowledge:
  the co-review engine is today part of what the commercial license sells. Under
  Apache-2.0 anyone may fork it into a closed product with no reciprocal
  obligation. If that is intended, say so. If it is not, Apache-2.0 is the wrong
  choice and the spec should reconsider (e.g. AGPL for the standalone package
  too, with the same dual-license posture).

Also note: AGPL AITM depending on an Apache-2.0 package is fine in that
direction; nothing in the migration is blocked by the dependency edge itself.

### F2 — Blocking: turn budgets are removed with no replacement and no Non-goal

**Severity:** blocking.

`scripts/review/lib/budget.mjs` implements `reviewBudgetFloor`,
`planAbsoluteBudget`, and `planContinuationBudget`;
`scripts/review/lib/protocol.mjs:1813` exports `setMaxReviewTurns` and
`:1858` `continueProtocol`; the CLI exposes `--max-turns`. The whole mechanism
exists because an author and a reviewer who disagree will ping-pong
indefinitely, spending real money, and a human needs a bounded stopping point
with an explicit continuation grant. Issue #1268 and the
`2026-08-15-co-review-finalization-and-turn-budget-control-design.md` spec are
the provenance.

The new spec has no turn budget, no exhaustion state, no continuation grant, and
no Non-goal disclaiming any of it. The Lifecycle section's loop
(`reviewer-turn -> author-revision -> reviewer-turn -> ...`) is unbounded.

This is materially worse in the new design than in the old one, because the MCP
`wait_for_handoff` transport removes the natural friction that a 60-second
bounded wait imposed today.

**Required:** either carry the budget model forward (`--max-turns`, a
`budget-exhausted` state, an explicit human continuation grant that records who
approved and how many turns were added), or add a Non-goal that states budgets
are a host concern and specify the read-only hook AITM would use to enforce one.
Silence is not an option.

### F3 — Major: "good enough" acceptance is dropped

`protocol.mjs:1753` `prepareGoodEnoughSnapshot` and `:1782` `acceptGoodEnough`
implement a third terminal outcome: the author declares the artifact adequate
over unresolved reviewer findings, and that declaration is snapshotted and
recorded as such. The new spec states the decision is "exactly
`revisions-requested` or `accepted`."

Collapsing "good enough over objections" into "accepted" destroys the
distinction the manifest most needs to record. Either keep the third decision or
add a Non-goal and explain what an author does when the reviewer will not accept
and the human wants to ship anyway.

### F4 — Major: supplements (mid-review third-party context) are dropped

`protocol.mjs:1245` `registerSupplement`, with pending/frozen lifecycle handling
in `continueProtocol`, and a dedicated fixture
(`scripts/tests/fixtures/co-review-supplement-cases.mjs`). The new spec's Core
Boundaries assigns "supplying additional context to either agent" to the host
but specifies no mechanism, and the protocol has no place to put it. Either
specify the supplement surface or Non-goal it explicitly.

### F5 — Major: the reviews root conflicts with the documented host convention

`docs/superpowers/reviews/README.md` is unambiguous:

> "The canonical host destination is exactly
> `docs/superpowers/reviews/<issue>/<artifact-kind>/` … Guided startup derives
> this path only from explicit paired host inputs; it never guesses either value
> from an artifact filename."

The on-disk tree confirms it: `docs/superpowers/reviews/` contains `939`, `1117`,
`1219`, `1262`, `1263`, `1268`, `1321`, `1374`, `1380`, `1381` — every one an
issue number, each holding `spec/` and `plan/`.

The spec proposes `docs/superpowers/reviews/<spec|plan>/` with the issue ID
optional and folded into the *filename* (`insert <issue-id>- before <name>`).
That inverts the documented hierarchy. Two consequences:

- AITM's own reviews would split across two incompatible layouts after
  migration, and the spec's "Existing accepted archives remain immutable in their
  current layout" does not address the resulting mixed tree;
- the flattened default puts every review for every issue in one directory,
  which is exactly what the host README rejected.

**Required:** make the reviews root a template rather than a fixed path (e.g.
`--reviews-root` plus a `--review-path-template` supporting `<issue>`,
`<kind>`, `<name>`, `<date>`), with a package default that is *not* the AITM
layout and an AITM-supplied configuration that reproduces
`<issue>/<artifact-kind>/` exactly. Then AITM does not fork the convention.

### F6 — Major: internal contradiction on unrelated worktree changes

"Git Ownership and Integrity" says, two sentences apart:

> "The CLI uses exact path arguments and refuses staged or unstaged changes
> outside the expected paths. Unrelated worktree changes remain untouched."

These cannot both hold. The first refuses to proceed when unrelated dirt exists;
the second says unrelated dirt is tolerated and simply not committed.

This is not a wording nit. The realistic AITM case is an agent mid-issue with a
dirty tree asking for a spec review. Under the first reading, review is
impossible until the tree is clean. Under the second, `git commit -- <exact
paths>` is used and unrelated changes are ignored — which is what the current
implementation's exact-path model does and what the no-commit section
independently assumes ("Pre-existing unrelated changes may remain").

**Required:** pick the second reading and say it once: the CLI refuses *staged*
content only when it overlaps protocol-owned paths, commits by exact path, and
leaves everything else alone. Then reword the first sentence to match.

### F7 — Major: artifact-kind derivation contradicts the host rule and itself

"Tracked review collateral" says: "The artifact kind is derived or explicitly
selected as `spec` or `plan`." The host README says startup "never guesses
either value from an artifact filename." Drop "derived," or specify a derivation
source that is not the filename (e.g. the containing directory `specs/` vs
`plans/`) and reconcile it with the host rule.

### F8 — Major: scope is framed as extraction, but the transport is greenfield

`grep -ri mcp scripts/` returns nothing. There is no MCP server, no MCP client,
no MCP dependency (`dependencies` is `{"espree": "^10.4.0"}` — a single dep).
The MCP handoff service, its filesystem-watch delivery, its race-safe
subscribe-after-check, its four transport capability tiers, its per-host timeout
configuration, and `setup`'s ability to install and configure it across Codex,
Claude Code, and Grok are all new construction.

The existing wait primitive is `protocol.mjs:1939` `waitForTurn`, which hard-caps
`timeoutSeconds` at 60 and polls in-process at 250 ms. The spec's diagnosis of
the problem is *correct* — each 60-second timeout costs a model turn — but the
fix is a new subsystem, not a port.

Similarly greenfield: `setup`, `doctor`, `explain <error-code>`, the four
transport tiers, the identity-adapter layer (today `provider-session.mjs` is 33
lines that read env vars and refuse on ambiguity — it captures no model ID, no
display name, and no fingerprint).

**Required:** add a "Scope and Sequencing" section that separates ported code
from new code and phases the work, so the MCP server is not a hidden dependency
of the first release. Concretely, I suggest: Phase 1 ships extraction + CLI +
`manual` transport only (the `resume-only`/`manual` tiers are achievable with
today's code); Phase 2 adds the MCP server and the automatic-required mode. AC 9
belongs to Phase 2. Without this split, "the extraction is complete when [all 15
criteria]" is a single un-shippable milestone.

### F9 — Moderate: identity fingerprint has no liveness component

`protocol.mjs:370` `validateClaimRecord` requires `revision`, `role`, `actor`,
`provider`, `sid`, **`pid`**, `host`, and `at`. The `pid` is there so the
protocol can tell one live process from another — two windows of the same
provider session, or a stale claim from a dead process.

The new `session_fingerprint` is described as "one-way stable fingerprint" of a
session, deliberately stable across turns. Stability is right for provenance and
wrong for turn ownership. As written, two concurrent processes sharing one
session fingerprint are indistinguishable, and the distinct-session gate would
pass on a stale-but-registered participant.

**Required:** separate the two concepts — a stable `session_fingerprint` for
provenance in the manifest, plus a per-turn claim record carrying process
liveness — and specify what happens when a claim's process is gone (this is
adjacent to the "participant loss" recovery you already list, but the spec never
says how loss is *detected*).

### F10 — Moderate: archive.mjs is discarded wholesale, including logic the new model still needs

The spec dismisses `archive.mjs` in one line as "the old copy-from-scratch
archive model." It is 1,370 lines and exports `resolveArchiveDestination`,
`deriveRecoveryArchiveDir`, `assertArchiveDestinationAbsent`,
`inspectForeignArchive`, `renderArchiveManifest`, `inspectArchive`,
`prepareArchive`, and `publishPreparedArchive`. Several of those encode
specifically-designed recovery behavior:

- `2026-08-21-1374-co-review-archive-collision-recovery-design.md`
- `2026-08-19-co-review-reference-archive-design.md`
- `2026-08-19-co-review-consistent-snapshot-design.md`

Writing directly to the tracked path genuinely obsoletes the *copy* step. It does
not obsolete destination collision handling, foreign-archive detection, or
consistent-snapshot reads. The spec says only "existing files are never silently
overwritten" — that names the check but not the recovery, and there is no
`APR_*` category for it beyond a generic one.

**Required:** state which of these behaviors survive, and add a collision
recovery path (what does an agent do when turn 3's response path already exists
from an interrupted run?).

### F11 — Moderate: the cross-worktree occupancy index has ambiguous ownership

`scripts/review/lib/index.mjs` maintains a registry keyed by protocol ID, stored
at `coReviewIndexPath(findMainWorktreePath(projectDir))` — deliberately in the
*main* worktree so all worktrees share one view. Designs
`2026-08-21-1369-cross-worktree-co-review-handoff-design.md` and
`2026-08-21-1372-stale-co-review-grant-design.md` built on it.

The new spec asserts a review lives in "the same physical Git worktree," and
puts scratch state under `.scratch/peer-review/<review-id>/` — per-worktree. But
AITM Integration then says AITM may "read active review occupancy through the
standalone package's read-only API," which is a cross-worktree question the
per-worktree scratch layout cannot answer.

**Required:** decide whether occupancy is a package concern (then specify where
the index lives and how it stays consistent across worktrees) or a host concern
(then remove the occupancy claim from AITM Integration and say AITM keeps its own
index).

### F12 — Moderate: `.git/info/exclude` is per-worktree and the spec treats it as sufficient

"Workspace Model" says setup "may add `.scratch/peer-review/` to the worktree's
`.git/info/exclude`." In a linked worktree, `.git` is a file pointing at
`.git/worktrees/<name>/`, and `info/exclude` resolution there is not the same as
in the main checkout. Meanwhile the repository's tracked `.gitignore` already
carries `.scratch/*` at line 7 — so for AITM this is moot, but for a fresh host
project the exclude write is the only protection and its behavior differs by
worktree kind.

**Required:** specify the exclude-path resolution for linked worktrees, and make
`start` fail closed with a named error when it cannot confirm the scratch path is
actually ignored (`git check-ignore` is the reliable test; the spec says "verify
the scratch path is safe and ignored" without saying how).

### F13 — Minor: `awaiting-reviewer` has no entry for the reviewer's first read

The lifecycle starts at `awaiting-reviewer` and the reviewer "reads the current
artifact and the preceding author response." On turn 1 there is no preceding
author response. Say what the reviewer reads on the first turn (presumably
`reviewer-invitation.md` plus the artifact) so the template hydration matches.

### F14 — Minor: no stated Node engine floor or dependency budget

AITM sets `"engines": {"node": ">=22"}` and ships one runtime dependency. A
package whose selling point is "an agent can run `npx ai-peer-review` in any
repo" should state its engine floor and commit to a small dependency surface —
especially since an MCP server implementation is the most likely place for that
to balloon.

### F15 — Minor: `--no-artifact-change` receipt lacks a reviewer-visible signal

The `--no-artifact-change --reason <text>` escape is well designed, but nothing
in the flow guarantees the reviewer *sees* the reason before the next turn. The
author response template's "Declined changes and rationale" section is the
natural home; state that `--reason` is required to appear there, or that the CLI
injects it.

## Required changes

1. F1 — add an explicit relicensing subsection: sole-authorship evidence,
   treatment of AGPL `LICENSE`/`NOTICE` in rewritten history, and an
   acknowledgment of the commercial-license consequence.
2. F2 — restore turn budgets and an exhaustion/continuation model, or Non-goal
   them and specify the host enforcement hook.
3. F3 — restore the "good enough" terminal decision or Non-goal it with a stated
   alternative.
4. F4 — specify the supplement mechanism or Non-goal it.
5. F5 — make the reviews path a configurable template; ship an AITM
   configuration reproducing `<issue>/<artifact-kind>/`.
6. F6 — resolve the dirty-worktree contradiction in favor of exact-path commits.
7. F7 — remove "derived" for artifact kind, or specify a non-filename source.
8. F8 — add "Scope and Sequencing," splitting ported from greenfield work and
   phasing MCP out of the first release; move AC 9 to Phase 2.
9. F9 — separate stable provenance fingerprint from per-turn liveness claim;
   specify participant-loss detection.
10. F10 — state which `archive.mjs` behaviors survive; add output-path collision
    recovery.
11. F11 — decide occupancy-index ownership.
12. F12 — specify `.git/info/exclude` resolution for linked worktrees and a
    `git check-ignore` fail-closed verification.

## Optional suggestions

- F13, F14, F15 above.
- The `commit_mode: enabled | disabled` frontmatter field would read better as
  `commit_mode: normal | no-commit`, matching the CLI flag and the
  `accepted-uncommitted` terminal state.
- Consider stating the `APR_` prefix's meaning once (`ai-peer-review`), since it
  will appear in every error a user ever sees.
- The Testing Strategy is good but omits a test for the F6 case (review starting
  from a dirty unrelated tree), which is the most likely real-world first
  failure.

## Decision

`revisions-requested`

F1 and F2 are blocking. F1 because publishing under the wrong license is not
reversible once the package is public. F2 because shipping an unbounded review
loop with a friction-free transport is a cost regression the current system
deliberately guards against.

## Verification performed

- Read the full spec at `1da87a78`.
- Enumerated the extraction boundary: `scripts/review/` is 5,813 lines across 11
  files; cross-module coupling is exactly three imports
  (`task-tracker/fleet-registry.mjs`, `task-tracker/paths.mjs`,
  `providers/index.mjs`) — the spec's coupling assessment is accurate and the
  boundary is genuinely narrow.
- Confirmed co-review-specific tests: 5 test files across
  `scripts/tests/{unit,integration,slow}/review/` plus 8
  `scripts/tests/fixtures/co-review-*.mjs` fixtures.
- Confirmed `grep -ri mcp scripts/` returns no matches.
- Read `protocol.mjs` exports, `waitForTurn` (60 s cap, 250 ms poll),
  `validateClaimRecord` (includes `pid`), `budget.mjs`, `provider-session.mjs`
  (33 lines, env-var only).
- Read `NOTICE`, `package.json` license/engines/dependencies.
- Confirmed sole authorship via `git log --format='%an <%ae>' -- scripts/review`
  and repository-wide author counts.
- Read `docs/superpowers/reviews/README.md` and listed the existing
  issue-numbered review tree.
