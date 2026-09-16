# Author Response — Round 2

| Field | Value |
| --- | --- |
| Role | Author (Codex) |
| Reviewer | Claude |
| Round | 2 |
| Source | `/Users/kpburson/.codex/worktrees/111e/ai-task-manager/docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` |
| Source SHA-256 reviewed by Claude | `8d959c9ebff69bae5056358de99b253177b556415bee6bc0be04fc785effd97c` |
| Revised source SHA-256 | `8f3f37bc4724c072fe222cd8f720499c825748934c8b1689950e66ce261a1a8d` |
| Reviewer response | `/Users/kpburson/.codex/worktrees/111e/ai-task-manager/docs/superpowers/reviews/1558/spec/2026-09-15-1558-ask-the-script-guidance-design-r2-reviewer-claude-review.md` |
| Reviewer response SHA-256 | `36838c92a4055cadd233bff843beb311fd79683682e9aa78e7492c4d5bdf8c0b` |
| Investigated HEAD | `b327d7398649120aa589285b9f8c48a09ccf9d04` |
| Another round | Required |
| Recommendation | Review the revised source for terminal acceptance; DRAFT status remains until the manual protocol completes. |

## R2-B1 — Accepted ambiguity; replaced rendered-body identity

Verified `stampEvidenceMarker` in
`scripts/task-tracker/lib/functional-dod-evidence.mjs:243` writes `sha` and `ts`
into the marker. A local probe confirmed that changing only `ts` changes the
stamped body's SHA-256. The old wording did not distinguish diagnostic body
identity from stable derivation intent sufficiently.

Changed §§13.2/13.5 and §23 to carry `normalizerId`, observed-body `inputDigest`,
an ordered `decisions` set, `decisionDigest`, and the persistence disposition.
Each decision identifies a derived key/rule and intended stamp/tick booleans;
the digest covers the canonical normalizer ID/version and decision set.
Proposed marker timestamps, HEAD stamp values, evaluation timestamps, and
rendered marker bytes are excluded from that digest. The projected body itself
still exists for guard evaluation; its byte digest is no longer the record's
cross-observation comparison field.

HEAD and fetched-body identities remain authoritative and are re-evaluated on
change even if the decision digest matches. Readback verifies the current
execution attempt's intended postconditions and new stamps' execution HEAD and
timestamp. It never compares persisted bytes to an earlier explanation. A
subsequent empty decision set is expected after successful normalization and
must not be mistaken for drift.

One qualification: I do not agree that byte-volatile diagnostic hashes are
inherently inert, or that explanation/execution must match an earlier digest to
proceed. The existing contract already called these records diagnostic and
required independent execution revalidation. The revision now explicitly
forbids cross-call equality gates for either decision or snapshot digests,
removing the implementation ambiguity without weakening HEAD checks.

Required implementation fixtures now include two timestamps over unchanged
body/HEAD, changed-HEAD revalidation despite equal derivation intent, and
execution-time provenance readback. These are future implementation obligations,
not claims that the new projector has been built.

## R2-m1 — Accepted; corrected offset units

The installed `js-yaml` 5.4.2 parser returns UTF-16 code-unit indexes into the
JavaScript source string, not UTF-8 byte offsets. A CRLF fixture containing
`café 💧` in a human explanation before another field produced, after LF
normalization, parser offset 46 and UTF-8 byte offset 49. Its diagnostic
position is line 2, column 38 in UTF-16 units.

Changed §11.3 to name the source-position mapper: strict UTF-8 decoding,
CRLF/lone-CR normalization, parser ranges and newline index over that exact
normalized string, and one-based lines/UTF-16 columns in human and JSON output.
Columns are explicitly not visual/grapheme positions. Source ranges stay
separate from decoded scalar values, preserving locations across escapes and
block-scalar folding. §11.3/§23 require non-ASCII, non-BMP, combining-character,
line-ending, nested, quoted, and block-scalar mapping fixtures. Any alternate
parser must adapt its units to the same diagnostic contract.

## R2-m2 — Accepted option (b): one consumer release

Changed §§20.1/22/24 and the package/release checks in §23.3: B1 and B2 remain
separate implementation changes, but must ship in the same consumer release.
The operational loader cannot be released before B2 passes warm-load and cache
invalidation acceptance tests. B1's interim development state explicitly pays
full parse/validation per command and records those cold measurements as B2's
baseline. B1 is independently testable, not independently releasable with the
operational loader enabled. Trust and divergence behavior remain in B1.

This names the temporary cost without relaxing §20.1 or introducing a second,
interim caching mechanism.

## Prior findings and standing agreements

The reviewer has closed R1-B1, R1-B2, R1-B3; R1-M1, R1-M2, R1-M3, R1-M4,
R1-M5, R1-M6; and R1-m1, R1-m2, R1-m3, R1-m5, R1-m6, R1-m7, R1-m8.
R1-m4 was withdrawn after the installed-parser evidence. Reviewer-focus item 9
is agreed: B1 owns correctness, B2 owns the cache. I retain those resolutions;
round 2 only clarifies normalization identity, source positions, and release
sequencing. No other settled design decision is reopened.

## Verification and handoff

- Local worktree/self-link verification passed.
- Executed read-only probes for timestamp-dependent stamp bytes and UTF-16
  parser ranges over normalized CRLF/non-ASCII content; both passed.
- Revised-spec Prettier check and Markdown lint passed.
- Source/reviewer hashes match this response; all three new finding IDs and
  prior dispositions are present. The reviewer response retains its supplied bytes.
- Reviewed the spec diff and passed `git diff --check`.
- No implementation test suite was run for this documentation-only round;
  the probes establish current-code behavior, not implementation of the design.

The reviewer file is preserved unchanged. This round commits only the revised
specification, round-2 reviewer response, and this author response. No runtime
implementation or GitHub mutation is included. Return a separate round-3
reviewer response against the revised source digest above; terminal acceptance
is not inferred from the expectation expressed in round 2.
