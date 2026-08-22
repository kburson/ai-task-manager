# Reviewer Review — Round 4 (reviewer: claude)

**Artifact:** `docs/superpowers/specs/2026-08-21-1374-co-review-archive-collision-recovery-design.md`
**Reviewed commit:** `dcb00adfbd4eb17060e611d5c551f2c19fe1a6b6`
**Blob sha256:** `25815dda5f5ac39bd542f0b4eeffe2d7dc8455dfb08e59268d6b23973c39b1a0` (verified against reviewed head)
**Answered response:** `round-3-owner-response.md`
**Decision:** accepted

This is an independent re-review of the revised design against the four findings I
raised in round 2. I read the owner response and verified each claimed change against
the committed artifact text rather than accepting the disposition labels at face value.

## Disposition verification

### [finding:F-001] Resolved

The re-render byte-identity gate is gone. Section 2's proof now reads "validate the
required v1 manifest fields while tolerating documented optional v1 fields" (step 5),
and a new paragraph states plainly that "Foreign eligibility does not re-render the old
manifest with the current serializer," authenticating instead via recorded structure
plus self-recorded file digests, "compatible with valid legacy v1 archives whose JSON
key order, whitespace, escaping, or optional fields differ from the current renderer."
Digest disagreement and unsupported schema versions still fail closed, and Test Plan
case 9 pins the legacy-whitespace/key-order recoverability. This removes the failure
mode where the feature's own validation could refuse exactly the legacy archives Goal 2
must recover. Fully addressed.

### [finding:F-002] Resolved

Section 4 now specifies `recovery` as an optional, version-tolerated v1 field, "absent —
not `null` — for ordinary archives," "appended after the existing `normative` key without
reordering any existing manifest keys," with its own keys "emitted in the fixed order
shown," and requires "all v1 readers and validators [to] tolerate this optional object
while continuing to require the existing v1 fields." That is exactly the byte-safety and
version-compatibility contract the round-2 finding asked for: ordinary archives re-render
unchanged, and a recovered archive's own README survives idempotent-retry inspection.
Fully addressed.

### [finding:F-003] Resolved

The response correctly declines to relocate or edit the immutable primary archive (that
would violate the Non-Goals) and instead records provenance. The recovered manifest adds
`occupiedAcceptedAt` and a derived `relationship`
(`newer-than-occupied` / `older-than-occupied` / `same-time-as-occupied`) computed from
`decision.at`, and Section 4's prose plus the Documentation section now state that the
canonical `<issue>/<kind>` path is the first-published archive "not necessarily the newest
accepted design," directing readers to compare `decision.at`. This resolves the round-2
concern that the directory name silently understates a superseding sibling, without
touching immutable evidence. Addressed; I accept the recency-via-metadata approach as the
correct one given the immutability constraint.

### [finding:F-004] Resolved

Section 1 now draws the boundary precisely: "The parent `<issue>/` directory may already
exist; only the derived `<spec|plan>` leaf is reserved," and the empty-leaf case
"deliberately refuses rather than being treated as absent," with a stated rationale
(atomic rename requires an absent leaf; accepting defers the conflict, removing destroys
unexplained state) and a distinguished refusal so the host can investigate via governed
cleanup. This is a deliberate, well-justified decision on the exact ambiguity I flagged.
Addressed.

## Note on decision

All four findings are resolved against the committed text, the substantive one (F-001)
completely, and no revision introduced a new defect: the added `recovery` metadata is
strictly additive and version-guarded, and the occupancy and recency decisions are
consistent with the design's own Non-Goals and fail-closed posture. The design is
complete and internally consistent. Decision: accepted.
