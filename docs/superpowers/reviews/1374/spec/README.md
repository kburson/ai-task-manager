# Co-review finalization archive

This directory preserves the terminal evidence selected by the governed co-review protocol.
The accepted specification remains normative; the review and owner response are evidence.
Recover the accepted artifact with `git cat-file blob bc814030ea59b454b64284035b60f561f1952eed`.

<!-- aitm-co-review-manifest:start -->
```json
{
  "schema": "aitm.co-review.archive/v1",
  "protocol": {
    "id": "1153b2ee-3c5c-436c-8c3b-6623df765149",
    "schema": "aitm.co-review/v1"
  },
  "artifact": {
    "mode": "reference",
    "sourcePath": "docs/superpowers/specs/2026-08-21-1374-co-review-archive-collision-recovery-design.md",
    "acceptedCommit": "dcb00adfbd4eb17060e611d5c551f2c19fe1a6b6",
    "gitBlob": "bc814030ea59b454b64284035b60f561f1952eed",
    "sha256": "sha256:25815dda5f5ac39bd542f0b4eeffe2d7dc8455dfb08e59268d6b23973c39b1a0"
  },
  "participants": {
    "owner": "codex",
    "reviewer": "claude"
  },
  "decision": {
    "lifecycle": "accepted",
    "basis": "reviewer-consensus",
    "at": "2026-08-22T03:07:12.565Z",
    "reviewer": "claude"
  },
  "budget": {
    "reviewTurnsUsed": 2,
    "maxReviewTurns": 10,
    "remainingReviewTurns": 8
  },
  "evidence": {
    "pairRound": 5,
    "ownerResponse": {
      "identity": "codex",
      "eventRound": 4,
      "sourcePath": ".tmp/co-review/2026-08-21-1374-co-review-archive-collision-recovery-design-294508a7-971d-46ee-8015-1e63730ccea2/round-3-owner-response.md",
      "sourceSha256": "sha256:b345f83dfa9bcd158acd1bf361b8accc1d1305caaaeb9f5096da8d51aa247bfc",
      "archivePath": "2026-08-21-1374-co-review-archive-collision-recovery-design-r5-owner-codex-response.md",
      "archivedSha256": "sha256:b345f83dfa9bcd158acd1bf361b8accc1d1305caaaeb9f5096da8d51aa247bfc"
    },
    "reviewerReview": {
      "identity": "claude",
      "eventRound": 5,
      "sourcePath": ".tmp/co-review/2026-08-21-1374-co-review-archive-collision-recovery-design-294508a7-971d-46ee-8015-1e63730ccea2/round-4-reviewer-review.md",
      "sourceSha256": "sha256:37b4e8f1053c3a93c9616e8633e755d321465f6fa121eb13e1a57b3cc6c77952",
      "archivePath": "2026-08-21-1374-co-review-archive-collision-recovery-design-r5-reviewer-claude-review.md",
      "archivedSha256": "sha256:37b4e8f1053c3a93c9616e8633e755d321465f6fa121eb13e1a57b3cc6c77952"
    }
  },
  "normative": "The accepted artifact remains normative; the archived review and owner response are evidence."
}
```
<!-- aitm-co-review-manifest:end -->
