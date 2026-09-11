# Author Response 1 — AI Peer Review Extraction Implementation Plan

- **Reviewer response:**
  `docs/superpowers/reviews/1531/plan/2026-09-07-1531-ai-peer-review-extraction-reviewer-response-1.md`
- **Prior plan commit:** `078d751f5b6a5f387e70979de5391a98c09c1ee2`
- **Revised plan commit:** `f7183cdf8c6e897d05b54fe878dd5d7be9b14e8a`
- **Disposition:** all required and optional findings accepted

## Summary

The implementation plan now closes all eleven required defects and all nine
optional consistency/hardening findings. The revision preserves Phase 1
independence, post-release AITM migration, Phase 2 isolation and compatibility,
the weaker-boundary Human Authority rule, exact-path Git index preservation, and
the human relicensing/publication gates.

## Finding dispositions

### R1-F001 — Accepted

Scoped filtered-history verification to a recorded `filtered_history_tip`, the
rewritten source tip and parent of the first standalone bootstrap commit. This
avoids the self-reference of storing a commit's own SHA inside itself. Added a
separate current-HEAD standalone-layout allowlist and exact retained path rules,
including the three narrow co-review globs.

### R1-F002 — Accepted

Pinned the clone to one `extraction-source` ref at the ratified source SHA,
deleted all other branch, remote-tracking, and tag refs, expired reflogs, and
required exact pre-filter and post-filter ref assertions.

### R1-F003 — Accepted

Expanded the contributor audit to every retained path. The exact argv,
normalized result, retained-path inventory, and their digests are now durable
manifest evidence.

### R1-F004 — Accepted

Separated revision advancement from lifecycle-state change. Same-session reclaim
and signed participant replacement now restore the interrupted author/reviewer
role state from intervention, with challenge-freeze and negative retry coverage.

### R1-F005 — Accepted

Added one complete frozen per-command flag catalog, positional/per-action
constraints, repeatability rules, numeric validation, and Phase 1 rejection of
automatic-required mode.

### R1-F006 — Accepted

Task 15 now requires a real governed AITM issue without inventing its ID, binds
that issue, uses `[#${APR_AITM_ISSUE}]` commit attribution, and follows AITM's
iteration, exact-SHA finalization, and Test transition contracts.

### R1-F007 — Accepted

Selected Gitleaks Git-history scanning with a repository-owned configuration and
redacted report. Extraction and release verification now fail closed on missing
or failed scan evidence, empty/changed contributor evidence, or a missing
relicensing digest.

### R1-F008 — Accepted

Added an event-built `test/helpers/review-fixture.mjs` in Task 4 and made Tasks
6, 7, 9, 10, and 11 consume it. Task 7 now consumes event authority. Task 12 now
defines every helper used by its finalization sketch.

### R1-F009 — Accepted

Defined non-overlapping npm test scripts, including `test:golden`, `test:smoke`,
and `test:mcp`. Phase gates and CI now use the same named scripts, and Phase 1
does not run MCP tests.

### R1-F010 — Accepted

Added `--no-artifact-change --reason` to the parser catalog and help syntax, with
cross-validation that every catalog flag has exactly one owning help topic.

### R1-F011 — Accepted

Added `docs/spdx-policy.md`, explicit removal of `LICENSE-COMMERCIAL` from
publishable HEAD, and tested NOTICE/README disclosure of the historical
AGPL/commercial versus standalone Apache-2.0 boundary.

### R1-F012 — Accepted

Added `src/cli/run.mjs` to Task 2 ownership and made the dispatch composition
root an explicit serialization point for task execution.

### R1-F013 — Accepted

Added explicit golden coverage for all ratified help forms, including `--all`,
search, JSON help, JSON status, and next-action status.

### R1-F014 — Accepted

Finding-ID parsing now explicitly spans both Findings and Optional suggestions
as one ordered sequence, including human-override coverage for optional IDs.

### R1-F015 — Accepted

Conformed to the ratified layout: top-level `templates/*.md` remain package data
and `src/templates/index.mjs` is their sole runtime loader/hydrator.

### R1-F016 — Accepted

Replaced directory-wide staging commands with enumerated task-owned paths. The
intentional legacy-runtime deletion uses a path-limited `git add -A --
scripts/review`.

### R1-F017 — Accepted

Marked `ai-peer-review.grant-parameters/v1\n` as an explicit reviewed domain-
separation prefix included in the hashed canonical bytes and pinned it in every
golden vector.

### R1-F018 — Accepted

Split the post-`0.2.x` AITM dependency update into Task 18 with exact files,
Phase 1 compatibility tests, a separately governed issue, attributed commit,
and AITM verification gates. Task 17 now reruns the release verifier before any
AITM change.

### R1-F019 — Accepted

Kept Node 22 across Ubuntu, macOS, and Windows and added Ubuntu `lts/*` and
`current` compatibility jobs.

### R1-F020 — Accepted

Added a cross-artifact golden rule that zero-install commands use only
`npx ai-peer-review` and that every `npx peer-review` occurrence is explicitly
qualified by confirmed local installation.

## Changes made

- Reworked Task 1 extraction provenance, ref pinning, contributor/secret scans,
  historical licensing disclosure, and verification boundaries.
- Completed the CLI grammar and named test-lane contracts.
- Corrected recovery lifecycle transitions and added event-built test fixtures.
- Closed response/help/finding-ID/interface ownership gaps.
- Hardened exact-path staging throughout the plan.
- Added explicit release compatibility matrices and a governed Phase 2 AITM
  upgrade task.

## Declined changes and rationale

None.

## Further discussion

None required. For R1-F001, the revised post-filter source-tip boundary provides
the requested scoping without an impossible commit-SHA self-reference.

## Verification

- Prettier: pass.
- cspell: pass, 0 issues.
- markdownlint: pass, 0 issues.
- Documentation-anchor lint: pass, 38 anchors clean.
- Placeholder scan: pass, no matches.
- Spec coverage: pass; all 21 Phase 1 and 6 Phase 2 acceptance criteria were
  recounted, every normative spec area remains mapped, and all six protected
  invariants were found in the revised plan.
- Interface/type consistency: pass; 117 create owners were unique and all 53
  declared/called interface symbols were present.
- `git diff --check`: pass.
- Ratified specification and reviewer response: unchanged.
- Staging audit before commit: exactly one staged path, the implementation plan;
  no reviewer response or unrelated path was staged.
- Commit audit: revised commit has parent
  `078d751f5b6a5f387e70979de5391a98c09c1ee2` and changes only the implementation
  plan.
