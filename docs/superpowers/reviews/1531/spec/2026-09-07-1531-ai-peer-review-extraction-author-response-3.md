# Author Response — AI Peer Review Extraction Design (Round 3)

- **Artifact:** `docs/superpowers/specs/2026-09-07-1531-ai-peer-review-extraction-design.md`
- **Prior artifact commit:** `7ac4bcb07db988d473b892506b90d49f93a40a83`
- **Revised artifact commit:** `68de80b45b23c90874bac0fcd87cfa0c1980edd4`
- **Reviewer response:**
  `docs/superpowers/reviews/1531/spec/2026-09-07-1531-ai-peer-review-extraction-reviewer-response-3.md`
- **Author:** Codex
- **Reviewer:** Anthropic Claude Opus 5 (`claude-opus-5`), Claude Code
- **Round:** 3
- **Disposition:** `revised-for-review`

## Summary

I accepted S1 through S8. The revised design grades Human Authority by both the
signing boundary and the verifier-binding boundary, permits an ordinary
consensus review to start without a signing ceremony, and reserves signed grants
for actions that expand authority or override normal protocol limits.

The revision also gives reviewer findings a stable producer, completely defines
grant parameter canonicalization, freezes intervention revisions while a human
signs, and closes the optional recovery and Git-integrity gaps. No requested or
optional change was declined.

## Finding dispositions

### S1 — Accepted

Replaced the binary external-versus-test model with three explicit assurance
grades:

- prevention-grade authority through hardware user presence, a separate device,
  or an official host approval service outside the agent's usable boundary;
- detection-grade authority through a same-user software key, recorded as
  `cryptographic-local` with the residual forgery risk disclosed; and
- test-only authority restricted to no-commit mode.

The effective grade is now the weaker of the signer boundary and the verifier-
binding boundary. The default policy is `prevention-required`; a host may opt
into `detection-allowed`, but startup, status, protected events, human decisions,
and manifests must preserve the warning. The package records an adapter's
claimed isolation grade without asserting that it can independently prove
physical isolation.

### S2 — Accepted

Ordinary `start` is now grant-free. It pins the configured verifier, grade, and
policy, or records an unavailable authority for a consensus-only review. A
signed grant is required only for continuation, supplement registration,
acceptance over objections, and different-session participant replacement.

Added optional `start --bootstrap-grant <file>` for deployments that need
prevention-grade verifier pinning from the outset. The startup section now says
that the reviewer invitation is the only required peer-session relay in the
default consensus path; protected intervention and optional hardened bootstrap
add a relay only when used.

### S3 — Accepted

Added the required reviewer finding heading grammar
`R<reviewer-turn>-F<three-digit-sequence>`. The CLI rejects missing, duplicate,
or wrong-turn IDs and seals the ordered finding set into reviewer frontmatter.
Author dispositions reference those IDs, and human override evidence can now
name a defined producer rather than relying on informal prose.

### S4 — Accepted

Defined `ai-peer-review.grant-parameters/v1` canonical JSON: recursively sorted
object keys, NFC strings, canonical repository-relative POSIX paths, base-10 JSON
integers, explicit `null` for absent optionals, and order-preserving arrays.
Unknown, omitted, duplicate, or non-canonical fields are rejected.

Added the exact parameter set for `pin-verifier`, `continue`, `supplement`,
`accept-over-objections`, and `replace-participant`, including the artifact,
turn, finding, rationale, claim, and identity bindings appropriate to each
action.

### S5 — Accepted

While the protocol is in `intervention-required`, agent commands cannot advance
the protocol revision. Status, help, and challenge generation are revision-read-
only. A challenge binds the immutable intervention ID and revision and remains
valid until expiry, successful consumption, or a conflicting grant. Same-session
reclaim and abandonment are refused while an unexpired challenge exists, so an
agent cannot invalidate the human's in-flight authorization.

### S6 — Accepted

Set the Phase 1 claim TTL default to eight hours and fixed it at startup. The
same session fingerprint may reclaim its own role without a grant when no Human
Authority challenge is pending. Reclaim records the old and new claim IDs and
expiry as a non-revision-advancing audit event. A different fingerprint still
requires signed participant replacement.

### S7 — Accepted

Made abandonment grant-free for either registered participant during any
intervention, provided no unexpired Human Authority challenge is pending. It is
evidence-preserving and terminal: it records actor, reason, and retained paths;
releases only the package's destination reservation; emits status for a host to
release its own occupancy cache; creates no acceptance evidence; deletes
nothing; and cannot resume. Hosts may impose a stricter policy.

### S8 — Accepted

The normal-mode commit transaction now verifies that both index bytes and
working-tree bytes for every protocol-owned path match the sealed content before
the path-limited commit. Existing exact-path-set, trailer, sealed-hash, and
unrelated-index preservation checks remain required.

## Changes made

- Graded Human Authority as prevention, detection, or test-only and made the
  weaker signer/verifier boundary determine effective assurance.
- Made ordinary consensus startup grant-free while retaining optional hardened
  bootstrap and action-specific grants for protected mutations.
- Added stable reviewer finding IDs and sealed reviewer/author ID sets.
- Defined canonical grant parameter serialization and the parameters for each
  protected action.
- Froze protocol revisions and agent-driven terminal/recovery transitions while
  a Human Authority challenge is pending.
- Added an eight-hour claim TTL and grant-free, same-fingerprint reclaim.
- Made abandonment grant-free, evidence-preserving, and terminal by default.
- Required working-tree bytes as well as index bytes to match sealed commit
  inputs.
- Updated CLI syntax, lifecycle diagrams, tests, security language, and
  acceptance criteria to match these decisions.

## Declined changes and rationale

No requested or optional change was declined.

## Verification

- Read the complete Round 3 reviewer response and re-read the changed authority,
  startup, response-schema, lifecycle, Git, CLI, test, security, and acceptance
  sections.
- `npx prettier --check docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
  — passed.
- `npx cspell --no-progress docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
  — passed.
- `npx markdownlint-cli2 --no-globs docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
  — passed with zero issues.
- `npm run lint:doc-anchors` — passed with 38 anchors across 3 documents.
- `git diff --check -- docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
  — passed before commit.
- Commit `68de80b45b23c90874bac0fcd87cfa0c1980edd4` contains only the revised spec.
