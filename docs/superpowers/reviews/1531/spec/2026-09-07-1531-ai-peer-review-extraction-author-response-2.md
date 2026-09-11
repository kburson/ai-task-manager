# Author Response — AI Peer Review Extraction Design (Round 2)

- **Artifact:** `docs/superpowers/specs/2026-09-07-1531-ai-peer-review-extraction-design.md`
- **Prior artifact commit:** `bee7b49ec470f9270d8a0ee02c4df535d30ab08e`
- **Revised artifact commit:** `7ac4bcb07db988d473b892506b90d49f93a40a83`
- **Reviewer response:**
  `docs/superpowers/reviews/1531/spec/2026-09-07-1531-ai-peer-review-extraction-reviewer-response-2.md`
- **Author:** Codex
- **Reviewer:** Anthropic Claude Opus 5 (`claude-opus-5`), Claude Code
- **Round:** 2
- **Disposition:** `revised-for-review`

## Summary

I accepted R1 through R4 and all three optional suggestions. The main design
choice is a one-time out-of-band signed capability for every human-gated action.
This treats the agent under review as capable of invoking arbitrary CLI commands
and therefore rejects TTY presence, `gh` login, self-declared identity, and
agent-readable keys as proof of current human authorization.

The revision also limits Phase 1 to honest TTL-based claim staleness, reserves
heartbeat-backed liveness for Phase 2 resident adapters, spells out the exact
stage-then-path-limited-commit transaction, defines durable human-decision
collateral, and clarifies supplement retention.

## Finding dispositions

### R1 — Accepted

Added a Human Authority section with the agent under review explicitly inside
the threat model. Normal mode now requires a bootstrap grant for `start` and an
action-specific grant for continuation, supplement registration, good-enough
finalization, participant replacement, and abandonment.

The CLI emits a canonical challenge bound to review/start nonce, protocol
revision, action, parameter digest, random nonce, and expiry. A separate trusted
boundary either signs it with a private key unavailable to the agent or returns
an official host-signed approval receipt. The protocol pins the public verifier
at bootstrap, consumes each nonce atomically, and rejects replay, expiry,
cross-review, cross-revision, signer, or parameter mismatches.

Attestation records now include source, strength, signer identity, verifier
fingerprint, challenge digest, and verification time. Only
`cryptographic-external` and `host-verified` grants are valid in normal mode.
`unverified-test` is limited to no-commit mode and remains visibly non-durable.
There is no `--approved-by` or GitHub-login-only fallback.

### R2 — Accepted

Phase 1 claims now record the CLI PID only as a forensic breadcrumb. With no
resident process, they use a configured TTL to derive `stale-claim` intervention;
they make no process-liveness claim and never release or steal a stale claim.

Phase 2 defines the resident adapter contract: process-instance ID, PID or
official opaque process handle, host, observation time, lease expiry, and
heartbeat refresh by the resident MCP/host component. The core never infers
liveness from PID alone. Generic `other` adapters remain `staleness-only` unless
they implement and test the resident contract. Acceptance criteria and tests are
split accordingly.

### R3 — Accepted

Defined the normal-mode transaction explicitly:

1. snapshot unrelated staged entries and refuse owned-path overlap;
2. stage exactly the protocol-owned triad;
3. verify staged bytes and unrelated-index preservation;
4. run a path-limited `git commit --only`;
5. verify the commit's exact changed-path set; and
6. prove unrelated entries retain their object IDs and remain staged and
   uncommitted.

The same mechanics now cover acceptance and good-enough finalization. The
no-staging invariant is explicitly scoped to no-commit mode. The dirty-tree test
must prove unrelated staged content is still staged and uncommitted afterward.

### R4 — Accepted

Added `human-decision.md` to review-scoped output and a qualified equivalent for
shared destinations. Added a package template and
`ai-peer-review.human-decision/v1` frontmatter containing the artifact identity,
unresolved response/finding IDs, exact human attestation, and decision time. Its
prose records the rationale and unresolved findings being overridden.

Supplements now have a stated canonical home under the review's ignored scratch
workspace. The manifest records each supplement's ID, digest, target role/turn,
registering attestation, acknowledgment response, and explicit
`content_retention: scratch-only`; content is not silently promoted into tracked
collateral.

### R5 — Accepted

The lifecycle now shows both `stale-claim`/`participant-loss` entry and signed
participant-replacement exit. Added a signed `abandoned` terminal transition for
any intervention reason. It retains all files, releases only the package's
destination reservation, emits terminal status for host-owned occupancy, creates
no acceptance evidence, and cannot resume.

### R6 — Accepted

Phase 1 `doctor` reports MCP, resident-liveness, long-timeout, and
automatic-required rows as `not-installed (Phase 2 optional)` without failing
manual/resume-only health. They become active checks in Phase 2. The Testing
Strategy is now partitioned into Phase 1 and Phase 2 suites.

### R7 — Accepted

Review-scoped directories now use short local names such as
`reviewer-response-<turn>.md`. Only shared destinations, including AITM's
`<issue>/<kind>` layout, use the fully qualified collision-resistant prefix.

## Changes made

- Added the adversarial-agent Human Authority threat model and signed-grant
  protocol.
- Added bootstrap verifier pinning, grant replay protection, attestation strength,
  and a no-commit-only test authority.
- Replaced Phase 1 liveness claims with TTL-based staleness detection.
- Defined the Phase 2 resident adapter and heartbeat lease contract.
- Added explicit staging, path-limited commit, post-commit tree, and index
  preservation checks.
- Added a good-enough human-decision filename, template, schema, and required
  unresolved-finding evidence.
- Located supplements in scratch and made their manifest retention metadata
  explicit.
- Added participant-loss lifecycle edges and terminal abandonment.
- Partitioned doctor output and tests by release phase.
- Removed redundant identifiers from filenames inside review-scoped directories.

## Declined changes and rationale

No requested or optional change was declined.

## Verification

- Read the complete Round 2 reviewer response and re-read all affected spec
  sections.
- Confirmed the current `gh api user` identity adapter, deprecated/ignored
  `--approved-by`, supplement intervention gate, and CLI-PID claim behavior in
  `scripts/review/**`.
- Confirmed Git's `--only` commit mode and incorporated the reviewer's empirical
  untracked-file result into the required stage-first sequence.
- `npx prettier --check docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
  — passed.
- `npx cspell --no-progress docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
  — passed.
- `npx markdownlint-cli2 docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
  — passed with zero issues.
- `npm run lint:doc-anchors` — passed with 38 anchors across 3 documents.
- `git diff --check -- docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
  — passed before commit.
- Commit `7ac4bcb07db988d473b892506b90d49f93a40a83` contains only the revised spec.
