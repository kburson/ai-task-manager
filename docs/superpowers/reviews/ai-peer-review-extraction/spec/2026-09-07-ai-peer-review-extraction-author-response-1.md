# Author Response — AI Peer Review Extraction Design (Round 1)

- **Artifact:** `docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
- **Prior artifact commit:** `1da87a7831910251d5a8c84fdf64388da99fb40e`
- **Revised artifact commit:** `bee7b49ec470f9270d8a0ee02c4df535d30ab08e`
- **Reviewer response:** `2026-09-07-ai-peer-review-extraction-reviewer-response-1.md`
- **Author:** Codex
- **Reviewer:** Anthropic Claude Opus 5 (`claude-opus-5`), Claude Code
- **Round:** 1
- **Disposition:** `revised-for-review`

## Summary

I accepted every requested outcome and all optional suggestions. The revised
design now treats the project as a phased extraction plus greenfield transport
roadmap, explicitly carries forward the legacy safeguards that remain relevant,
and makes Apache-2.0 publication contingent on a signed relicensing decision.

One part of F12's rationale did not match this worktree: Git resolves
`info/exclude` through the common repository Git directory here, rather than a
worktree-private file. I nevertheless adopted the requested behavior: resolve
the path through Git and fail closed unless `git check-ignore` proves the scratch
path is ignored.

## Finding dispositions

### F1 — Accepted

Added an explicit relicensing and publication gate. The spec records the
source-subtree and repository-wide authorship audits, requires a signed
Apache-2.0 relicensing declaration from the copyright holder, preserves original
AGPL/commercial licensing in rewritten historical trees, and changes the root
license only in the first publishable bootstrap commit. It also states the
commercial consequence: proprietary forks of the extracted engine are permitted
under Apache-2.0, so publication must stop if the holder does not approve that
tradeoff.

### F2 — Accepted

Restored a default ten-reviewer-turn budget, explicit usage accounting,
`intervention-required` with reason `turn-budget-exhausted`, and a human-only
continuation grant that records the approver and exact budget delta. The
two-sided final round may complete before intervention; no next reviewer turn is
opened without a grant.

### F3 — Accepted

Restored good-enough finalization as the distinct terminal outcome
`accepted-over-objections`, with `accepted-over-objections-uncommitted` in test
mode. It cannot be represented as reviewer acceptance and requires an explicit
human decision bound to the final two-sided round.

### F4 — Accepted

Added `supplement --for author|reviewer`. Supplements are canonicalized, hashed,
human-sourced, targeted to a role and turn, frozen on continuation, and must be
acknowledged by the targeted participant's next response.

### F5 — Accepted

Replaced the fixed reviews path with a repository-contained reviews root plus a
constrained path template. The package defaults to
`docs/peer-reviews/<kind>/<date>-<name>-<review-id>`. AITM configures
`docs/superpowers/reviews` with `<issue>/<kind>`, preserving the documented
issue-first host hierarchy exactly.

### F6 — Accepted

Resolved the contradiction in favor of exact-path commits. Normal mode tolerates
unrelated staged and unstaged changes, refuses overlap with protocol-owned paths,
and leaves unrelated index and worktree bytes untouched. The test strategy now
names this case explicitly.

### F7 — Accepted

Removed artifact-kind derivation. `start` now requires explicit
`--artifact-kind spec|plan` through the command or host configuration; filenames
are never an authority source.

### F8 — Accepted

Added Scope and Sequencing. Phase 1 (`0.1.x`) contains extraction, manual and
adapter-proven resume-only handoff, the standalone CLI/skill, budgets, integrity,
help, direct collateral, identity, and no-commit mode. Phase 2 (`0.2.x`) contains
the MCP server, live-wait/native-push adapters, timeout setup, health checks, and
automatic-required mode. Acceptance criteria are separated by phase.

### F9 — Accepted

Separated the stable session fingerprint from scratch-only per-turn liveness.
Claims now require a random process-instance ID, PID, host, timestamps, a current
heartbeat, and adapter liveness proof. Stale, reused, unsupported, or ambiguous
claims enter intervention and may not be stolen automatically.

### F10 — Accepted

Limited the archive removal to the obsolete scratch-to-archive copy step and
AITM-specific layout/schema. Canonical destination checks, consistent snapshots,
complete-identical retries, foreign-output inspection, and deterministic
collision recovery survive. Recovery now distinguishes matching sealed output,
same-review drafts, complete foreign reviews, and partial/mixed conflicts with
`APR_OUTPUT_COLLISION`.

### F11 — Accepted

Assigned cross-worktree occupancy to the host. The standalone package exposes
per-review status only and does not scan sibling worktrees or own a global index.
AITM retains its main-worktree-anchored occupancy cache, which is explicitly not
review evidence.

### F12 — Accepted outcome; corrected rationale

The spec now resolves the exclude file using
`git rev-parse --git-path info/exclude` and verifies a representative path with
`git check-ignore --quiet --no-index`. `start` fails before mutation with
`APR_SCRATCH_NOT_IGNORED` when Git cannot prove the ignore rule.

In this linked worktree, the resolution command returns the main/common path
`/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.git/info/exclude`; it is not
worktree-private. The design therefore avoids asserting either layout and treats
Git's resolved path as authority.

### F13 — Accepted

The first reviewer turn now reads `reviewer-invitation.md` plus the artifact;
later turns additionally read the preceding author response and frozen
supplements.

### F14 — Accepted

Set the runtime floor to Node.js 22. Phase 1 targets zero third-party runtime
dependencies. Phase 2 may add the official MCP SDK only if needed, with a
documented necessity, license check, security audit, and packed-size impact for
every runtime dependency.

### F15 — Accepted

The CLI now injects `--no-artifact-change --reason` into the author response's
`Declined changes and rationale` section before sealing, making the receipt for
the unchanged artifact visible to the reviewer.

### Optional naming and testing suggestions — Accepted

Changed `commit_mode` to `normal | no-commit`, defined `APR_*` as
`ai-peer-review`, and added an explicit dirty-tree test with unrelated staged and
unstaged changes.

## Changes made

- Added explicit ported-versus-greenfield scope and two release phases.
- Restored budgets, continuation, supplements, and good-enough outcomes.
- Added configurable review path templates and AITM's exact host configuration.
- Clarified exact-path commit behavior and reviewer-visible no-change receipts.
- Separated stable provenance from live process claims.
- Preserved applicable archive integrity and collision-recovery behavior.
- Assigned cross-worktree occupancy to AITM rather than the standalone package.
- Made scratch ignore verification Git-resolved and fail-closed.
- Added the first-turn read contract, Node floor, and runtime dependency budget.
- Added explicit Apache relicensing authority, historical-tree treatment, and
  commercial-license consequences.
- Split Phase 1 and Phase 2 acceptance criteria.

## Declined changes and rationale

No requested outcome was declined.

The only technical correction is to F12's statement that `.git/info/exclude` is
per-worktree. Current Git in this linked worktree resolves it to the common Git
directory. The revised design adopts the more portable rule—ask Git for the path
and then prove the candidate is ignored—so it does not depend on either physical
layout.

## Verification

- Confirmed the cited budget, continuation, good-enough, supplement, claim PID,
  wait, archive, and index behavior in `scripts/review/**`.
- Confirmed the issue-first convention in
  `docs/superpowers/reviews/README.md`.
- Confirmed at source commit
  `4b3bcd43cba141a611da4a2b861433b915462806` that `scripts/review/**` has one
  copyright holder under two email identities and the repository has the same
  holder under three email identities.
- Confirmed AITM's AGPL/commercial posture from `package.json`, `NOTICE`, and
  `LICENSE-COMMERCIAL` at the source commit.
- Checked Apache's official application guidance and Apache License 2.0 text;
  the spec retains the explicit warning that it is not legal advice.
- `npx prettier --check docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
  — passed.
- `npx cspell --no-progress docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
  — passed.
- `npx markdownlint-cli2 docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
  — passed with zero issues.
- `npm run lint:doc-anchors` — passed with 38 anchors across 3 documents.
- `git diff --check -- docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
  — passed before commit.
- Commit `bee7b49ec470f9270d8a0ee02c4df535d30ab08e` contains only the revised spec.
