# Co-review finalization archive

This directory preserves the terminal evidence selected by the governed co-review protocol.
The accepted specification remains normative; the review and owner response are evidence.
Recover the accepted artifact with `git cat-file blob 0587019ee53088b3ee7071d7f68403ba51f6bc3f`.

<!-- aitm-co-review-manifest:start -->
```json
{
  "schema": "aitm.co-review.archive/v1",
  "protocol": {
    "id": "16e1264e-58e4-4912-9a7b-951c16f5b5ae",
    "schema": "aitm.co-review/v1"
  },
  "artifact": {
    "mode": "reference",
    "sourcePath": "docs/superpowers/plans/2026-08-19-test-corpus-membership-registry.md",
    "acceptedCommit": "38584163a7430cad0e5c70cdb7e56b4aa139aa17",
    "gitBlob": "0587019ee53088b3ee7071d7f68403ba51f6bc3f",
    "sha256": "sha256:c4c42dcd355b23c580b22fa2f86cf38aa8aea21233bede3583d05eceb6f73b12"
  },
  "participants": {
    "owner": "codex",
    "reviewer": "grok"
  },
  "decision": {
    "lifecycle": "accepted",
    "basis": "reviewer-consensus",
    "at": "2026-08-19T19:07:22.141Z",
    "reviewer": "grok"
  },
  "budget": {
    "reviewTurnsUsed": 2,
    "maxReviewTurns": 12,
    "remainingReviewTurns": 10
  },
  "evidence": {
    "pairRound": 5,
    "ownerResponse": {
      "identity": "codex",
      "eventRound": 4,
      "sourcePath": ".tmp/co-review/2026-08-19-1263-test-corpus-registry-plan-grok/round-3-author-response.md",
      "sourceSha256": "sha256:6471857493e5c0439f94ca49af3150fe32a49f69c5fa9d35fe467034c2ef5dad",
      "archivePath": "2026-08-19-test-corpus-membership-registry-r5-owner-codex-response.md",
      "archivedSha256": "sha256:6471857493e5c0439f94ca49af3150fe32a49f69c5fa9d35fe467034c2ef5dad"
    },
    "reviewerReview": {
      "identity": "grok",
      "eventRound": 5,
      "sourcePath": ".tmp/co-review/2026-08-19-1263-test-corpus-registry-plan-grok/round-4-reviewer-review.md",
      "sourceSha256": "sha256:aad41d33094ad5ed7302959e69d22d2d6f1dcceb78ab43f1484b1888a877ceb4",
      "archivePath": "2026-08-19-test-corpus-membership-registry-r5-reviewer-grok-review.md",
      "archivedSha256": "sha256:aad41d33094ad5ed7302959e69d22d2d6f1dcceb78ab43f1484b1888a877ceb4"
    }
  },
  "normative": "The accepted artifact remains normative; the archived review and owner response are evidence."
}
```
<!-- aitm-co-review-manifest:end -->
