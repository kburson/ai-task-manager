# Co-review finalization archive

This directory preserves the terminal evidence selected by the governed co-review protocol.
The accepted specification remains normative; the review and owner response are evidence.
Recover the accepted artifact with `git cat-file blob 623b7cb719ac4983220b3957e033fb2fc7d4728d`.

<!-- aitm-co-review-manifest:start -->
```json
{
  "schema": "aitm.co-review.archive/v1",
  "protocol": {
    "id": "8ad1e0b0-aa5e-41cb-b498-db0d341cb3b7",
    "schema": "aitm.co-review/v1"
  },
  "artifact": {
    "mode": "reference",
    "sourcePath": "docs/superpowers/plans/2026-08-22-939-governed-pr-delivery.md",
    "acceptedCommit": "54b0fcaa7e33cd2f2f03855c1d8969464b0d35fc",
    "gitBlob": "623b7cb719ac4983220b3957e033fb2fc7d4728d",
    "sha256": "sha256:72ff17a0b0d4ff62b92d6bbf0296eafc935ed0424865eb0294c2d230896d716e"
  },
  "participants": {
    "owner": "codex",
    "reviewer": "claude"
  },
  "decision": {
    "lifecycle": "accepted",
    "basis": "reviewer-consensus",
    "at": "2026-08-22T13:29:13.787Z",
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
      "sourcePath": ".tmp/co-review/939-governed-pr-delivery-plan-1/round-3-owner-response.md",
      "sourceSha256": "sha256:79c1da596142b65ddfdba44bfa3cdd5df2244bd2526ef9eb667e412e94eb16d5",
      "archivePath": "2026-08-22-939-governed-pr-delivery-r5-owner-codex-response.md",
      "archivedSha256": "sha256:79c1da596142b65ddfdba44bfa3cdd5df2244bd2526ef9eb667e412e94eb16d5"
    },
    "reviewerReview": {
      "identity": "claude",
      "eventRound": 5,
      "sourcePath": ".tmp/co-review/939-governed-pr-delivery-plan-1/round-4-reviewer-review.md",
      "sourceSha256": "sha256:3543ed7997a462264378a9ae2aaa1c222a1c56beff89d282a222d83e7fb808d3",
      "archivePath": "2026-08-22-939-governed-pr-delivery-r5-reviewer-claude-review.md",
      "archivedSha256": "sha256:3543ed7997a462264378a9ae2aaa1c222a1c56beff89d282a222d83e7fb808d3"
    }
  },
  "normative": "The accepted artifact remains normative; the archived review and owner response are evidence."
}
```
<!-- aitm-co-review-manifest:end -->
