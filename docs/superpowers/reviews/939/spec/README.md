# Co-review finalization archive

This directory preserves the terminal evidence selected by the governed co-review protocol.
The accepted specification remains normative; the review and owner response are evidence.
Recover the accepted artifact with `git cat-file blob 039369eb29543570d9c970d7ff2a089cb0426f1e`.

<!-- aitm-co-review-manifest:start -->
```json
{
  "schema": "aitm.co-review.archive/v1",
  "protocol": {
    "id": "1dcbcbad-40c3-4810-8dbe-fd430ea29628",
    "schema": "aitm.co-review/v1"
  },
  "artifact": {
    "mode": "reference",
    "sourcePath": "docs/superpowers/specs/2026-08-21-939-governed-pr-delivery-design.md",
    "acceptedCommit": "31b14b4dd7e34224b2be6e24b8008d0231799088",
    "gitBlob": "039369eb29543570d9c970d7ff2a089cb0426f1e",
    "sha256": "sha256:8fcad35ab8f785b38a7b469bc07a5dff77313021bade61193ba17e0c24f50f44"
  },
  "participants": {
    "owner": "codex",
    "reviewer": "claude"
  },
  "decision": {
    "lifecycle": "accepted",
    "basis": "reviewer-consensus",
    "at": "2026-08-21T16:30:32.732Z",
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
      "sourcePath": ".tmp/co-review/939-governed-pr-delivery-design-2/round-1-author-response.md",
      "sourceSha256": "sha256:a2fb52feedc9a6471949ce250825609fb026d8223e539a17a408bb4925d23107",
      "archivePath": "2026-08-21-939-governed-pr-delivery-design-r3-owner-codex-response.md",
      "archivedSha256": "sha256:a2fb52feedc9a6471949ce250825609fb026d8223e539a17a408bb4925d23107"
    },
    "reviewerReview": {
      "identity": "claude",
      "eventRound": 3,
      "sourcePath": ".tmp/co-review/939-governed-pr-delivery-design-2/round-2-reviewer-review.md",
      "sourceSha256": "sha256:1f1757dab9f2c664f2158635d927ddfe6f3ce2531a3d1af5cb3be3d96611b724",
      "archivePath": "2026-08-21-939-governed-pr-delivery-design-r3-reviewer-claude-review.md",
      "archivedSha256": "sha256:1f1757dab9f2c664f2158635d927ddfe6f3ce2531a3d1af5cb3be3d96611b724"
    }
  },
  "normative": "The accepted artifact remains normative; the archived review and owner response are evidence."
}
```
<!-- aitm-co-review-manifest:end -->
