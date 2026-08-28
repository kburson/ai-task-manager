# Co-review finalization archive

This directory preserves the terminal evidence selected by the governed co-review protocol.
The accepted specification remains normative; the review and owner response are evidence.
Recover the accepted artifact with `git cat-file blob cfcd182fedca486fcbcc075145ce0c520e1e9095`.

<!-- aitm-co-review-manifest:start -->
```json
{
  "schema": "aitm.co-review.archive/v1",
  "protocol": {
    "id": "02e120c9-2c45-4076-9fad-2ebf132852f6",
    "schema": "aitm.co-review/v1"
  },
  "artifact": {
    "mode": "reference",
    "sourcePath": "docs/superpowers/specs/2026-08-23-1381-governed-delivery-convergence-design.md",
    "acceptedCommit": "bc079275f96e1c01e78b41127809c00e349c2426",
    "gitBlob": "cfcd182fedca486fcbcc075145ce0c520e1e9095",
    "sha256": "sha256:3e25714d06d13c5eda2b34a5f7de9a533c1bb0b886379a7cc151217e9845814e"
  },
  "participants": {
    "owner": "codex",
    "reviewer": "claude"
  },
  "decision": {
    "lifecycle": "accepted",
    "basis": "reviewer-consensus",
    "at": "2026-08-23T12:59:06.282Z",
    "reviewer": "claude"
  },
  "budget": {
    "reviewTurnsUsed": 1,
    "maxReviewTurns": 10,
    "remainingReviewTurns": 9
  },
  "evidence": {
    "pairRound": 3,
    "ownerResponse": {
      "identity": "codex",
      "eventRound": 2,
      "sourcePath": ".tmp/co-review/2026-08-23-1381-governed-delivery-convergence-spec-claude-1/round-1-author-response.md",
      "sourceSha256": "sha256:a0e4aa015c6f062f44fc5de057c5aa2d5daae9868bb4872954bf921f2332d799",
      "archivePath": "2026-08-23-1381-governed-delivery-convergence-design-r3-owner-codex-response.md",
      "archivedSha256": "sha256:a0e4aa015c6f062f44fc5de057c5aa2d5daae9868bb4872954bf921f2332d799"
    },
    "reviewerReview": {
      "identity": "claude",
      "eventRound": 3,
      "sourcePath": ".tmp/co-review/2026-08-23-1381-governed-delivery-convergence-spec-claude-1/round-2-reviewer-review.md",
      "sourceSha256": "sha256:d99b852fe43dfcb72dbf865e9ba94e571c7d386f11815810e6ac97aa49f4ab31",
      "archivePath": "2026-08-23-1381-governed-delivery-convergence-design-r3-reviewer-claude-review.md",
      "archivedSha256": "sha256:d99b852fe43dfcb72dbf865e9ba94e571c7d386f11815810e6ac97aa49f4ab31"
    }
  },
  "normative": "The accepted artifact remains normative; the archived review and owner response are evidence."
}
```
<!-- aitm-co-review-manifest:end -->
